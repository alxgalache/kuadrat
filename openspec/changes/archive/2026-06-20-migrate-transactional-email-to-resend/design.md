## Context

Todo el envío de email vive en `api/services/emailService.js` (~3.868 líneas). Un único `transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } })` lee `process.env.SMTP_*`, y ~42 call sites llaman `await transporter.sendMail({ from, to, subject, html, attachments? })` leyendo `info.messageId` para el logging con Pino.

Helpers existentes relevantes:
- `getFormattedSender()` → `'"140d Galería de Arte" <info@140d.art>'` (la dirección pasará a `info@send.140d.art` vía `EMAIL_FROM`).
- `getLogoAttachment()` → adjunto inline con `cid:logo-140d@140d`; **ya devuelve `null` si `LOGO_URL` está definido**.
- `getLogoSrc()` → prioridad `LOGO_URL` > `cid:` > data URL.

`api/config/env.js` ya expone `config.smtp.{host,port,secure,user,pass}` y `config.emailFrom` (default `info@140d.art`). La forma homogénea de los call sites permite migrar con un único punto de cambio en lugar de reescribir 42 bloques.

Restricción operativa: el dominio `140d.art` usa Google Workspace para correo entrante (MX raíz `SMTP.GOOGLE.COM`). La migración de envío no debe alterar ese flujo.

## Goals / Non-Goals

**Goals:**
- Enviar todos los emails transaccionales vía Resend (API HTTP) por defecto.
- Cambio mecánico y de bajo riesgo: misma firma de envío en los ~42 call sites.
- Rollback inmediato sin redeploy mediante `EMAIL_PROVIDER=smtp`.
- No romper el logging existente (`info.messageId`).
- Mantener el nombre de remitente `"140d Galería de Arte"`; la dirección será `info@send.140d.art` (vía `EMAIL_FROM`).
- No tocar el correo entrante de Google ni los alias `info@` / `dev@`.

**Non-Goals:**
- Webhooks de eventos de Resend (delivered/bounced/opened) — futuro.
- Retirada definitiva de Nodemailer/SMTP — futuro (se conserva como fallback).
- Cambiar contenido, plantillas o disparadores de los emails.
- Cambios en el frontend.

## Decisions

### 1. API HTTP de Resend (no SMTP de Resend)
Se usa el SDK `resend` (`resend.emails.send(...)`) en lugar del SMTP de Resend.
- **Por qué:** habilita la trazabilidad/estadísticas que motivan la migración y deja la puerta abierta a webhooks de eventos.
- **Alternativa descartada:** SMTP de Resend (sólo cambiar credenciales del transporter). Menos código, pero pierde parte de la integración nativa y el objetivo es justamente la observabilidad.

### 2. Wrapper único `sendMail(options)` (patrón adaptador)
Se introduce una función interna `sendMail(options)` que es el **único punto que conoce el proveedor**. Traduce el objeto estilo Nodemailer al payload de Resend y normaliza el retorno a `{ messageId }`.
- **Por qué:** los ~42 call sites pasan de `transporter.sendMail(` a `sendMail(` sin más cambios; el riesgo de regresión es mínimo y el logging (`info.messageId`) sigue funcionando.
- Mapeo de campos: `{ from, to, subject, html, attachments }` → `resend.emails.send({ from, to, subject, html, attachments })`. Resend acepta `from` con display name. `to` admite string o array igual que hoy.
- Retorno: el SDK devuelve `{ data: { id }, error }`. El wrapper lanza si `error` y devuelve `{ messageId: data.id }` en éxito.
- **Alternativa descartada:** reescribir cada call site directamente con `resend.emails.send`. Más superficie de cambio y duplicación del manejo de errores/retorno.

### 3. Interruptor `EMAIL_PROVIDER` (`resend` | `smtp`), default `resend`
El wrapper decide proveedor en tiempo de ejecución leyendo `config.emailProvider`. Con `smtp` delega en el `transporter` Nodemailer ya existente.
- **Por qué:** rollback de un cambio de variable de entorno (sin redeploy de código) si la entregabilidad o la verificación del dominio fallan en producción.
- `RESEND_API_KEY` se valida como **requerida sólo cuando `EMAIL_PROVIDER=resend`**; con `smtp` se exigen las `SMTP_*` como hasta ahora.

### 4. Logo por `LOGO_URL` en lugar de adjunto CID
Se sirve el logo desde una URL pública configurando `LOGO_URL`. `getLogoAttachment()` ya devuelve `null` en ese caso, así que no se adjunta nada y `getLogoSrc()` ya emite la URL.
- **Por qué:** el soporte de imágenes inline `cid:` en Resend es frágil; las URL públicas se renderizan de forma más fiable (especialmente en Gmail).
- **Alternativa descartada:** traducir el CID a `content_id` de Resend. Riesgo de inconsistencias entre clientes de correo y complejidad innecesaria.

### 5. Verificar el subdominio `send.140d.art` en Resend y enviar desde `info@send.140d.art`
En Resend, el dominio verificado determina las direcciones From permitidas: sólo se puede enviar desde el dominio exacto que se verifica. Se verifica el subdominio `send.140d.art`, por lo que el From será `info@send.140d.art`.
- **Por qué:** mantiene aislada la reputación de envío en un subdominio y no requiere tocar registros de la raíz. Resend coloca sus registros (DKIM, MX de rebotes, SPF) bajo `send.140d.art`. El MX raíz de Google (`SMTP.GOOGLE.COM`) y el selector `google._domainkey` quedan intactos.
- **Implicación:** `EMAIL_FROM` se fija a `info@send.140d.art`. El nombre de remitente visible sigue siendo `"140d Galería de Arte"`.
- **Alternativa descartada:** verificar la raíz `140d.art` para enviar desde `info@140d.art`. Rechazada por decisión del usuario: se prefiere el subdominio.

## Risks / Trade-offs

- **Dominio no verificado en Resend al desplegar** → Mitigación: verificar DNS antes del corte; si falla, `EMAIL_PROVIDER=smtp` mantiene el envío por Google mientras se resuelve.
- **Logo no visible si `LOGO_URL` no está accesible públicamente** → Mitigación: alojar el logo en una URL estable (mismo dominio/CDN ya en uso) y validar la URL antes del corte; sin `LOGO_URL` el código cae al `cid:`/data URL como hoy.
- **Diferencias de payload Nodemailer↔Resend en campos no usados** (p. ej. `cc`, `bcc`, `replyTo`) → Mitigación: el inventario actual sólo usa `from/to/subject/html/attachments`; el wrapper cubre esos y se documenta que añadir campos nuevos requiere extender el mapeo.
- **Límite/errores de la API de Resend distintos a SMTP** → Mitigación: el wrapper mantiene el mismo patrón try/catch por call site; los errores se loguean igual y no detienen el flujo de negocio que ya tolera fallos de email.
- **Doble dependencia (resend + nodemailer) mientras dure el fallback** → Trade-off aceptado a cambio de rollback seguro; se retira en limpieza posterior.

## Migration Plan

1. Verificar el dominio en Resend (subdominio `send.140d.art` + DKIM `resend._domainkey.140d.art`) en Route 53, sin tocar el MX raíz de Google.
2. Alojar el logo en una URL pública y obtener `LOGO_URL`.
3. Implementar dep `resend`, vars en `env.js`/`.env.example`, wrapper `sendMail` y sustitución de call sites.
4. Desplegar a staging con `EMAIL_PROVIDER=resend` y enviar emails de prueba de cada tipo; verificar recepción y panel de Resend.
5. Desplegar a producción. **Rollback:** poner `EMAIL_PROVIDER=smtp` (vuelve a Nodemailer/Google) si hay problemas de entregabilidad.

## Resolved Questions

- **Logo (`LOGO_URL`):** se usa `https://cdn.140d.art/140d.png` (PNG RGBA 1680×512, 24,8 KB). El peso es apto para email y la plantilla ya lo reescala a 120px; no se necesita otra versión.
- **`EMAIL_FROM`:** se fija a `info@send.140d.art` en todos los entornos, acorde al subdominio verificado en Resend (ver Decisión 5). El nombre de remitente sigue siendo `"140d Galería de Arte"`.
