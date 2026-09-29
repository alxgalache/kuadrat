# event-session-validation Specification

## Purpose
TBD - created by archiving change enforce-verification-gates. Update Purpose after archive.

## Requirements
### Requirement: Endpoint de validación de la sesión de asistente

El sistema SHALL exponer `POST /api/events/:id/session`, que recibe `{ attendeeId, accessToken }` en el cuerpo, nunca en la URL, y responde si esa sesión da acceso al evento. Cuando la sesión es válida, SHALL responder 200 `{ access: 'granted' }`. En otro caso SHALL responder 403 con uno de estos códigos en `title`, evaluados en este orden:

| Código | Condición |
|---|---|
| `SESSION_INVALID` | `attendeeId` no existe en el evento |
| `SESSION_REPLACED` | la fila existe, pero su `access_token_hash` no corresponde al token |
| `SESSION_UNVERIFIED` | el token corresponde a una fila con `email_verified = 0` e `is_staff = 0` |
| `SESSION_BANNED` | email o IP expulsados del evento |
| `SESSION_PAYMENT_REQUIRED` | `requiresPayment(event, attendee)` |

El endpoint SHALL NOT responder nunca 401, SHALL validarse con Zod y SHALL NOT modificar el estado del asistente (no lo marca como `joined`).

#### Scenario: Sesión válida
- **WHEN** se llama con el par de una fila verificada, no expulsada y, si el evento es de pago, pagada
- **THEN** el sistema responde 200 `{ access: 'granted' }`

#### Scenario: Token sustituido por un acceso desde otro dispositivo
- **WHEN** el asistente entra con «Acceder con contraseña» en el dispositivo B, y el dispositivo A presenta el token anterior
- **THEN** el sistema responde 403 `SESSION_REPLACED` al dispositivo A

#### Scenario: Sesión de un registro sin verificar
- **WHEN** se presenta el token de una fila con `email_verified = 0`
- **THEN** el sistema responde 403 `SESSION_UNVERIFIED`

#### Scenario: Asistente expulsado
- **WHEN** el email o la IP del asistente están expulsados del evento
- **THEN** el sistema responde 403 `SESSION_BANNED`

#### Scenario: Evento finalizado
- **WHEN** el evento está en `finished` o `cancelled` y la sesión es válida
- **THEN** el sistema responde 200 `{ access: 'granted' }` (la ficha decide qué mostrar según el estado del evento)

### Requirement: «Ya tienes acceso» solo tras confirmarlo el servidor

`EventDetail` SHALL mostrar «Ya tienes acceso» para una sesión guardada en `localStorage` solo después de que `POST /session` responda `granted`, o de que el modal acabe de conceder el acceso en esa misma carga. Mientras la validación está en curso, la sección de acceso SHALL mostrar un estado neutro, sin «Ya tienes acceso» y sin «Acceder».

- **Rechazo** (403 con un código `SESSION_*`): SHALL borrar `event_attendee_{eventId}` de `localStorage`, mostrar el botón «Acceder» y, encima, el mensaje del motivo definido en `SESSION_REJECTION_MESSAGES` en `client/lib/constants.js`.
- **Fallo transitorio** (red, 5xx): SHALL conservar la sesión guardada y mostrar «Ya tienes acceso» como hasta ahora.

#### Scenario: Sesión rechazada al abrir la ficha
- **WHEN** un asistente con una sesión guardada abre la ficha y `POST /session` responde 403 `SESSION_REPLACED`
- **THEN** la sesión se borra de `localStorage`
- **AND** se muestra «Tu acceso se abrió en otro dispositivo o navegador. Vuelve a entrar con la contraseña que recibiste por email.» sobre el botón «Acceder»

#### Scenario: Registro sin verificar heredado
- **WHEN** `POST /session` responde 403 `SESSION_UNVERIFIED`
- **THEN** la sesión se borra y se muestra «No llegaste a verificar tu email. Vuelve a registrarte para recibir un código nuevo.»

#### Scenario: Fallo de red al validar
- **WHEN** `POST /session` falla por red o responde 5xx
- **THEN** la sesión se conserva y se muestra «Ya tienes acceso»

#### Scenario: Recarga tras completar el registro
- **WHEN** un asistente completa el registro y recarga la página
- **THEN** `POST /session` responde `granted` y se muestra «Ya tienes acceso»

### Requirement: Un rechazo al conectar también libera la sesión

Cuando `POST /token` responde 403 a `connectAsViewer`, `EventDetail` SHALL validar la sesión con `POST /session` y aplicar el mismo tratamiento que al abrir la ficha, en lugar de registrar el error solo en consola.

#### Scenario: Expulsión mientras el asistente no estaba conectado
- **WHEN** un asistente expulsado del evento sin estar en la sala pulsa «Conectar al directo»
- **THEN** la sesión se borra y se muestra «Has sido expulsado de este evento.» sobre el botón «Acceder»

### Requirement: Salida manual de la sesión guardada

Bajo «Ya tienes acceso», la ficha SHALL ofrecer un enlace de texto «¿No eres tú? Acceder con otros datos». El enlace borra la sesión guardada de ese evento y abre el modal de acceso en su fase inicial. No se muestra al host ni a un usuario con rol `admin`, cuya sesión sale de «Entrar como administrador».

#### Scenario: Cambiar de identidad en un dispositivo compartido
- **WHEN** un asistente con acceso pulsa «¿No eres tú? Acceder con otros datos»
- **THEN** la sesión se borra de `localStorage` y se abre el modal en la fase CHOOSE
