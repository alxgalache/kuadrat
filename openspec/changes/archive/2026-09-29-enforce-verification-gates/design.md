## Context

El código de verificación por email se añadió a eventos en `ef6a854` (06/03/2026) **encima** de un flujo en el que registrarse ya daba acceso. El paso nuevo se insertó entre el registro y el acceso, pero la credencial siguió naciendo en el registro. Sorteos y subastas se hicieron con el mismo molde. El resultado es idéntico en los tres: el servidor guarda «verificado» y nadie lo lee.

```
 HOY (eventos)                                   DESPUÉS
 ─────────────                                   ───────
 POST /register ── INSERT fila                   POST /register ── INSERT fila
      │            token_hash = sha(T)                │            token_hash = NULL
      └─▶ { accessToken: T } ──▶ localStorage         └─▶ { attendeeId }
 POST /send-verification                         POST /send-verification
 POST /verify-email ── email_verified = 1        POST /verify-email ── UPDATE condicional (aforo):
      (nadie lo lee)                                  email_verified = 1, token_hash = sha(T)
                                                      └─▶ { accessToken: T, paymentRequired }
 7 controles: token + pago                       7 controles: token de fila verificada + pago
 «Ya tienes acceso» = hay algo en localStorage   «Ya tienes acceso» = POST /session dice granted
```

Hallazgos que definen el alcance:

| # | Flujo | Defecto | Efecto |
|---|---|---|---|
| 1 | Eventos | El token se emite en `/register`, y `email_verified` no lo lee ningún control | Acceso a eventos gratuitos sin verificar el email |
| 2 | Eventos | `getAttendeeCount` cuenta filas sin verificar; `/register` no tiene limitador ni Zod | Se puede llenar el aforo con emails inventados |
| 3 | Eventos | `confirm-payment` acepta cualquier PaymentIntent completado y registra `event.price` | Acceso sin pagar; abonos al host sin dinero detrás |
| 4 | Subastas | `register-buyer` devuelve `id` + `bid_password` del comprador de un email ajeno; `/bid` solo pide el `id` | Pujas en nombre de otro, con cargo a su tarjeta |
| 5 | Sorteos y subastas | `confirm-payment` no mira el estado, los metadatos ni el cliente del SetupIntent | Pujas e inscripciones sin tarjeta |
| 6 | Sorteos | `enter` / `setup-payment` / `confirm-payment` no comprueban que el comprador sea del sorteo de la ruta | Inscribirse en el sorteo B con un comprador verificado en A |
| 7 | Eventos | El cliente trata una sesión guardada como acceso concedido | Callejón sin salida (ver «Sesiones caducadas») |
| 8 | Eventos | `verify-password` responde 401, y el manejador global cierra la sesión y redirige a `/` | Una contraseña mal escrita expulsa a la portada |
| 9 | Los tres | `Math.random` en códigos y contraseñas; sin tope de intentos en eventos; reenvío sin espera en el servidor | Robustez de la prueba |

No depende de ningún navegador: el defecto está en el servidor. Que no se reprodujera en Firefox se debió a que se reutilizó un email ya registrado (`isExisting` → sin token → nada guardado).

## Goals / Non-Goals

**Goals:**
- Ninguna credencial (token de asistente, identidad de comprador) existe antes de la prueba de propiedad del email, y ningún control la acepta sin ella.
- Un solo punto de autenticación por token de asistente, que un control futuro no pueda saltarse.
- Cada objeto de Stripe que desbloquea algo se vincula a quien lo presenta y a lo que desbloquea.
- «Ya tienes acceso» es una afirmación del servidor, no del navegador.

**Non-Goals:**
- Revocar en caliente una sesión ya dentro de la sala: si el token se sustituye a mitad de directo, la sesión RTC sigue hasta que falle la renovación.
- Webhook de Stripe para pagos de eventos: la confirmación sigue dependiendo del cliente. Hoy no hay eventos de pago.
- Guardar como hash los códigos de sorteos y subastas: viven 10 minutos, y hacerlo exigiría renombrar `code` o dejar un hash en una columna que se llama `code`.
- Varios dispositivos simultáneos por asistente (ver D5).
- LiveKit y Agora (roles, escena, grabación), facturación, abonos, transferencias.

## Decisions

### D1 — La credencial nace en la verificación, no en el registro

`/register` inserta con `access_token_hash = NULL`, y `/verify-email` emite el token dentro del mismo `UPDATE` que pone `email_verified = 1`.

*Alternativa descartada:* seguir emitiendo en `/register` y bloquear en los controles. El token existiría antes de la prueba, y cualquier control futuro que olvide la comprobación reabre el agujero. Con D1 y D2 hacen falta dos olvidos independientes a la vez.

### D2 — El filtro vive en la única búsqueda por token

`getAttendeeByAccessToken` añade `AND (email_verified = 1 OR is_staff = 1)`. Hoy es la única consulta sobre `access_token_hash` (comprobado), y un test de regresión recorre `controllers/`, `routes/`, `socket/` y `services/` para que siga siéndolo. Es el mismo papel que cumplen `editionInventory.test.js` y `passwordChangeInvalidation.test.js`.

*Alternativa descartada:* ampliar `requiresPayment` a un predicado de acceso y llamarlo en siete sitios. Serían siete sitios que tienen que estar de acuerdo, y la sala de Socket.IO ya tuvo una copia divergente de ese mismo predicado.

*Consecuencia:* `/session` necesita distinguir «sin verificar» de «token desconocido». Hace una segunda consulta **solo cuando la primera no encuentra nada**, mismo patrón que la caducidad del restablecimiento de contraseña.

### D3 — `email_verified`, no un `status` nuevo

Un valor `'pending'` parece lo natural, pero el `CHECK(status IN (...))` vive en el `CREATE TABLE` y SQLite no altera restricciones: en la tabla de producción, un `INSERT` con `'pending'` fallaría. Además `status` ya mezcla dos ejes: pago (`paid`) y presencia (`joined`, que `requiresPayment` lee como pagado). No se le añade un tercero.

### D4 — Aforo: la plaza se ocupa al verificar, y se comprueba de forma atómica

`getAttendeeCount` cuenta verificados. `/register` hace una comprobación temprana, que sirve para avisar pronto pero no es la que decide. La que decide está en el `UPDATE` de verificación:

```sql
UPDATE event_attendees
   SET email_verified = 1, access_token_hash = ?, verification_code_hash = NULL,
       verification_code_expires_at = NULL, verification_attempts = 0
 WHERE id = ? AND verification_code_hash = ?
   AND ( email_verified = 1
         OR (SELECT max_attendees FROM events WHERE id = ?) IS NULL
         OR (SELECT COUNT(*) FROM event_attendees
              WHERE event_id = ? AND email_verified = 1 AND is_staff = 0
                AND status IN ('registered','paid','joined'))
            < (SELECT max_attendees FROM events WHERE id = ?) )
```

Turso ejecuta cada sentencia de forma atómica y SQLite serializa las escrituras: dos verificaciones concurrentes no pueden ocupar la última plaza a la vez. Es el mismo principio que el `UPDATE` guardado de `editions_sold`.

Con `rowsAffected = 0`, se relee la fila:
- si el código ya no está (otra petición lo consumió), se trata como código inválido;
- si sigue ahí, la causa es el aforo: 409 `EVENT_FULL`.

*Plaza en eventos de pago:* la ocupa quien verifica, también en eventos de pago (decisión de producto, 28/09/2026). Un verificado que no llega a pagar conserva su plaza, igual que hoy la conserva el registro. Por eso `/pay` y `confirm-payment` no vuelven a comprobar el aforo: la plaza ya es suya, y el problema de un aforo lleno entre el pago y la confirmación no puede darse.

### D5 — Volver a verificar recupera el acceso, con un solo dispositivo por asistente

- Un email ya registrado pasa por el código como uno nuevo, y `/verify-email` le emite un token nuevo y le devuelve **su** contraseña. No se regenera: una contraseña nueva invalidaría la del email anterior sin avisar.
- Esto sustituye al atajo del cliente para `paid`/`joined`, que mostraba «Registro completado» sin código y sin token. También arregla que quien vuelve desde otro dispositivo verificara y no recibiera nada.
- El token nuevo sustituye al anterior, como ya hacía `verifyAttendeePassword`. Por eso hay un dispositivo activo por asistente.
- Es coherente con Agora, que asigna un uid por asistente (`ensureAttendeeUid`): dos dispositivos con el mismo uid se expulsan entre sí con `UID_CONFLICT`. Lo que cambia es que la pérdida ahora se ve (D9).

### D6 — Pagos de eventos: vinculación completa e idempotencia

`confirm-payment` compara:
- `metadata.type`, `event_id` y `attendee_id` (los escribe ya `/pay`);
- `amount` y `currency` frente al precio del evento.

Registra `amount_received`. Si la fila ya tiene ese PaymentIntent y está pagada, responde 200 con la contraseña existente y no envía otro email.

El índice único parcial sobre `stripe_payment_intent_id` es la garantía cuando dos confirmaciones compiten; la comprobación previa solo sirve para dar un mensaje mejor.

### D7 — SetupIntent: estado, método de pago, metadatos y cliente

Se exige:
- `status = 'succeeded'` y `payment_method` no nulo;
- que los metadatos que ya escribe `setup-payment` coincidan con el comprador y con el sorteo o subasta de la ruta.

El `customer` se toma del SetupIntent y el `customerId` del cuerpo se ignora. Pujar e inscribirse exigen `stripe_payment_method_id` no nulo. `verify-buyer` calcula `hasPaymentMethod` con el mismo criterio, para que un comprador con datos heredados sin tarjeta vuelva al paso de pago en lugar de quedarse sin poder pujar.

### D8 — Sorteos y subastas: una prueba que viaja con quien la obtuvo

`verify-email` devuelve un `verificationToken`. De él solo se guarda el hash, en la fila de verificación, junto a `verified_at`. `register-buyer` lo exige y comprueba que su email coincide con el del cuerpo.

*Alternativa descartada:* «existe una verificación con `verified = 1` para ese email». La verificación que hizo ayer la víctima valdría hoy para el atacante. La prueba tiene que estar ligada a quien la obtuvo, no solo al email.

- **Caducidad de 60 minutos, no 10:** el código se verifica en el paso PERSONAL, y la dirección de entrega y la de facturación van después.
- **No se consume al usarlo:** `BidModal` llama a `register-buyer` desde dos puntos, y la ventana de tiempo ya acota el uso.
- **Comparación en SQL:** `datetime(verified_at) > datetime('now', '-60 minutes')`, con `verified_at` escrito como `CURRENT_TIMESTAMP`. Es la misma forma sin zona horaria que exige la regla de fechas del restablecimiento de contraseña.

### D9 — `POST /api/events/:id/session`

- **POST, no GET:** la credencial va en el cuerpo, fuera de la URL que registra `pino-http`.
- **Nunca 401:** el manejador global de `apiRequest` borraría el login del usuario y lo llevaría a `/`.
- **Rechazo:** código en `title` y textos en `SESSION_REJECTION_MESSAGES` (`client/lib/constants.js`), mismo patrón que `SHIPPING_VERIFICATION_ERRORS`.
- **Solo un rechazo definitivo borra la sesión.** Un fallo de red conserva el comportamiento anterior, para no dejar fuera a un asistente legítimo con mala conexión.
- **No marca `joined`:** es de solo lectura.

### D10 — La espera entre reenvíos es un 400, no un 429

El cliente convierte cualquier 429 en el aviso global «Límite de peticiones alcanzado». Para un reenvío demasiado pronto ese aviso es falso, así que se responde 400 con `OTP_RESEND_TOO_SOON`.

El modal de eventos trata ese código al registrarse como «el código anterior sigue valiendo» y pasa al paso del código. Es exactamente el caso de quien recarga en ese paso y se vuelve a registrar.

### D11 — Un módulo de OTP compartido y topes de intentos por flujo

`api/utils/emailOtp.js` agrupa la generación con `crypto.randomInt`, el hash, la comparación en tiempo constante y las constantes de espera y caducidad. Los topes de intentos se quedan como están en sorteos (3) y subastas (5), para no cambiar su comportamiento especificado. Eventos adopta 5.

### D12 — Normalización del email

Se recorta y se pasa a minúsculas en el servidor en todos los puntos de entrada, lecturas y escrituras. Las búsquedas de compradores de subastas y sorteos comparan `LOWER(email)`, porque `BidModal` nunca normalizó y puede haber filas heredadas con mayúsculas. Los asistentes a eventos ya se guardaban en minúsculas desde el modal.

### D13 — Panel de admin

- La cifra de «Registrados (N)» cuenta verificados, para que el panel y el contador público no se contradigan.
- «Sin verificar» sustituye a «Registrado». Sobre `joined`/`paid` se muestra **además** de la etiqueta de estado: esas filas son las que entraron por el fallo, y ocultarlo borraría la única pista que queda de ello.

## Sesiones caducadas: análisis y acciones

**Qué es.** El navegador guarda `event_attendee_{id}` y la ficha muestra «Ya tienes acceso», pero el servidor ya no acepta ese token. Mientras el evento está programado solo se ve el aviso. Cuando empieza, aparece «Conectar al directo», que falla sin decir nada (solo `console.error`). El botón «Acceder» no se pinta, así que tampoco se llega a «Acceder con contraseña»: **no hay salida desde la interfaz.**

**Causas**, todas reproducibles hoy:

| Causa | Cómo se produce |
|---|---|
| Token sustituido | «Acceder con contraseña» en otro navegador o dispositivo; o el admin entra desde un segundo dispositivo. Hay una sola columna de token por asistente. |
| Expulsión fuera de la sala | Expulsión por email o IP, o el bloqueo automático por spam, mientras el asistente no estaba conectado en esa pestaña. `handleKicked` solo borra la sesión en la pestaña conectada. |
| Registro sin pagar | Evento de pago: la sesión se guarda en `/register`, antes del pago. |
| Registro sin verificar | La que ha destapado el fallo. Hoy da acceso de verdad en eventos gratuitos; tras el cambio pasa a ser una sesión caducada más. |

No son causas: el token no caduca por tiempo, y un evento finalizado o cancelado oculta la sección de acceso.

**Tras el despliegue** se resuelve solo. Al abrir la ficha, `/session` rechaza la sesión, el cliente la borra, explica el motivo y muestra «Acceder». Nadie tiene que hacer nada.

**Antes del despliegue** no está en manos del operador: el cliente en producción se fía de `localStorage` y ninguna respuesta del servidor lo corrige. Qué se puede comunicar al asistente afectado:

- **Sin perder nada:** abrir el evento en una ventana privada o de incógnito. Ahí aparece «Acceder» → «Acceder con contraseña», con la contraseña del email de confirmación. Si nunca la recibió (no verificó), que se registre en esa ventana.
- **Definitivo:** borrar los datos del sitio 140d.art en su navegador. **Aviso:** también se vacían la cesta, el inicio de sesión y las preferencias de cookies.
  - Chrome Android: Configuración → Configuración de sitios → Todos los sitios → 140d.art → Borrar y restablecer.
  - Chrome escritorio: icono a la izquierda de la URL → Configuración del sitio → Borrar datos.
  - Firefox: candado → Borrar cookies y datos del sitio.
  - Safari iOS: Ajustes → Safari → Avanzado → Datos de sitios web → 140d.art → Eliminar.

**Acción opcional del operador.** Quien se registró y recargó sin verificar puede ser un asistente legítimo que, tras el despliegue, pierde el acceso que el fallo le daba. Esta consulta lista los afectados en eventos futuros, para invitarles a completar el registro:

```sql
SELECT e.title, e.event_datetime, a.first_name, a.email, a.status, a.created_at
  FROM event_attendees a JOIN events e ON e.id = a.event_id
 WHERE a.email_verified = 0 AND a.is_staff = 0
   AND e.status IN ('scheduled', 'active')
 ORDER BY e.event_datetime, a.created_at;
```

## Risks / Trade-offs

- **[API y cliente fuera de sincronía]** → `/register` deja de devolver token y `register-buyer` exige uno nuevo. Se despliegan juntos con `./deploy/deploy.sh`. Quien tenga el modal abierto durante el despliegue termina sin sesión guardada y entra con la contraseña del email de confirmación.
- **[Zod en subastas rechaza cargas reales]** → los esquemas existían sin aplicar. `.strip()` no es un riesgo: `validate()` descarta el resultado del parseo y el controlador sigue leyendo `req.body` intacto (comprobado al implementar). Sí lo era que un opcional enviado como `null` no pasa `z.string().optional()`: los opcionales de `registerBuyerSchema` y `customerId` usan `.nullish()`, contrastado con el `buyerData` real de `BidModal`. `verificationToken` es opcional **en el esquema** a propósito: su ausencia debe dar el 403 `VERIFICATION_REQUIRED` del controlador, que el modal sabe tratar, no un 400 genérico de validación.
- **[Registro en sorteos roto en bases nuevas, hallado al implementar]** → `af329cd` quitó `draw_buyers.bid_password` del `CREATE TABLE`, pero las bases anteriores la tienen `NOT NULL` sin valor por defecto y el `INSERT` la sigue escribiendo: en cualquier base creada después, `register-buyer` daba 500. La columna vuelve con `DEFAULT ''`, en el `CREATE TABLE` y con `safeAlter`.
- **[El índice único falla al arrancar si ya hay duplicados]** → no hay eventos de pago, pero antes de desplegar se ejecuta `SELECT stripe_payment_intent_id, COUNT(*) FROM event_attendees WHERE stripe_payment_intent_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1`, que debe devolver cero filas.
- **[Asistentes legítimos sin verificar pierden el acceso]** → es el comportamiento correcto. La consulta de la sección anterior permite avisarles.
- **[Compradores con datos de pago heredados sin tarjeta]** → no pueden pujar ni inscribirse. `hasPaymentMethod` los devuelve al paso de pago.
- **[Una petición más por visita con sesión guardada]** → solo quien tiene sesión en ese evento, y es de solo lectura.
- **[Sin runner de tests en `client/`]** → la parte de cliente se verifica a mano con la matriz de `tasks.md`. La de servidor queda cubierta por tests de integración.

## Migration Plan

1. Esquema en `api/config/database.js`, con `CREATE TABLE` + `safeAlter` y sin backfill:
   - `event_attendees.verification_attempts INTEGER NOT NULL DEFAULT 0` y `verification_sent_at DATETIME`;
   - `draw_email_verifications` y `auction_email_verifications`: `token_hash TEXT` y `verified_at DATETIME`;
   - índice único parcial `idx_event_attendees_stripe_pi`.
2. Ejecutar la consulta de duplicados de PaymentIntent contra producción. Debe devolver cero filas.
3. Desplegar API y cliente juntos (`./deploy/deploy.sh`, que ya purga la caché de nginx).
4. Comprobar en producción:
   - un registro nuevo no devuelve `accessToken`;
   - recargar en el paso del código muestra «Acceder»;
   - la fila aparece como «Sin verificar» en el panel.
5. **Vuelta atrás:** revertir API y cliente juntos. Las columnas y el índice nuevos no afectan al código anterior.

## Open Questions

Ninguna. Las dos que quedaban se resolvieron el 28/09/2026:

- **Plaza en eventos de pago:** la ocupa quien verifica (ver D4).
- **Enlace «¿No eres tú? Acceder con otros datos»:** se incluye. Es la salida manual para causas de sesión caducada que no se conozcan hoy (ver `event-session-validation`).
