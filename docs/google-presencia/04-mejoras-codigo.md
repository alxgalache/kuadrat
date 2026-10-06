# 04 · Cambios en el código del repositorio

Contexto: la portada publica el JSON-LD de la organización (`buildOrganization()` en `client/lib/schema.js`) y cada ficha de obra publica el suyo (`buildVisualArtwork()`). Es lo que Google lee para entender la entidad «140d» y para contrastar los productos de Merchant Center. Merchant Center se alimenta hoy de una hoja de cálculo (ver `05-auditoria-merchant-center.md`).

## Aplicados el 06/10/2026, primera tanda (desplegados y comprobados en producción)

Solo afectan al cliente.

### Cambio 1 · Las obras a la venta, también como `Product`

`buildVisualArtwork()` emite ahora `'@type': ['VisualArtwork', 'Product']` cuando la obra se puede comprar, y solo `VisualArtwork` en modo cotización (`PURCHASABLE = false`, `client/app/galeria/p/[id]/page.js:49`). Una obra vendida sigue siendo `Product`, con `availability: SoldOut`.

Para qué:

- Las **actualizaciones automáticas de artículos** de Merchant Center corrigen el precio y la disponibilidad del feed leyendo este marcado. Con obras únicas, es la red de seguridad cuando la hoja se queda atrás tras una venta.
- Las fichas de obra pasan a ser aptas para los resultados enriquecidos de producto.

Requisito actualizado en `openspec/specs/structured-data-schema/spec.md` («Artworks are described as VisualArtwork»).

### Cambio 2 · La organización, solo `OnlineStore`

Antes `['OnlineStore', 'ArtGallery']`. En schema.org, `ArtGallery` desciende de `LocalBusiness` y de `Place`: describe un local que se visita, la misma señal equivocada que el Perfil de Empresa. «Galería de arte» sigue presente en `alternateName`, `description` y `knowsAbout`.

### Cambio 3 · Pinterest y LinkedIn en `sameAs`

`SITE.social` (`client/lib/siteInfo.js`) suma `https://www.pinterest.com/140dart/` y `https://www.linkedin.com/company/140d`.

- Se usa `www.pinterest.com` en lugar de `es.pinterest.com`: es el mismo perfil, pero la URL canónica no depende del idioma.
- Instagram ya estaba.
- Los perfiles nuevos se añadieron al final de la lista porque `sobre-140d` enlaza por posición a `SITE.social[1]` (Instagram).

### Comprobación tras desplegar (hecha el 06/10/2026)

En producción, la portada sale como `OnlineStore` con 5 perfiles en `sameAs`, y `fragil-1` como `["VisualArtwork","Product"]` con `InStock`. Queda pendiente la Prueba de resultados enriquecidos de Google:

1. Prueba de resultados enriquecidos (https://search.google.com/test/rich-results) con `https://140d.art/galeria/p/fragil-1`.
   - Debe detectar «Fichas de comerciante» o «Fragmentos de producto» sin errores críticos.
   - Los avisos por falta de `shippingDetails` o `hasMerchantReturnPolicy` son esperables: esos datos viven en Merchant Center, que tiene prioridad.
2. La misma prueba con `https://140d.art/`: «Organización» con el tipo `OnlineStore` y cinco perfiles en `sameAs`.
3. A las 1–2 semanas, en Search Console → **Mejoras**, aparecerá el informe de productos con las obras.

## Aplicados el 06/10/2026, segunda tanda (pendientes de desplegar)

Afectan a la API y al cliente, así que se despliegan juntos con `./deploy/deploy.sh`.

### Cambio 4 · Denominación social, CIF y NIF-IVA en la organización

El JSON-LD de la portada declara ahora `legalName: "140D Servicios Digitales S.L."`, `taxID: "B88732599"` y `vatID: "ESB88732599"`. Son los datos del aviso legal; el NIF-IVA vale porque la sociedad está dada de alta en el registro de operadores intracomunitarios. Así Google puede emparejar la web con el comercio registrado en Merchant Center («140d Servicios Digitales SL»).

En `client/lib/siteInfo.js`, la antigua clave `SITE.legalName`, que en realidad guardaba el **nombre comercial** («140d Galería de Arte»), pasa a llamarse `SITE.tradeName`. Así nadie la publicará un día como `legalName`. La denominación social va en `SITE.legalEntity`. También se ha actualizado `/llms.txt`, que la leía.

**Fuera, a propósito:** la dirección del domicilio social. Es una vivienda, y publicarla volvería a sugerir un local.

### Cambio 5 · Feed de Merchant Center generado desde la base de datos

Ruta nueva `GET /api/feeds/google-merchant.xml`. Sustituye a la hoja de cálculo: las obras vendidas salen solas, las nuevas entran solas y el envío es siempre el que cobra el checkout. Funcionamiento, activación paso a paso y qué tocar si hay que cambiar algo: **`06-feed-automatico.md`**.

**Piezas:**

- `api/services/googleMerchantFeed.js`: el servicio.
- `api/controllers/feedController.js` y `api/routes/feedRoutes.js`: la ruta.
- `api/utils/productImageUrl.js`: la URL pública de una imagen, que antes estaba copiada en el servicio de emails de marketing y ahora se comparte.
- `api/tests/googleMerchantFeed.test.js`: 8 tests.
- `.claude/rules/catalog/merchant-feed.md`: la regla del área.

La suite completa de la API pasa: 71 ficheros y 1.062 tests. En el servidor de desarrollo, con los datos de preproducción, genera un XML válido.

## Descartado (y por qué)

- **`hasMerchantReturnPolicy` en el JSON-LD.** Google da prioridad a lo configurado en Merchant Center sobre el marcado, así que sería una segunda fuente que mantener sin efecto alguno.
- **`hasShippingService`.** El envío lo cotiza Sendcloud por obra y zona; no hay una tarifa fija que declarar.
- **`telephone` y dirección postal.** No son datos públicos de contacto de 140d.
- **El alta automática desde la web en Merchant Center** (en lugar del feed). No permite fijar el envío por producto, y volvería la discrepancia de envíos.
- **La URL del Perfil de Empresa en `sameAs`.** El perfil se quita.

## Fuentes

- Datos estructurados de organización (subtipos, `legalName`, `taxID`, logotipo): https://developers.google.com/search/docs/appearance/structured-data/organization?hl=es
- Prioridad de la política de devoluciones: https://developers.google.com/search/docs/appearance/structured-data/return-policy?hl=es
- Datos estructurados de producto: https://developers.google.com/search/docs/appearance/structured-data/product?hl=es
- Actualizaciones automáticas de artículos: https://support.google.com/merchants/answer/3246284?hl=es
- Jerarquía de `ArtGallery`: https://schema.org/ArtGallery
