## ADDED Requirements

### Requirement: El registro no emite credencial

`POST /api/events/:id/register` SHALL crear (o reutilizar) la fila de `event_attendees` **sin** credencial de acceso: una fila nueva se inserta con `access_token_hash = NULL` y `email_verified = 0`. La respuesta SHALL contener únicamente `{ attendeeId }`, con la misma forma se trate de un email nuevo o de uno ya registrado en ese evento, y SHALL NOT incluir `accessToken`, el estado del asistente (`status`) ni su email.

#### Scenario: Registro de un email nuevo
- **WHEN** se llama a `POST /api/events/:id/register` con nombre, apellido y un email no registrado en ese evento
- **THEN** se inserta una fila con `email_verified = 0` y `access_token_hash = NULL`
- **AND** la respuesta contiene `attendeeId` y no contiene `accessToken`

#### Scenario: Registro de un email ya registrado
- **WHEN** se llama a `POST /api/events/:id/register` con un email que ya tiene fila en ese evento, con cualquier `status` y cualquier valor de `email_verified`
- **THEN** no se crea una fila nueva ni se modifica la existente
- **AND** la respuesta contiene solo el `attendeeId` de esa fila, sin `status`, sin email y sin `accessToken`

#### Scenario: Recarga en el paso del código
- **WHEN** un asistente envía nombre y email, llega al paso del código y recarga la página sin haberlo introducido
- **THEN** la ficha del evento muestra el botón «Acceder» y no «Ya tienes acceso», en cualquier navegador y sistema operativo

### Requirement: Validación y limitación de las entradas del registro

`POST /api/events/:id/register` SHALL validarse con `registerAttendeeSchema` (Zod): `first_name` y `last_name` no vacíos tras recortar espacios, y `email` con formato de email válido. El email SHALL normalizarse (recortado y en minúsculas) en el servidor antes de cualquier lectura o escritura. La ruta SHALL estar protegida por `sensitiveLimiter`. `POST /pay`, `POST /confirm-payment` y `POST /token` SHALL aplicar sus esquemas Zod existentes (`createPaymentSchema`, `confirmPaymentSchema`, `getViewerTokenSchema`).

#### Scenario: Email con formato inválido
- **WHEN** se llama a `POST /register` con `email = "foo"`
- **THEN** el sistema responde 400 y no se inserta ninguna fila

#### Scenario: Email con mayúsculas
- **WHEN** se registra `Ana@Ejemplo.com` y después `ana@ejemplo.com` en el mismo evento
- **THEN** ambas peticiones resuelven la misma fila, cuyo email almacenado es `ana@ejemplo.com`

### Requirement: Solo una fila verificada autentica

`eventService.getAttendeeByAccessToken` SHALL ser la única búsqueda de asistente por token, y SHALL devolver una fila solo si `email_verified = 1` o `is_staff = 1`. Todos los puntos que aceptan credenciales de asistente SHALL autenticar a través de ella, sin consultas paralelas sobre `access_token_hash`:

- `POST /token`, `POST /renew-token`, `POST /whiteboard-token`, la subida de imágenes a la pizarra, `POST /video-token` y `POST /report-spam`;
- la unión a la sala autenticada de Socket.IO;
- el nuevo `POST /session`.

#### Scenario: Token de una fila sin verificar
- **WHEN** se presenta en `POST /api/events/:id/token` el par `{ attendeeId, accessToken }` de una fila con `email_verified = 0` e `is_staff = 0`, en un evento gratuito y activo
- **THEN** el sistema responde 403 y no emite token de LiveKit ni de Agora
- **AND** la fila no pasa a `status = 'joined'`

#### Scenario: Token de una fila verificada
- **WHEN** se presenta el par de una fila con `email_verified = 1` en un evento gratuito y activo
- **THEN** el sistema emite el token de la sala como hasta ahora

#### Scenario: Sala de Socket.IO
- **WHEN** un cliente se une a la sala autenticada del evento con las credenciales de una fila sin verificar
- **THEN** la unión se rechaza con «Credenciales inválidas»

#### Scenario: Tokens emitidos antes del despliegue
- **WHEN** una fila creada antes de este cambio tiene `access_token_hash` no nulo y `email_verified = 0`
- **THEN** ese token no autentica en ningún punto, sin que haga falta migrar datos

#### Scenario: Una sola búsqueda por token
- **WHEN** se ejecuta la batería de tests
- **THEN** un test de regresión falla si `access_token_hash` aparece en una sentencia SQL de `controllers/`, `routes/`, `socket/` o `services/` fuera de `eventService.js`

### Requirement: El aforo y el contador solo cuentan asistentes verificados

`eventService.getAttendeeCount` SHALL contar solo filas con `email_verified = 1`, `is_staff = 0` y `status IN ('registered','paid','joined')`. Ese recuento alimenta el contador público y el control de `max_attendees`. En `POST /register`, el control de aforo SHALL omitirse cuando el email ya tiene una fila verificada en el evento, porque esa fila ya ocupa su plaza.

#### Scenario: Registros sin verificar no llenan el aforo
- **WHEN** un evento con `max_attendees = 16` tiene 16 filas con `email_verified = 0`
- **THEN** un nuevo `POST /register` se acepta
- **AND** el contador público muestra 0

#### Scenario: Asistente verificado que vuelve con el evento lleno
- **WHEN** un evento está lleno y un asistente ya verificado llama a `POST /register` con su email desde otro dispositivo
- **THEN** el sistema devuelve su `attendeeId` y no «Aforo completo»

#### Scenario: En un evento de pago, la plaza la ocupa quien verifica
- **WHEN** en un evento de pago con `max_attendees = 10` hay 10 asistentes verificados y ninguno ha pagado
- **THEN** el evento está lleno para un email nuevo
- **AND** `/pay` y `confirm-payment` de esos 10 asistentes no vuelven a comprobar el aforo

#### Scenario: Evento lleno para un email nuevo
- **WHEN** el recuento de verificados alcanza `max_attendees` y un email nuevo llama a `POST /register`
- **THEN** el sistema responde 409 con título `EVENT_FULL` y mensaje «El evento ha alcanzado el límite de asistentes»

### Requirement: El pago exige email verificado

`POST /api/events/:id/pay` SHALL rechazar con 403 (título `EMAIL_NOT_VERIFIED`) una fila con `email_verified = 0`, y con 404 una fila que no pertenezca al evento de la ruta.

#### Scenario: Pago sin verificar
- **WHEN** se llama a `POST /pay` con el `attendeeId` de una fila sin verificar
- **THEN** el sistema responde 403 `EMAIL_NOT_VERIFIED` y no crea ningún PaymentIntent

### Requirement: El panel de admin distingue las filas sin verificar

La sección «Registrados» de `admin/espacios/[id]` SHALL mostrar todas las filas de `listAttendees`, y marcar con la etiqueta «Sin verificar» las que tengan `email_verified = 0` e `is_staff = 0`:

- con `status = 'registered'`, la etiqueta «Sin verificar» sustituye a «Registrado»;
- con `status` `joined` o `paid` (filas heredadas del fallo), se muestra la etiqueta de estado y además «Sin verificar».

La cifra de la cabecera «Registrados (N)» SHALL contar solo filas verificadas que no sean del staff, coherente con el contador público. Cuando existan filas sin verificar, SHALL añadirse a la cabecera «· M sin verificar».

#### Scenario: Fila sin verificar
- **WHEN** el admin abre el detalle de un evento con una fila `email_verified = 0`, `status = 'registered'`
- **THEN** la fila muestra la etiqueta «Sin verificar» en la columna Estado

#### Scenario: Cabecera con filas sin verificar
- **WHEN** el evento tiene 5 filas verificadas y 2 sin verificar
- **THEN** la cabecera muestra «Registrados (5) · 2 sin verificar»

#### Scenario: Fila heredada que entró sin verificar
- **WHEN** una fila tiene `status = 'joined'` y `email_verified = 0`
- **THEN** la fila muestra «Conectado» y «Sin verificar»
