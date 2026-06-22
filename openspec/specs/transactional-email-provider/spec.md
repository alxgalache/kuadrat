# transactional-email-provider

## Purpose

Definir el proveedor de envío de emails transaccionales del backend. Resend es el proveedor por defecto a través de su API HTTP, con un wrapper de envío de firma estable y un interruptor de proveedor (`EMAIL_PROVIDER`) que permite volver a Nodemailer/SMTP para rollback sin redeploy de código.

## Requirements

### Requirement: Resend como proveedor de envío por defecto

El backend SHALL enviar los emails transaccionales a través de la API HTTP de Resend (SDK `resend`) cuando el proveedor activo es `resend`, que MUST ser el valor por defecto.

#### Scenario: Envío exitoso vía Resend
- **WHEN** un flujo del backend dispara un email y `EMAIL_PROVIDER` no está definido o es `resend`
- **THEN** el sistema llama a `resend.emails.send(...)` con los campos `from`, `to`, `subject` y `html`
- **AND** registra el envío con el identificador del mensaje devuelto por Resend

#### Scenario: Fallo de la API de Resend no detiene el flujo de negocio
- **WHEN** `resend.emails.send(...)` devuelve un error o lanza una excepción
- **THEN** el sistema captura el error, lo registra con el logger, y el flujo de negocio que disparó el email continúa sin abortar

### Requirement: Wrapper de envío con firma estable

El backend SHALL exponer internamente una única función de envío `sendMail(options)` que acepte el formato `{ from, to, subject, html, attachments? }` y devuelva un objeto normalizado con `messageId`, independientemente del proveedor activo.

#### Scenario: Retorno normalizado
- **WHEN** se invoca `sendMail(...)` y el envío tiene éxito
- **THEN** la función devuelve un objeto con la propiedad `messageId`
- **AND** el código llamante puede leer `messageId` igual que antes leía `info.messageId`

#### Scenario: Todos los call sites usan el wrapper
- **WHEN** cualquier flujo del backend necesita enviar un email
- **THEN** lo hace a través de `sendMail(...)` y no invoca directamente al proveedor

### Requirement: Interruptor de proveedor para rollback

El backend SHALL seleccionar el proveedor de envío según la variable de entorno `EMAIL_PROVIDER` (`resend` | `smtp`), permitiendo volver a Nodemailer/SMTP sin redeploy de código.

#### Scenario: Fallback a SMTP
- **WHEN** `EMAIL_PROVIDER` es `smtp`
- **THEN** `sendMail(...)` delega en el transporter Nodemailer existente usando la configuración `SMTP_*`
- **AND** el comportamiento de envío es equivalente al anterior a la migración

#### Scenario: Validación condicional de credenciales
- **WHEN** la aplicación arranca con `EMAIL_PROVIDER=resend`
- **THEN** la configuración exige `RESEND_API_KEY` y falla el arranque si falta
- **WHEN** la aplicación arranca con `EMAIL_PROVIDER=smtp`
- **THEN** la configuración exige las variables `SMTP_*` como antes de la migración

### Requirement: Remitente consistente

El backend SHALL usar el nombre de remitente `"140d Galería de Arte"` y la dirección configurada en `EMAIL_FROM` (`info@send.140d.art`, acorde al subdominio verificado en Resend) en todos los emails con independencia del proveedor activo.

#### Scenario: From consistente
- **WHEN** se envía cualquier email transaccional vía Resend o SMTP
- **THEN** el campo `from` muestra el nombre `140d Galería de Arte` y la dirección configurada en `EMAIL_FROM` (`info@send.140d.art`)

### Requirement: Logo servido por URL pública

El backend SHALL servir el logo de los emails desde una URL pública cuando `LOGO_URL` esté configurada, evitando el adjunto inline CID.

#### Scenario: Logo por URL
- **WHEN** `LOGO_URL` está definida y se envía un email que muestra el logo
- **THEN** el HTML referencia el logo mediante esa URL
- **AND** no se adjunta el logo como contenido inline al mensaje

#### Scenario: Reserva sin LOGO_URL
- **WHEN** `LOGO_URL` no está definida
- **THEN** el sistema mantiene el comportamiento previo de logo (adjunto CID o data URL) sin romper el envío
