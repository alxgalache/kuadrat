## 1. Dependencias y configuración

- [x] 1.1 Añadir la dependencia `resend` a `api/package.json` e instalar (`npm install resend` en `api/`) — añadida a `package.json` (`^6.14.0`) y `package-lock.json`; el `node_modules` local es de root (Docker), el install efectivo ocurre en el build de la imagen
- [x] 1.2 Añadir en `api/config/env.js`: `emailProvider` (`EMAIL_PROVIDER`, default `resend`, validado contra enum `resend|smtp`), `resendApiKey` (`RESEND_API_KEY`, requerida sólo cuando `emailProvider === 'resend'`), `logoUrl` (`LOGO_URL`, opcional)
- [x] 1.3 Mantener la validación existente de `SMTP_*` exigida sólo cuando `emailProvider === 'smtp'`
- [x] 1.4 Documentar `RESEND_API_KEY`, `EMAIL_PROVIDER` y `LOGO_URL` en `api/.env.example` (con notas: dominio verificado en Resend, default `resend`)

## 2. Capa de envío en emailService

- [x] 2.1 Inicializar el cliente Resend (`new Resend(config.resendApiKey)`) una sola vez al cargar el módulo, sólo cuando `emailProvider === 'resend'`
- [x] 2.2 Implementar el wrapper interno `sendMail(options)` que, según `config.emailProvider`, llame a `resend.emails.send(...)` o delegue en el `transporter.sendMail(...)` de Nodemailer
- [x] 2.3 En la rama Resend, mapear `{ from, to, subject, html, attachments }` al payload de Resend y normalizar el retorno a `{ messageId: data.id }`; lanzar si el SDK devuelve `error`
- [x] 2.4 En la rama SMTP, devolver el resultado de Nodemailer ya con forma `{ messageId }`
- [x] 2.5 Verificar que `getLogoSrc()`/`getLogoAttachment()` usan `config.logoUrl` (en lugar de `process.env.LOGO_URL`) y que con `LOGO_URL` definido no se adjunta el logo

## 3. Migración de los call sites

- [x] 3.1 Sustituir las ~42 referencias `transporter.sendMail(` por `sendMail(` en `api/services/emailService.js` (firma idéntica) — 39 call sites sustituidos; sólo queda `transporter.sendMail(options)` dentro del wrapper (rama SMTP) y `transporter.verify()`
- [x] 3.2 Confirmar que ningún call site usa campos fuera de `from/to/subject/html/attachments`; si alguno usa `cc/bcc/replyTo`, extender el mapeo del wrapper en consecuencia — los emails de consulta/cotización usan `replyTo`; el wrapper lo mapea a `payload.replyTo` en la rama Resend
- [x] 3.3 Mantener intacto el logging `info.messageId` en cada call site

## 4. Verificación

- [x] 4.1 Smoke test local con `EMAIL_PROVIDER=smtp`: comprobar que el flujo sigue igual que antes (sin regresión)
- [x] 4.2 Smoke test con `EMAIL_PROVIDER=resend` y `RESEND_API_KEY` real: enviar al menos un email de cada tipo (confirmación de pedido, aviso a vendedor, restablecimiento de contraseña) y verificar recepción + panel de Resend
- [x] 4.3 Comprobar arranque: `EMAIL_PROVIDER=resend` sin `RESEND_API_KEY` falla en el arranque; `EMAIL_PROVIDER=smtp` sin `SMTP_*` falla en el arranque
- [x] 4.4 Verificar que el logo se renderiza correctamente en Gmail vía `LOGO_URL`

## 5. Prerequisito operativo (DNS — fuera del código)

- [x] 5.1 En Resend, verificar el subdominio `send.140d.art`: habilita el From `info@send.140d.art`
- [x] 5.2 Añadir en Route 53 los registros que dé Resend bajo `send.140d.art` (DKIM, MX de rebotes, SPF) SIN modificar el MX raíz (`SMTP.GOOGLE.COM`) ni el selector `google._domainkey`; confirmar verde en Resend y que el correo entrante de Google y los alias `info@`/`dev@` siguen funcionando
- [x] 5.3 Fijar `LOGO_URL=https://cdn.140d.art/140d.png` en los entornos (imagen ya validada: 1680×512 PNG, 24,8 KB)
- [x] 5.4 Configurar `RESEND_API_KEY`, `EMAIL_PROVIDER=resend` y `EMAIL_FROM=info@send.140d.art` en los entornos de despliegue (con `EMAIL_PROVIDER=smtp` como rollback documentado)
