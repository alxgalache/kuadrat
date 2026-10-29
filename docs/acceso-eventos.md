# Acceso a los eventos en directo

Guía operativa del registro, la verificación por email y el acceso a los
eventos (charlas, streams, reuniones y pases de vídeo). Cubre el flujo que ve el
asistente, qué significa cada estado en el panel de admin y qué hacer cuando un
asistente se queda sin acceso. Decisiones y motivos:
`openspec/changes/enforce-verification-gates`.

---

## 1. El flujo del asistente

```
«Acceder» ─▶ Registrarme ─▶ Elige cómo confirmar tu email (+ casilla de normas)
                 │
                 ├─ Continuar con Google ─────┐  (página de Google o Microsoft,
                 ├─ Continuar con Microsoft ──┤   vuelta a la ficha y
                 │                            │   «Confirmando tu acceso…»)
                 └─ Código por email ─▶ nombre + email ─▶ código ─┤
                                                                 ▼
                                                             ¿de pago?
                                              no ─▶ «Registro completado» + contraseña
                                              sí ─▶ pago ─▶ «Pago completado» + contraseña
«Acceder» ─▶ Acceder con contraseña ─▶ email + contraseña ─▶ acceso
```

- **Tres formas de confirmar el email, un solo final.** Con Google o Microsoft
  el asistente no escribe nada: el nombre, el apellido y el email salen de su
  cuenta. Después todo es igual que con el código (plaza, contraseña, email de
  confirmación y pago). Solo pasan sin código las cuentas cuyo buzón gestiona
  el propio proveedor:
  - Gmail y Google Workspace;
  - cuentas personales de Microsoft con email de Outlook, Hotmail, Live o MSN.

  Cualquier otra cae al formulario del código, con un aviso. Configuración y
  pruebas: [`docs/verificacion-proveedores/`](verificacion-proveedores/README.md).
- **Desde Instagram o Facebook, la tarjeta de Google abre el navegador del
  móvil**, porque Google no deja iniciar sesión dentro de esas apps. El
  registro termina allí, y allí queda la sesión. Si la app no deja salir, la
  tarjeta explica cómo abrir el navegador y ofrece «Copiar enlace». Microsoft y
  el código funcionan dentro de la app.
- **Con un email distinto en cada método, son dos asistentes**: Gmail un día y
  Outlook otro ocupan dos plazas y, en un evento de pago, cobran dos veces. Por
  eso el pago dice «Pagarás como <email>».
- **El acceso nace al verificar**, con el código o con Google o Microsoft, nunca antes. Si el asistente
  recarga la página o cierra el modal en el paso del código, vuelve a ver
  «Acceder»: no tiene acceso ni ocupa plaza.
- **Volver a registrarse con el mismo email** es la forma de recuperar el acceso
  (por ejemplo, desde otro dispositivo o si perdió la contraseña). Recibe otro
  código y, al verificarlo, entra con **la misma contraseña** que ya tenía; se la
  reenviamos por email.
- **Entre dos envíos del código hay que esperar 30 segundos.** Si el asistente
  se registra otra vez antes, el modal le dice que ya le enviamos un código y
  que sigue valiendo.
- **Cinco intentos fallidos** bloquean el código; «Reenviar código» da uno nuevo.

## 2. Un solo dispositivo a la vez

Cada asistente tiene **una sola sesión activa**. Entrar desde otro dispositivo,
con «Acceder con contraseña» o verificando otra vez, invalida la sesión del
anterior. Es coherente con Agora, que da un solo identificador de vídeo por
asistente: dos dispositivos a la vez se expulsarían entre sí.

Al abrir la ficha del evento en el dispositivo anterior, la página comprueba la
sesión con el servidor, la descarta y muestra:

> Tu acceso se abrió en otro dispositivo o navegador. Vuelve a entrar con la
> contraseña que recibiste por email.

junto al botón «Acceder». Bajo «Ya tienes acceso» hay además un enlace
**«¿No eres tú? Acceder con otros datos»**, pensado para dispositivos
compartidos.

## 3. Aforo

- **Ocupa plaza quien ha verificado el email**, haya pagado o no (en los
  eventos de pago también). Los registros sin verificar no cuentan ni en el
  aforo ni en el contador público.
- Si el evento se llena entre el registro y la verificación, el asistente ve
  «Aforo completo» aunque el código sea correcto.
- Quien ya verificó conserva su plaza: si vuelve desde otro dispositivo con el
  evento lleno, entra igualmente.

## 4. El panel de admin (`/admin/espacios/[id]`)

- «**Registrados (N)**» cuenta solo a los verificados, igual que el contador
  público. Si hay filas sin verificar, se añade «· M sin verificar».
- La etiqueta **«Sin verificar»** marca a quien dio su email pero nunca
  introdujo el código. No tiene acceso ni ocupa plaza.
- Una fila con **«Conectado»** o **«Pagado»** y además **«Sin verificar»** viene
  de antes de este cambio: entró a la sala sin verificar el email. Es la única
  pista que queda de ello.
- La fila del admin que entra con «Entrar como administrador» nunca aparece
  como «Sin verificar»: su sesión ya es su prueba.

## 5. «Ya tengo acceso pero no puedo entrar»

Desde este cambio, la ficha del evento pregunta al servidor antes de mostrar
«Ya tienes acceso». Si la sesión guardada ya no vale, la descarta sola y explica
el motivo:

| Mensaje que ve el asistente | Causa | Qué hacer |
|---|---|---|
| Tu acceso se abrió en otro dispositivo o navegador… | Entró desde otro dispositivo | «Acceder con contraseña» con la del email de confirmación |
| No llegaste a verificar tu email… | Se registró y no introdujo el código | Registrarse de nuevo con el mismo email |
| Has sido expulsado de este evento. | Expulsión por el host o el admin | Nada: es definitivo para ese evento |
| El pago no se completó… | Evento de pago sin pagar | Registrarse de nuevo; tras el código vuelve al pago |

Si aun así un asistente se queda atascado (por ejemplo, con una versión antigua
de la página cacheada en el navegador), hay dos salidas:

- **Sin perder nada:** abrir el evento en una ventana privada o de incógnito,
  pulsar «Acceder» y usar «Acceder con contraseña».
- **Definitiva:** borrar los datos del sitio 140d.art en su navegador. **Aviso:**
  también se vacían la cesta, el inicio de sesión y las preferencias de cookies.
  - Chrome Android: Configuración → Configuración de sitios → Todos los sitios →
    140d.art → Borrar y restablecer.
  - Chrome escritorio: icono a la izquierda de la dirección → Configuración del
    sitio → Borrar datos.
  - Firefox: candado → Borrar cookies y datos del sitio.
  - Safari iOS: Ajustes → Safari → Avanzado → Datos de sitios web → 140d.art →
    Eliminar.

## 6. Consultas útiles

Registros sin verificar en eventos que aún no han terminado (para invitarles a
completar el registro):

```sql
SELECT e.title, e.event_datetime, a.first_name, a.email, a.status, a.created_at
  FROM event_attendees a JOIN events e ON e.id = a.event_id
 WHERE a.email_verified = 0 AND a.is_staff = 0
   AND e.status IN ('scheduled', 'active')
 ORDER BY e.event_datetime, a.created_at;
```

Filas que entraron a la sala sin verificar (anteriores a este cambio):

```sql
SELECT e.title, a.email, a.status, a.created_at
  FROM event_attendees a JOIN events e ON e.id = a.event_id
 WHERE a.email_verified = 0 AND a.is_staff = 0 AND a.status = 'joined';
```

Antes de desplegar este cambio por primera vez, esta consulta debe devolver
**cero filas**. Si no, el índice único de pagos haría fallar el arranque:

```sql
SELECT stripe_payment_intent_id, COUNT(*) FROM event_attendees
 WHERE stripe_payment_intent_id IS NOT NULL
 GROUP BY 1 HAVING COUNT(*) > 1;
```
