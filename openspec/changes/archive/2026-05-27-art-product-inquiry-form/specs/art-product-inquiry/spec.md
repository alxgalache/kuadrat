## ADDED Requirements

### Requirement: Inquiry call-to-action en ficha de obra

La ficha pública de una obra (`/galeria/p/[id]`, componente `ArtProductDetail`) SHALL mostrar, debajo del nombre del autor, un texto explicativo en es-ES que invite al usuario a contactar para casos no estándar (otro método de pago, otro método de envío, información específica). El fragmento "haz click aquí" SHALL renderizarse como un enlace clicable que abra un modal de consulta.

#### Scenario: Texto visible bajo el autor

- **WHEN** un usuario carga `/galeria/p/[id]` para una obra con `seller_full_name` definido
- **THEN** debajo de la línea "Autor: <nombre>" se renderiza el texto "Si deseas utilizar otro método de pago, cambiar el método de envío, o solicitar información específica sobre esta obra, haz click aquí" con "haz click aquí" estilizado como enlace.

#### Scenario: El enlace abre el modal de consulta

- **WHEN** el usuario hace click en "haz click aquí"
- **THEN** se abre el modal `ArtProductInquiryModal` con el formulario vacío y el widget de Turnstile montado.

#### Scenario: Texto presente aunque el autor esté ausente

- **WHEN** una obra no tiene `seller_full_name`
- **THEN** el texto explicativo y su enlace SHALL renderizarse igualmente, en su posición habitual (debajo del bloque de soporte/autor).

### Requirement: Formulario de consulta con campos requeridos

El modal `ArtProductInquiryModal` SHALL exponer un formulario con los campos: nombre completo (text, obligatorio), email (email, obligatorio), teléfono (tel, opcional), mensaje (textarea, obligatorio). El botón "Enviar" SHALL estar deshabilitado mientras falte algún campo obligatorio, falte el token de Turnstile, o el envío esté en curso.

#### Scenario: Submit con campos válidos y token de captcha

- **WHEN** el usuario rellena nombre, email válido, mensaje, resuelve Turnstile y hace click en "Enviar"
- **THEN** el formulario envía `POST /api/inquiries/art` con los datos + token + `productId`
- **AND** el modal muestra estado "Enviando..." mientras espera respuesta.

#### Scenario: Validación cliente bloquea submit incompleto

- **WHEN** el usuario hace click en "Enviar" sin nombre, sin email, con email malformado, o sin mensaje
- **THEN** el botón "Enviar" está deshabilitado y/o el navegador muestra el error de validación HTML5 sin disparar la petición.

#### Scenario: Teléfono opcional

- **WHEN** el usuario envía el formulario con todos los campos obligatorios pero sin teléfono
- **THEN** la petición se envía con `phone: null` o sin la clave, y el backend la procesa con normalidad.

### Requirement: Protección anti-spam con Cloudflare Turnstile

El endpoint público `POST /api/inquiries/art` SHALL exigir un token válido de Cloudflare Turnstile en el body. El backend SHALL verificar el token contra `https://challenges.cloudflare.com/turnstile/v0/siteverify` antes de procesar el envío. Si la verificación falla, el endpoint SHALL responder 400 con código de error `CAPTCHA_FAILED` y no SHALL enviar email.

#### Scenario: Token de Turnstile válido

- **WHEN** el backend recibe la petición con un token que `siteverify` responde con `success: true`
- **THEN** el procesamiento continúa (rate limit ya pasado, validación Zod ya pasada) hasta el envío del email.

#### Scenario: Token de Turnstile inválido o expirado

- **WHEN** `siteverify` responde con `success: false`
- **THEN** el backend responde HTTP 400 con `{ error: { code: 'CAPTCHA_FAILED', message: '...' } }`
- **AND** no se envía email
- **AND** se loguea un `warn` con la IP y los `error-codes` devueltos por Cloudflare.

#### Scenario: Servicio de Turnstile no disponible

- **WHEN** la petición a `siteverify` falla por timeout o error de red
- **THEN** el backend responde HTTP 503 con código `CAPTCHA_UNAVAILABLE`
- **AND** se loguea un `error` con el detalle
- **AND** el endpoint NO permite el envío sin verificación (no hay fallback "permitir si Cloudflare cae").

### Requirement: Rate limiting del endpoint de consultas

El endpoint `POST /api/inquiries/art` SHALL estar protegido por un rate limiter dedicado (`inquiryLimiter`) que limite a 3 envíos por hora y por IP por defecto. Los parámetros (max y ventana) SHALL ser configurables vía env (`INQUIRY_RATE_LIMIT_MAX`, `INQUIRY_RATE_LIMIT_WINDOW_SECONDS`).

#### Scenario: Bajo el límite

- **WHEN** una IP envía 1, 2 o 3 consultas dentro de la ventana de 1 hora
- **THEN** todas las peticiones son aceptadas (siempre que el resto de validaciones pasen).

#### Scenario: Sobrepasa el límite

- **WHEN** una IP envía una 4ª consulta dentro de la misma ventana de 1 hora
- **THEN** el backend responde HTTP 429 con el mismo formato de error que el resto de limiters de la app.

### Requirement: Envío de email a BUSINESS_EMAIL con detalle de la consulta y la obra

Tras pasar todas las validaciones (Zod + Turnstile + rate limit), el backend SHALL enviar un email vía `emailService` a la dirección configurada en `BUSINESS_EMAIL`, o a `EMAIL_FROM` si `BUSINESS_EMAIL` no está definida. El email SHALL incluir: nombre, email y teléfono (si lo hay) del usuario; el mensaje; nombre de la obra, su ID interno, su URL pública (`/galeria/p/[id]`), el autor y el precio formateado en euros. El header `Reply-To` SHALL contener el email introducido por el usuario.

#### Scenario: Email enviado con BUSINESS_EMAIL definida

- **WHEN** `config.businessEmail` está definida y la consulta supera todas las validaciones
- **THEN** se envía un email a `config.businessEmail` con `Reply-To: <user_email>` y todos los campos del formulario y de la obra en el cuerpo.

#### Scenario: Fallback a EMAIL_FROM

- **WHEN** `config.businessEmail` NO está definida y la consulta supera todas las validaciones
- **THEN** se envía un email a `config.emailFrom` con el mismo formato y `Reply-To: <user_email>`.

#### Scenario: Producto inexistente

- **WHEN** el `productId` enviado no corresponde a ninguna fila en la tabla `art`
- **THEN** el backend responde HTTP 404 con código `PRODUCT_NOT_FOUND`
- **AND** no se envía email.

#### Scenario: Fallo de SMTP

- **WHEN** `emailService` falla al enviar (SMTP rechaza, timeout)
- **THEN** el backend responde HTTP 500 con código `EMAIL_DELIVERY_FAILED`
- **AND** se loguea un `error` con el detalle del fallo
- **AND** el usuario ve un banner de error en español.

### Requirement: Aviso GDPR enlazado a la política de privacidad

El modal `ArtProductInquiryModal` SHALL mostrar, debajo del botón "Enviar", un texto breve en es-ES informando al usuario de que los datos introducidos se usan únicamente para responder a su consulta, e incluyendo un enlace a la página de política de privacidad existente (`/legal/politica-de-privacidad`). El enlace SHALL abrirse en una nueva pestaña con `rel="noopener noreferrer"`.

#### Scenario: Aviso visible bajo el botón Enviar

- **WHEN** el usuario abre el modal de consulta
- **THEN** debajo del botón "Enviar" se renderiza la línea de aviso GDPR con un enlace "política de privacidad" apuntando a `/legal/politica-de-privacidad`.

#### Scenario: El enlace abre la política en nueva pestaña

- **WHEN** el usuario hace click en el enlace "política de privacidad" dentro del aviso
- **THEN** la página `/legal/politica-de-privacidad` se abre en una nueva pestaña sin perder el estado del formulario.

### Requirement: Feedback al usuario tras envío

El cliente SHALL ofrecer feedback claro tras el envío usando `BannerNotificationContext`. En éxito, cierra el modal y muestra banner verde "Consulta enviada. Te responderemos en breve". En error, deja el modal abierto, resetea el widget de Turnstile, y muestra banner rojo con mensaje específico según el código de error (captcha, rate limit, validación, email).

#### Scenario: Envío con éxito

- **WHEN** la API responde 200/201
- **THEN** el modal se cierra y se muestra el banner de éxito en es-ES.

#### Scenario: Rate limit alcanzado

- **WHEN** la API responde 429
- **THEN** el modal permanece abierto y se muestra un banner "Has alcanzado el número máximo de consultas. Inténtalo de nuevo más tarde".

#### Scenario: Captcha falla

- **WHEN** la API responde 400 con código `CAPTCHA_FAILED`
- **THEN** el modal permanece abierto, el widget de Turnstile se resetea, y se muestra un banner "Verificación de seguridad fallida. Inténtalo de nuevo".

### Requirement: Variables de entorno y configuración

El sistema SHALL exponer y validar las siguientes variables a través de `api/config/env.js`:
- `BUSINESS_EMAIL` (opcional; si no está definida, `config.businessEmail` se setea al valor de `EMAIL_FROM`).
- `TURNSTILE_SECRET` (requerida cuando se quiere habilitar la feature en backend; si está vacía, el endpoint responde 503 con `CAPTCHA_UNAVAILABLE`).
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (cliente; si está vacía, el enlace "haz click aquí" SHALL ocultarse).
- `INQUIRY_RATE_LIMIT_MAX` (opcional, default 3).
- `INQUIRY_RATE_LIMIT_WINDOW_SECONDS` (opcional, default 60 = 1 hora, recordando que el limiter multiplica por 60).

Estas variables SHALL documentarse en `api/.env.example` y en la sección "Environment Variables" de `CLAUDE.md`.

#### Scenario: BUSINESS_EMAIL ausente

- **WHEN** el proceso arranca sin `BUSINESS_EMAIL` definida y con `EMAIL_FROM` definida
- **THEN** `config.businessEmail === config.emailFrom`
- **AND** los emails de consulta se envían a `config.emailFrom`.

#### Scenario: TURNSTILE_SECRET ausente en producción

- **WHEN** `config.turnstileSecret` no está definida y el endpoint recibe una petición
- **THEN** el backend responde HTTP 503 con `CAPTCHA_UNAVAILABLE` y se loguea un `error` indicando la configuración faltante.

#### Scenario: NEXT_PUBLIC_TURNSTILE_SITE_KEY ausente

- **WHEN** el cliente se renderiza sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- **THEN** el enlace "haz click aquí" SHALL no renderizarse (o renderizarse deshabilitado), evitando abrir un modal que no podría funcionar.
