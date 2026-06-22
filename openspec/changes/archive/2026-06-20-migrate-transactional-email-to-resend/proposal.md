## Why

Los emails transaccionales (confirmaciones de pedido, avisos a vendedores, restablecimiento de contraseña, etc.) se envían hoy con Nodemailer usando una **contraseña de aplicación de Google Workspace** (`ale@140d.art`) sobre SMTP. Google desaconseja activamente este método para producción y conlleva riesgos reales: la credencial vive en `.env` (una filtración del servidor abre la infraestructura de Google), Workspace impone un límite de ~2.000 correos/día, y una ráfaga anómala podría bloquear temporalmente la cuenta principal de trabajo. Además, no hay ninguna trazabilidad: no se sabe si un correo se entregó, rebotó o se abrió.

Migrar a **Resend** (proveedor especializado de email transaccional) elimina el acoplamiento con la cuenta personal de Google, sube el límite de envío, mejora la entregabilidad y aporta paneles con estadísticas reales (entregado / rebotado / abierto).

## What Changes

- Añadir la dependencia `resend` (SDK oficial) al backend.
- Introducir un **wrapper interno `sendMail(options)`** en `api/services/emailService.js` que traduce el formato actual de Nodemailer (`{ from, to, subject, html, attachments }`) a `resend.emails.send(...)` y normaliza el retorno a `{ messageId }` para no romper el logging existente.
- Sustituir las ~42 llamadas `transporter.sendMail(...)` por el nuevo `sendMail(...)` (firma idéntica, cambio mecánico).
- Añadir un **interruptor de entorno `EMAIL_PROVIDER` (`resend` | `smtp`)**: `resend` por defecto, con Nodemailer/SMTP conservado como fallback conmutable para rollback inmediato sin redeploy.
- Dejar de incrustar el logo como adjunto inline CID y servirlo desde una **URL pública (`LOGO_URL`)**, evitando el frágil soporte de CID en Resend y mejorando la visualización en Gmail.
- Nuevas variables de entorno validadas en `api/config/env.js`: `RESEND_API_KEY` (requerida cuando `EMAIL_PROVIDER=resend`), `EMAIL_PROVIDER` (default `resend`), `LOGO_URL` (opcional). Documentadas en `api/.env.example`.
- El nombre del remitente se mantiene (`"140d Galería de Arte"`); la dirección pasa a `info@send.140d.art` (subdominio verificado en Resend).

**Prerequisito de despliegue (operativo, fuera del código):** verificar el **subdominio `send.140d.art`** en Resend. En Resend sólo se puede enviar desde el dominio exacto que se verifica, por lo que el From será `info@send.140d.art`. Resend añade sus registros (DKIM, MX de rebotes, SPF) bajo `send.140d.art`. Esto **no toca** el MX raíz de Google Workspace (`SMTP.GOOGLE.COM`) ni el selector `google._domainkey`, de modo que la cuenta de Google y los alias `info@` / `dev@` quedan intactos.

## Capabilities

### New Capabilities
- `transactional-email-provider`: Abstracción del proveedor de envío de emails transaccionales del backend, con Resend como proveedor por defecto (API HTTP), Nodemailer/SMTP como fallback conmutable vía `EMAIL_PROVIDER`, normalización del resultado de envío y manejo del logo por URL pública.

### Modified Capabilities
<!-- Ninguna: los contenidos y disparadores de cada email no cambian; sólo el transporte subyacente. -->

## Impact

- **Código:** `api/services/emailService.js` (transporter + ~42 call sites + helpers de logo), `api/config/env.js` (nuevas vars), `api/package.json` (dep `resend`).
- **Configuración:** `api/.env.example` y los `.env` de cada entorno (nuevas vars `RESEND_API_KEY`, `EMAIL_PROVIDER`, `LOGO_URL`).
- **Infraestructura/DNS:** registros DNS en Route 53 para verificar `140d.art` en Resend (subdominio `send.140d.art` + `resend._domainkey`). Sin impacto en el correo entrante de Google.
- **Comportamiento de usuario:** ninguno visible; mismos correos, mismo remitente. Mejora indirecta de entregabilidad y trazabilidad.
- **Fuera de scope (futuro):** webhooks de eventos de Resend (delivered/bounced/opened), retirada definitiva de Nodemailer.
