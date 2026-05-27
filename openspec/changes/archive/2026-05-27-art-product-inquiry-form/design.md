## Context

Hoy, `/galeria/p/[id]` (componente `ArtProductDetail.js`) tiene un único call-to-action: añadir al carrito. La ficha muestra autor, descripción, soporte y precio, pero no ofrece ningún canal de pregunta para casos no estándar (otro método de pago, otro envío, peticiones especiales). El usuario interesado que necesita contactar tiene que abandonar la ficha.

La plataforma ya dispone de:
- `emailService.js` (Nodemailer + SMTP) con plantillas HTML reutilizables y `EMAIL_FROM` configurado.
- `BannerNotificationContext` para confirmaciones tipo toast en es-ES.
- Patrón de rate limiting por tiers en `middleware/rateLimiter.js` y `config.rateLimit.*`.
- Patrón de modales con Tailwind UI Blocks (`AuthorModal`, `ShippingSelectionModal`).
- Sistema de validación Zod (`validators/`) + `validate()` middleware.

No hay actualmente integración de captcha; este sería el primer endpoint público expuesto a abuso de spam (los de auth ya están protegidos por rate limit + bcrypt, los de checkout requieren payment intent).

## Goals / Non-Goals

**Goals:**
- Un único punto de entrada en la ficha de obra para consultas comerciales no estándar.
- Email recibido por el equipo con todo el contexto necesario para responder (datos del usuario + referencia exacta de la obra).
- Protección anti-spam realista para un endpoint público sin auth.
- Cero fricción adicional para el usuario legítimo (captcha invisible siempre que sea posible).
- Encajar en patrones existentes (Zod, response helpers, Pino, banner notifications).

**Non-Goals:**
- No se persiste la consulta en BD (no es CRM, no hay backoffice). Si más adelante se quiere historizar, se añadirá una tabla `inquiries` en otro change.
- No se envía email de confirmación al usuario (se asume que la galería responderá manualmente; añadir auto-reply queda fuera de scope).
- No se aplica esta funcionalidad a productos no-art (`others`) en este change. Si la galería lo pide, será un change separado siguiendo el mismo patrón.
- No se hace I18N: textos hardcoded en es-ES en `lib/constants.js` (mismo patrón que el resto de la app).
- No se mide engagement (clicks/opens) ni se integra con analytics.

## Decisions

### D1 — Captcha: Cloudflare Turnstile (modo "managed")

**Decisión:** usar Turnstile en modo *managed* (Cloudflare decide si presenta challenge visible u opera invisible según el riesgo detectado).

**Por qué:**
- Gratis sin límite práctico para nuestro volumen previsible.
- Privacy-friendly, GDPR-compliant — crítico al ser ES/EU y minimizar consentimientos de cookies.
- Validación server-side estándar contra `https://challenges.cloudflare.com/turnstile/v0/siteverify` con `fetch`, sin SDK adicional.
- Sin dependencia de Google (alineado con el espíritu minimalista del proyecto).

**Alternativas consideradas:**
- *reCAPTCHA v3:* requiere tracking de Google + banner de cookies. Descartado por compliance.
- *hCaptcha:* equivalente a Turnstile en privacy pero menos integrado con el resto de infra moderna.
- *Solo honeypot + rate limit:* simple, pero insuficiente contra bots que ejecutan JS. Se mantiene el rate limit como capa adicional encima de Turnstile.

**Implementación:**
- Cliente: cargar `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` como `<Script>` de Next.js dentro del modal (solo cuando el modal está abierto). Renderizar el widget invisible y recoger el token vía callback. Resetear el widget tras submit con éxito o error.
- Servidor: `turnstileService.verify(token, remoteip)` hace POST a `siteverify` con `secret` + `response` + `remoteip`. Si `success !== true`, devolver 400 con `code: 'CAPTCHA_FAILED'`.
- CSP: añadir `https://challenges.cloudflare.com` a `script-src` y `frame-src` en `next.config.js`.

### D2 — Endpoint público sin auth + rate limit dedicado

**Decisión:** `POST /api/inquiries/art` es público (sin JWT). El abuso se mitiga con Turnstile + `inquiryLimiter` (3 envíos/hora por IP por defecto, configurable).

**Por qué:**
- Forzar login mataría la conversión (visitantes anónimos son el caso principal).
- 3/hora/IP es generoso para usuarios reales y suficiente para frenar abuso. Configurable vía env si hace falta ajustar.
- Patrón consistente con `coaVerifyLimiter` y otros limiters dedicados ya existentes.

### D3 — No persistir en BD

**Decisión:** la consulta solo se envía por email; no hay tabla `inquiries`.

**Por qué:**
- El destinatario es una bandeja humana (BUSINESS_EMAIL). Duplicar en BD añade superficie de mantenimiento (backoffice, retención, GDPR/SAR) sin valor inmediato.
- Si en el futuro se quiere dashboard de consultas, se introduce una migración limpia en otro change. YAGNI.

### D4 — Reply-To = email del usuario

**Decisión:** el header `Reply-To` del email enviado a `BUSINESS_EMAIL` apunta al email que el usuario ha introducido en el formulario.

**Por qué:**
- Responder desde Gmail/Outlook directamente al usuario es el flujo natural del equipo comercial. Sin esto, hay que copiar manualmente.
- Riesgo: un usuario malicioso podría poner un Reply-To con typo. Como el equipo siempre lee el cuerpo antes de responder y el email se muestra también dentro del body, el riesgo operativo es bajo.

### D5 — BUSINESS_EMAIL opcional con fallback

**Decisión:** `BUSINESS_EMAIL` se añade como variable opcional. Si no está definida, los emails se envían a `EMAIL_FROM`.

**Por qué:**
- Evita que arranques en entornos dev/staging fallen por falta de la variable.
- El default a `EMAIL_FROM` es semánticamente razonable: si no hay buzón comercial específico, va al remitente general (que el operador ya controla).

### D6 — Componente de modal independiente

**Decisión:** crear `client/components/ArtProductInquiryModal.js` en lugar de inline-ar el form en `ArtProductDetail.js`.

**Por qué:**
- `ArtProductDetail.js` ya tiene >300 líneas y mezcla cart/shipping/auth. Añadir un form de 4 campos + Turnstile + estado de envío lo hace ilegible.
- Sigue el patrón existente (`AuthorModal`, `ShippingSelectionModal`).
- Permite hacer lazy-load del componente con `next/dynamic` para no cargar Turnstile en cada visita (solo al abrir el modal).

### D7 — Validación: client-light, server-strict

**Decisión:**
- Cliente: validación mínima nativa HTML (`required`, `type="email"`, `maxLength`) + verificación previa al submit (Turnstile token presente).
- Servidor: Zod schema con `z.string().email()`, `min(1)`/`max(N)` por cada campo, teléfono opcional regex laxa (acepta espacios, `+`, dígitos), `productId` como `z.number().int().positive()`, `turnstileToken` como `z.string().min(1)`.

**Por qué:** consistente con el resto de la app — la verdad es siempre el backend.

## Risks / Trade-offs

- **[Riesgo] Disponibilidad de Cloudflare Turnstile.** Si `siteverify` cae, no se pueden enviar consultas.
  → **Mitigación:** loguear con warning y devolver 503 al cliente con mensaje "No se puede enviar el formulario en este momento". No hacer fallback a "permitir sin captcha" porque sería un agujero de spam permanente bajo el lema "Cloudflare está caído".

- **[Riesgo] BUSINESS_EMAIL mal configurado en producción.** Se envían consultas a un buzón olvidado y nadie las ve.
  → **Mitigación:** documentar la variable en `.env.example` y CLAUDE.md como "destino operativo de consultas comerciales". Log de info (`logger.info({ to: businessEmail }, 'art inquiry sent')`) en cada envío exitoso para visibilidad.

- **[Riesgo] Abuso si Turnstile + rate limit son bypassables.** Un atacante distribuido (rotación de IPs + farm de captchas humanos) podría inundar la bandeja.
  → **Mitigación:** rate limit por IP + Turnstile cubre 99% del spam real. Si llega ese nivel de ataque dirigido, se añade un segundo factor (ej. delay artificial, exigir auth, mover endpoint detrás de Cloudflare WAF).

- **[Riesgo] CSP demasiado restrictiva rompe Turnstile.** Si `script-src` o `frame-src` no incluyen `challenges.cloudflare.com`, el widget no carga.
  → **Mitigación:** ajustar `next.config.js` en el mismo change y verificar manualmente en `/galeria/p/[id]` abriendo el modal antes de mergear.

- **[Trade-off] No persistir consultas significa que el equipo no tiene un sistema centralizado para tracking ni métricas.** Aceptado por simplicidad inicial; si la galería empieza a recibir volumen alto, será trivial añadir una tabla `inquiries` en un change futuro (no rompe nada existente).

- **[Trade-off] Endpoint público abierto al mundo.** Se mitiga con Turnstile + rate limit, pero un porcentaje residual de spam podría llegar al buzón. Aceptable mientras el volumen sea humano-revisable.

## Open Questions

Resueltas durante la fase de propuesta:

- **BCC adicional:** descartado. El email solo se envía a `BUSINESS_EMAIL` (o fallback a `EMAIL_FROM`). Si en el futuro hace falta, se introduce `BUSINESS_EMAIL_BCC` como variable opcional sin cambiar la API pública.
- **Aviso GDPR:** confirmado. Bajo el botón "Enviar" del modal se renderiza una línea de texto breve en es-ES indicando que los datos se usan únicamente para responder a la consulta y enlazando a la política de privacidad existente en `/legal/politica-de-privacidad` (ya publicada). El enlace abre la página en una nueva pestaña (`target="_blank"` + `rel="noopener noreferrer"`).
