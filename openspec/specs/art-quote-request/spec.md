# art-quote-request

## Purpose

Permitir a un visitante de la ficha pública de una obra (`/galeria/p/[id]`) solicitar una cotización de precio y envío cuando el flujo de compra directa no está disponible. La solicitud se tramita a través de un modal independiente (`ArtProductQuoteModal`) y se envía al buzón comercial vía `POST /api/inquiries/quote`.

## Requirements

### Requirement: Modal de solicitud de cotización

El componente `ArtProductQuoteModal` SHALL ser un componente totalmente independiente de `ArtProductInquiryModal` (sin compartir código ni estado). SHALL mostrar el título "Solicitar cotización" y el subtítulo "Completa el formulario con el código postal donde quieras recibir la obra y nos pondremos en contacto contigo para su tramitación.". SHALL exponer los campos, en este orden: nombre completo (text, obligatorio), email (email, obligatorio), teléfono (tel, opcional), "Código postal para el envío" (text, obligatorio) debajo del teléfono, y "Más información" (textarea, obligatorio). El botón de envío SHALL estar deshabilitado mientras falte un campo obligatorio, falte el token de Turnstile, o el envío esté en curso.

#### Scenario: Modal con título, subtítulo y campos

- **WHEN** el modal `ArtProductQuoteModal` se abre
- **THEN** se muestran el título "Solicitar cotización", el subtítulo indicado, y los campos nombre, email, teléfono, "Código postal para el envío" (debajo del teléfono) y "Más información", con el widget de Turnstile montado.

#### Scenario: Campo "Más información" sustituye a "Mensaje"

- **WHEN** el usuario observa el campo de texto largo del formulario
- **THEN** su etiqueta es "Más información" (no "Mensaje").

#### Scenario: Submit con campos válidos y token de captcha

- **WHEN** el usuario rellena nombre, email válido, código postal válido, "Más información", resuelve Turnstile y envía
- **THEN** se envía `POST /api/inquiries/quote` con `{ productId, name, email, phone?, postalCode, message, turnstileToken }`
- **AND** el modal muestra estado "Enviando..." mientras espera respuesta.

#### Scenario: Teléfono opcional

- **WHEN** el usuario envía el formulario con todos los obligatorios pero sin teléfono
- **THEN** la petición se envía con `phone` ausente o `null` y el backend la procesa con normalidad.

### Requirement: Validación del código postal de envío

El campo "Código postal para el envío" SHALL ser obligatorio. SHALL validarse con formato de 5 dígitos (`/^[0-9]{5}$/`) tanto en cliente como en el backend (Zod). NO SHALL validarse contra la base de datos de códigos postales (es un dato informativo para que la galería contacte).

#### Scenario: Código postal con formato válido

- **WHEN** el usuario introduce un código postal de exactamente 5 dígitos
- **THEN** el campo se considera válido y no bloquea el envío.

#### Scenario: Código postal con formato inválido

- **WHEN** el usuario introduce un valor vacío, con menos/más de 5 caracteres, o con caracteres no numéricos
- **THEN** el envío se bloquea (botón deshabilitado o validación) y, si llega al backend, `quoteRequestSchema` lo rechaza con 400.

### Requirement: Endpoint público de cotización independiente

El backend SHALL exponer `POST /api/inquiries/quote` como endpoint público independiente de `POST /api/inquiries/art`, con su propio `quoteRequestSchema` (incluye `postalCode`), su propio handler `createQuoteRequest`, y su propia plantilla de email. SHALL reutilizar `inquiryLimiter` y la verificación de Turnstile con el mismo contrato de errores (`CAPTCHA_FAILED` 400, `CAPTCHA_UNAVAILABLE` 503). El email SHALL enviarse a `BUSINESS_EMAIL` (fallback `EMAIL_FROM`) con `Reply-To` al email del usuario, e incluir nombre, email, teléfono (si hay), código postal, la información extra y la referencia de la obra (nombre, ID, URL pública, autor, precio).

#### Scenario: Cotización válida envía email

- **WHEN** el backend recibe una petición válida con token de Turnstile que `siteverify` aprueba y la obra existe
- **THEN** se envía un email "Solicitud de cotización" a `BUSINESS_EMAIL` con todos los datos incluido el código postal
- **AND** responde HTTP 200.

#### Scenario: Token de Turnstile inválido

- **WHEN** `siteverify` responde `success: false`
- **THEN** responde HTTP 400 con código `CAPTCHA_FAILED` y no envía email.

#### Scenario: Servicio de Turnstile no disponible

- **WHEN** la petición a `siteverify` falla por red/timeout, o `TURNSTILE_SECRET` no está configurado
- **THEN** responde HTTP 503 con código `CAPTCHA_UNAVAILABLE` y no envía email.

#### Scenario: Obra inexistente

- **WHEN** `productId` no corresponde a ninguna obra
- **THEN** responde HTTP 404 con código `PRODUCT_NOT_FOUND` y no envía email.

#### Scenario: Rate limit compartido

- **WHEN** una IP supera el límite de `inquiryLimiter` dentro de la ventana
- **THEN** la petición a `POST /api/inquiries/quote` recibe HTTP 429.
