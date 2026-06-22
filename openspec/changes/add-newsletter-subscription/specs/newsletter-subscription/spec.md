## ADDED Requirements

### Requirement: Punto de entrada de suscripción en el footer

El frontend SHALL mostrar en el footer, en la primera posición del grupo de iconos (junto a los iconos de redes sociales), un icono de newsletter (sobre) con el mismo diseño que los demás iconos del footer, que al pulsarlo abre el modal de suscripción. SHALL mostrarse cuando el marketing está habilitado en el cliente (`NEXT_PUBLIC_NEWSLETTER_ENABLED` distinto de `false`).

#### Scenario: Icono de newsletter en el footer
- **WHEN** un visitante carga cualquier página con el footer y el marketing está habilitado en el cliente
- **THEN** se muestra el icono de newsletter en la primera posición del grupo de iconos del footer

#### Scenario: El icono abre el modal
- **WHEN** el visitante pulsa el icono de newsletter del footer
- **THEN** se abre el modal de suscripción a la newsletter

#### Scenario: Visibilidad gobernada por configuración de entorno
- **WHEN** la variable `NEXT_PUBLIC_NEWSLETTER_ENABLED` está fijada explícitamente a `false`
- **THEN** ni el icono del footer ni el banner de primera visita se muestran
- **WHEN** la variable está ausente o tiene cualquier otro valor
- **THEN** el punto de entrada se muestra (fail-safe a visible)

### Requirement: Banner de suscripción en la primera visita

El frontend SHALL mostrar, en la primera visita a la web, un banner al final de la página (debajo del contenido del footer, sin solaparse con él a ningún ancho) con un texto invitando a suscribirse, un enlace que abre el modal de suscripción y un botón de cerrar (icono "X") a la derecha. Al cerrarlo, SHALL persistir la decisión en `localStorage` de modo que el banner no vuelva a mostrarse.

#### Scenario: Banner en la primera visita
- **WHEN** un visitante accede a la web por primera vez (sin marca de descarte en `localStorage`) y el marketing está habilitado en el cliente
- **THEN** se muestra el banner, debajo del contenido del footer, con el texto de suscripción, el enlace de suscripción y el botón de cerrar (icono "X") a la derecha

#### Scenario: El banner no se solapa con el footer
- **WHEN** se reduce el ancho de la ventana y el texto del banner ocupa más alto
- **THEN** el banner permanece siempre debajo del contenido del footer, sin taparlo

#### Scenario: El enlace del banner abre el modal
- **WHEN** el visitante pulsa el enlace de suscripción del banner
- **THEN** se abre el modal de suscripción

#### Scenario: Cierre persistente del banner
- **WHEN** el visitante pulsa el botón de cerrar (icono "X") del banner
- **THEN** se guarda una marca en `localStorage` y el banner no vuelve a mostrarse en visitas posteriores

### Requirement: Modal de suscripción a la newsletter

El frontend SHALL abrir, desde el icono del footer o el enlace del banner, un modal que contiene un título, un subtítulo, un texto introductorio, campos de texto para Nombre, Apellidos y email, un grupo de checkboxes con los topics disponibles, el widget de verificación Cloudflare Turnstile y un checkbox de consentimiento de Términos y Condiciones y Política de Privacidad.

#### Scenario: Apertura del modal
- **WHEN** el visitante abre el modal desde el icono del footer o el enlace del banner
- **THEN** se abre el modal con los campos vacíos, los topics en su estado inicial por defecto y el consentimiento sin marcar

#### Scenario: Topics ofrecidos
- **WHEN** el modal está abierto
- **THEN** muestra un checkbox por cada topic: "Programación de eventos en directo", "Subastas y sorteos", "Nuevos autores" y "Newsletter", todos pre-marcados por defecto

#### Scenario: Enlaces legales en pestaña nueva
- **WHEN** el visitante pulsa el enlace de Términos y Condiciones o el de Política de Privacidad dentro del checkbox de consentimiento
- **THEN** la página correspondiente se abre en una pestaña nueva (`target="_blank"` con `rel="noopener noreferrer"`)

#### Scenario: Cierre del modal
- **WHEN** el visitante cierra el modal (botón cerrar o backdrop) y no hay un envío en curso
- **THEN** el modal se cierra y su estado se descarta

### Requirement: Validación del formulario en el cliente

El frontend SHALL habilitar el envío sólo cuando hay un nombre, un email con formato válido, al menos un topic seleccionado, el consentimiento marcado y un token de Turnstile presente; en caso contrario SHALL mantener el botón de envío deshabilitado.

#### Scenario: Formulario incompleto
- **WHEN** falta el nombre, el email no es válido, no hay ningún topic seleccionado, el consentimiento no está marcado o no hay token de Turnstile
- **THEN** el botón de envío permanece deshabilitado

#### Scenario: Formulario válido
- **WHEN** hay nombre, email válido, al menos un topic, consentimiento marcado y token de Turnstile
- **THEN** el botón de envío se habilita

### Requirement: Envío de la suscripción al backend

El frontend SHALL enviar al endpoint público de suscripción los datos del formulario (nombre, apellidos, email, lista de topics seleccionados y token de Turnstile), y SHALL mostrar feedback de éxito o de error al visitante.

#### Scenario: Suscripción correcta
- **WHEN** el visitante envía un formulario válido y el backend responde con éxito
- **THEN** el frontend muestra un mensaje de confirmación y cierra el modal

#### Scenario: Error de verificación o de petición
- **WHEN** el backend responde con un error de captcha, de validación, de rate limit o de servicio
- **THEN** el frontend muestra un mensaje de error acorde y reinicia el widget de Turnstile, permitiendo reintentar

### Requirement: Re-suscripción silenciosa de un email existente

El frontend SHALL tratar el caso de un email ya presente en la audiencia (incluso dado de baja) como un éxito normal, sin mostrar ningún mensaje de validación que revele que el contacto ya existía.

#### Scenario: Email ya registrado o dado de baja
- **WHEN** el visitante se suscribe con un email que ya existe en Resend (suscrito o como `unsubscribed`)
- **THEN** el frontend recibe una respuesta de éxito y muestra el mismo mensaje de confirmación que para un alta nueva
- **AND** no se muestra ningún mensaje del tipo "ya estás suscrito"

### Requirement: Endpoint público de suscripción con verificación y anti-abuso

El backend SHALL exponer `POST /api/newsletter/subscribe` como endpoint público (sin autenticación) protegido por validación de esquema, verificación de Cloudflare Turnstile y limitación de tasa, replicando el blindaje del formulario de consulta de obra.

#### Scenario: Validación de entrada
- **WHEN** la petición llega con un email inválido, sin nombre, con una lista de topics vacía o sin token de verificación
- **THEN** el backend responde con un error de validación 400 y no contacta con Resend

#### Scenario: Captcha no superado
- **WHEN** la verificación de Turnstile falla
- **THEN** el backend responde 400 con código `CAPTCHA_FAILED` y no crea ni actualiza el contacto

#### Scenario: Captcha no disponible
- **WHEN** el secreto de Turnstile no está configurado en el servidor
- **THEN** el backend responde 503 con código `CAPTCHA_UNAVAILABLE`

#### Scenario: Límite de tasa superado
- **WHEN** se exceden las solicitudes permitidas desde un mismo origen en la ventana configurada
- **THEN** el backend responde 429

### Requirement: Mapeo de topics seleccionados a preferencias de suscripción

El backend SHALL traducir la selección del formulario a un estado completo de preferencias de topics conocidos, marcando `opt_in` los topics seleccionados y `opt_out` los no seleccionados, y SHALL descartar cualquier identificador de topic no reconocido.

#### Scenario: Selección parcial de topics
- **WHEN** el visitante selecciona un subconjunto de los topics disponibles
- **THEN** el contacto queda con `opt_in` en los topics seleccionados y `opt_out` en los demás topics conocidos

#### Scenario: Identificadores desconocidos ignorados
- **WHEN** la petición incluye un identificador de topic que no corresponde a ninguno de los topics configurados
- **THEN** el backend lo ignora y sólo aplica los topics conocidos

### Requirement: Suscripción gobernada por el circuit breaker de marketing

El backend SHALL gobernar la suscripción con el mismo interruptor `MARKETING_EMAILS_ENABLED` (y la presencia de la API key de marketing) que el resto del marketing, no dando de alta contactos cuando el marketing está desactivado.

#### Scenario: Marketing desactivado
- **WHEN** se recibe una suscripción y `MARKETING_EMAILS_ENABLED` está desactivado o no hay API key de marketing
- **THEN** el backend no crea ni actualiza el contacto en Resend y responde indicando que la suscripción no está disponible (503)
</content>
