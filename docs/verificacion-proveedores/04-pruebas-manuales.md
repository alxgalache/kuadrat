# 04 · Pruebas manuales

**Objetivo:** comprobar a mano lo que ningún test automático cubre. `client/` no tiene runner de tests, y los navegadores internos de las apps solo se prueban en un teléfono real.

**Prepara:**

- dos eventos de prueba en preproducción, marcados como «Evento de prueba»: uno **gratuito** con `max_attendees = 2` y otro **de pago**;
- un Gmail, una cuenta de Google Workspace si la hay, una cuenta de Google creada con un email ajeno, un Outlook o Hotmail y una cuenta profesional de Microsoft;
- un iPhone y un Android, con Instagram y Facebook instalados y la sesión iniciada.

Abre la ficha del evento en una ventana privada en cada prueba, o pulsa «¿No eres tú? Acceder con otros datos» entre una y otra.

## A. Escritorio (Chrome, Safari y Firefox)

| # | Pasos | Resultado esperado |
|---|---|---|
| A1 | «Acceder» → «Registrarme en el evento» | Paso de métodos: Google, Microsoft y email del mismo tamaño, texto informativo y casilla sin marcar |
| A2 | Pulsar Google sin marcar la casilla | «Debes aceptar las normas de participación»; no sale de la página |
| A3 | Casilla → Google → Gmail | Vuelve a la ficha **sin fragmento en la URL**, «Confirmando tu acceso…», y luego «Te has registrado como …@gmail.com» con la contraseña. Llega el email de confirmación |
| A4 | Recargar tras A3 | «Ya tienes acceso»; el modal no se abre solo |
| A5 | Casilla → Microsoft → Outlook personal | Igual que A3, con el email de Outlook |
| A6 | Casilla → Microsoft → cuenta profesional | Microsoft avisa de que solo admite cuentas personales; «atrás» devuelve al paso de métodos con las tarjetas habilitadas |
| A7 | Casilla → Google → cuenta con email de Yahoo o Hotmail | Formulario de email con «Tu cuenta usa un email que gestiona otro proveedor…»; el código por email funciona |
| A8 | Casilla → Google → «Cancelar» en Google | Paso de métodos con «Has cancelado el acceso…» y la casilla marcada |
| A9 | Casilla → email → «Volver» | Paso de métodos con la casilla aún marcada |
| A10 | Evento de pago: casilla → Google | Pago con «Pagarás como …»; al pagar, contraseña y acceso |
| A11 | Ya registrado con Gmail, otro navegador: Google con el mismo Gmail | Acceso y **la misma contraseña**; el primer navegador ve «Tu acceso se abrió en otro dispositivo» al validar |
| A12 | Evento gratuito con las 2 plazas ocupadas por otros: Google con un Gmail nuevo | Paso de métodos con «Aforo completo»; ninguna fila nueva en el panel |
| A13 | Abrir a mano `/live/<slug>#acceso` sin venir de un proveedor | «La verificación ha caducado o ya se usó…» |
| A14 | Pestaña Red durante A3 | Ninguna URL lleva `id_token`, `state` válido reutilizable ni la prueba; la cookie `ev_idp_result` solo va en la petición a `/identity/complete` |

## B. Móvil, navegador normal (Safari para iOS y Chrome para Android)

| # | Pasos | Resultado esperado |
|---|---|---|
| B1 | A3 y A5 | Igual que en escritorio |
| B2 | La «G» en Safari para iOS | Colores oficiales, nítida, sin cuadros negros ni recortes |
| B3 | Google → botón «atrás» del sistema en la pantalla de Google | Paso de métodos con las tarjetas habilitadas (no «Redirigiendo…» bloqueado) |

## C. Navegadores internos

Envíate el enlace de la ficha por mensaje directo de Instagram o de Messenger, o ponlo en una historia de prueba, y ábrelo desde la app.

| # | App y sistema | Pasos | Resultado esperado |
|---|---|---|---|
| C1 | Instagram · Android | Casilla → Google | Se abre el navegador por defecto, aparece Google y el registro termina **en el navegador** con la contraseña. Instagram muestra «Continúa en tu navegador» |
| C2 | Instagram · iOS | Casilla → Google | Instagram pregunta si abrir fuera de la app → Safari → registro en Safari. **O bien**, a los 2 s, las instrucciones «Toca ⋯…» y «Copiar enlace». Apunta cuál de las dos ocurre |
| C3 | Facebook · Android | Casilla → Google | Como C1 |
| C4 | Facebook · iOS | Casilla → Google | Facebook pregunta si abrir Safari → registro en Safari, o instrucciones a los 2 s. Apunta cuál |
| C5 | Cualquiera | «Copiar enlace» → pegarlo en el navegador | Ficha con el paso de métodos y la casilla **sin** marcar |
| C6 | Instagram · iOS y Android | Casilla → Microsoft | El registro termina **dentro de Instagram**, sin salir |
| C7 | Instagram · iOS y Android | Casilla → email | Código por email dentro de Instagram, como hoy |
| C8 | TikTok · iOS, si se usa | Casilla → Google | Instrucciones directamente, sin intento de salida |

**Cuándo repetir el bloque C:** tras una actualización grande de Instagram o Facebook, o si llegan avisos de que «el botón de Google no hace nada». Los enlaces de salida no son oficiales y Meta los cambia.

## D. Panel de admin y datos

| # | Comprobación | Resultado esperado |
|---|---|---|
| D1 | `/admin/espacios/[id]` tras A3, A5 y A10 | Las filas aparecen como verificadas, con nombre y apellido del proveedor |
| D2 | Una fila sin apellido en Google, si aparece | Nombre solo; nada se rompe en el panel ni en el email |
| D3 | La fila en la base de datos tras A3 | `verification_code_hash` vacío, `email_verified = 1` y ninguna columna nueva |
| D4 | Logs de la API tras A3 y A7 | Una línea con `provider` y `outcome`, **sin** el email |

## E. Política de privacidad

| # | Comprobación | Resultado esperado |
|---|---|---|
| E1 | Enlace «política de privacidad» de la casilla | Apartado «Registro en eventos en directo» con lo que se guarda de Google o Microsoft, y las cookies técnicas |
| E2 | Enlace de las normas de los eventos al apartado de grabación | Sigue llegando a `#grabacion-de-eventos` |
