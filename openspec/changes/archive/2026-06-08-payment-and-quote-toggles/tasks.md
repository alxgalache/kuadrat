## 1. Toggles de entorno (constants + docs)

- [x] 1.1 En `client/lib/constants.js`, añadir `export const PAYMENT_ENABLED = process.env.NEXT_PUBLIC_PAYMENT_ENABLED !== 'false'` y `export const ART_BUY_AVAILABLE = process.env.NEXT_PUBLIC_ART_BUY_AVAILABLE !== 'false'`.
- [x] 1.2 Añadir `NEXT_PUBLIC_PAYMENT_ENABLED` y `NEXT_PUBLIC_ART_BUY_AVAILABLE` a `/.env.example` (raíz) con comentario explicativo y default.
- [x] 1.3 Añadirlas a `client/.env.example`.
- [x] 1.4 Añadir `ARG` + `ENV NAME=$NAME` (antes de `RUN npm run build`) en `client/Dockerfile.staging` y `client/Dockerfile.prod`.
- [x] 1.5 Añadir `- NEXT_PUBLIC_PAYMENT_ENABLED=${NEXT_PUBLIC_PAYMENT_ENABLED}` y `- NEXT_PUBLIC_ART_BUY_AVAILABLE=${NEXT_PUBLIC_ART_BUY_AVAILABLE}` en `build.args` del servicio client en `docker-compose.prod.yml` y `docker-compose.pre2.yml`.
- [x] 1.6 Documentar ambas vars en `CLAUDE.md` (grupo de variables `NEXT_PUBLIC_*`), incluyendo el parseo fail-safe `!== 'false'`.

## 2. Copy del modal de cotización

- [x] 2.1 En `client/lib/constants.js`, añadir `QUOTE_FIELD_LIMITS` (name, email, phone, message — postalCode fijado por regex) y `QUOTE_COPY` (modalTitle "Solicitar cotización", modalSubtitle indicado, labels incl. `labelPostalCode` "Código postal para el envío" y `labelMessage` "Más información", placeholders, submit/submitting/cancel, gdpr, captchaLoading, banners success/error). Independiente de `INQUIRY_COPY`.

## 3. Backend: endpoint de cotización independiente

- [x] 3.1 En `api/validators/inquirySchemas.js`, añadir y exportar `quoteRequestSchema` (= campos de `artInquirySchema` + `postalCode: z.string().trim().regex(/^[0-9]{5}$/, 'Código postal inválido')`).
- [x] 3.2 En `api/services/emailService.js`, añadir y exportar `sendQuoteRequestEmail({ inquiry, product })` (plantilla análoga a `sendArtInquiryEmail`, asunto/título "Solicitud de cotización", `Reply-To` = email del usuario, fila "Código postal de envío", usa `inquiry.postalCode` y `inquiry.message`).
- [x] 3.3 En `api/controllers/inquiriesController.js`, añadir y exportar `createQuoteRequest` (misma estructura que `createArtInquiry`: check `config.turnstile.secret` → `turnstileService.verify` → buscar obra en `art` → `sendQuoteRequestEmail` → `sendSuccess`; mapear `CAPTCHA_UNAVAILABLE`/`CAPTCHA_FAILED`/`PRODUCT_NOT_FOUND`/`EMAIL_DELIVERY_FAILED`).
- [x] 3.4 En `api/routes/inquiriesRoutes.js`, montar `router.post('/quote', inquiryLimiter, validate(quoteRequestSchema), createQuoteRequest)`.

## 4. Frontend: API client

- [x] 4.1 En `client/lib/api.js`, añadir `inquiriesAPI.createQuoteRequest({ productId, name, email, phone, postalCode, message, turnstileToken })` → `POST /inquiries/quote`.

## 5. Frontend: modal de cotización

- [x] 5.1 Crear `client/components/ArtProductQuoteModal.js` como componente independiente (copia adaptada de `ArtProductInquiryModal`): misma mecánica de Turnstile (Script explicit render, refs, render/remove/reset en efectos); campos nombre, email, teléfono, "Código postal para el envío" (debajo del teléfono), "Más información"; usa `QUOTE_COPY`/`QUOTE_FIELD_LIMITS`; `isValid` exige `postalCode` con `/^[0-9]{5}$/`; llama a `inquiriesAPI.createQuoteRequest`; mapea errores a banners.

## 6. Frontend: lógica de CTA en ficha de obra (art)

- [x] 6.1 En `client/app/galeria/p/[id]/ArtProductDetail.js`, importar `PAYMENT_ENABLED`, `ART_BUY_AVAILABLE` y el `ArtProductQuoteModal` (lazy con `next/dynamic`, `ssr:false`); añadir estado `quoteModalOpen`.
- [x] 6.2 Implementar helper de CTA (none / 'cart' / 'quote') según la tabla de verdad (D2), con "Vendido" prevaleciendo; renderizar el botón correspondiente (estilo idéntico al actual) y abrir el modal de cotización en el caso 'quote'.
- [x] 6.3 Ocultar el bloque del prompt de consulta (`INQUIRY_COPY.prompt` + enlace) cuando el CTA resuelto sea 'quote' (mantener gating por `TURNSTILE_ENABLED` en el resto de casos).
- [x] 6.4 Renderizar `<ArtProductQuoteModal open={quoteModalOpen} ... product={...} />` junto a los demás modales.

## 7. Frontend: gate de CTA en ficha de producto (other)

- [x] 7.1 En `client/app/tienda/p/[id]/OthersProductDetail.js`, importar `PAYMENT_ENABLED` y envolver el bloque de acción de compra (selector de cantidad + botón "Añadir a la cesta") para que solo se renderice cuando `PAYMENT_ENABLED` sea `true`; conservar el estado "Vendido"/sin stock.

## 8. Verificación

- [x] 8.1 Verificar manualmente las 4 combinaciones de toggles en `art` (`/galeria/p/[id]`): none / cesta / cotización (×2), incluida la ocultación del prompt de consulta y el caso "Vendido".
- [x] 8.2 Verificar en `other` (`/tienda/p/[id]`): cesta visible solo con `PAYMENT_ENABLED=true`; oculto con `='false'`.
- [x] 8.3 Enviar una cotización de prueba end-to-end (Turnstile + email a `BUSINESS_EMAIL`) y comprobar que el email incluye el código postal y la información extra; verificar errores 400/503/404/429.
- [x] 8.4 Ejecutar `openspec validate "payment-and-quote-toggles"` y un build de staging para confirmar que las env vars llegan al bundle.
