# 04 · Cambios en el código del repositorio

Contexto: la portada publica el JSON-LD de la organización (`buildOrganization()` en `client/lib/schema.js`) y cada ficha de obra publica el suyo (`buildVisualArtwork()`). Es lo que Google lee para entender la entidad «140d» y para contrastar los productos de Merchant Center. Merchant Center se alimenta hoy de una hoja de cálculo (ver `05-auditoria-merchant-center.md`).

## Aplicados el 06/10/2026 (pendientes de desplegar)

Afectan solo al cliente: basta con desplegarlo. No tocan la API ni el esquema.

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

### Comprobación tras desplegar

1. Prueba de resultados enriquecidos (https://search.google.com/test/rich-results) con `https://140d.art/galeria/p/fragil-1`.
   - Debe detectar «Fichas de comerciante» o «Fragmentos de producto» sin errores críticos.
   - Los avisos por falta de `shippingDetails` o `hasMerchantReturnPolicy` son esperables: esos datos viven en Merchant Center, que tiene prioridad.
2. La misma prueba con `https://140d.art/`: «Organización» con el tipo `OnlineStore` y cinco perfiles en `sameAs`.
3. A las 1–2 semanas, en Search Console → **Mejoras**, aparecerá el informe de productos con las obras.

## Propuestos (necesitan tu visto bueno)

### Cambio 4 · Denominación social y CIF en la organización

El aviso legal ya publica:

- Denominación social: 140D Servicios Digitales S.L.
- Nombre comercial: 140d Galería de Arte.
- CIF: B88732599.

Merchant Center tiene la empresa registrada como «140d Servicios Digitales SL». Google admite `legalName` y `taxID` en la organización precisamente para emparejar la web con el comercio. Son datos que ya son públicos.

```js
// client/lib/siteInfo.js
legalEntity: '140D Servicios Digitales S.L.',
taxId: 'B88732599',

// client/lib/schema.js, dentro de buildOrganization()
legalName: SITE.legalEntity,
taxID: SITE.taxId,
```

Hay un problema de nombres que conviene arreglar a la vez. `SITE.legalName` contiene hoy «140d Galería de Arte», que es el **nombre comercial**, no la denominación social, y se publica como `alternateName`. Se renombraría a `SITE.tradeName` para que nadie lo publique un día como `legalName`.

**Deliberadamente fuera:**

- La dirección del domicilio social: es una vivienda, y publicarla volvería a sugerir un local.
- `vatID` (ESB88732599): solo es correcto si la sociedad está dada de alta en el registro de operadores intracomunitarios. Confírmalo antes de añadirlo.

### Cambio 5 · Feed de Merchant Center generado desde la base de datos

**Problema.** Con la hoja de cálculo, cada venta, cada obra nueva y cada recotización del envío exige una edición manual. Si se olvida una, Google anuncia una obra vendida o un envío equivocado. La auditoría del 06/10/2026 encontró justo errores de edición manual (identificadores y títulos intercambiados, un campo de peso en el lugar equivocado).

**Propuesta.** Una ruta pública de la API, `GET /api/feeds/google-merchant.tsv`, que genera el mismo feed que `feed-merchant-center-corregido.csv` desde la base de datos. En Merchant Center se añade como fuente «Obtención programada» diaria desde esa URL, y se elimina la hoja. Los `id` son los mismos slugs, así que no se duplica nada.

- **Disponibilidad**: sale de `is_sold`. Una obra vendida desaparece del feed sola.
- **Imágenes**: salen de `product_images`, con URL directa del CDN.
- **Envío del arte**: se calcula llamando a `zoneResolver` con un código postal por zona (28001, 07001, 35001, 51001). Nunca con una consulta paralela: «qué zona de envío aplica» tiene una sola respuesta en el código.
- **Envío de la tienda**: se cotiza a través de `cartQuoting`, el mismo módulo que usa el checkout.
- **Caché**: la respuesta se guarda 24 h, para no cotizar contra Sendcloud en cada lectura.

**Coste:** una ruta, un servicio y su test. A cambio, desaparece todo el mantenimiento manual del feed.

**Alternativa sin código:** el alta automática desde la web, que Merchant Center rastrea gracias al cambio 1. Pero no permite fijar el envío por producto, y volvería la discrepancia de envíos. Por eso se recomienda la ruta.

## Descartado (y por qué)

- **`hasMerchantReturnPolicy` en el JSON-LD.** Google da prioridad a lo configurado en Merchant Center sobre el marcado, así que sería una segunda fuente que mantener sin efecto alguno.
- **`hasShippingService`.** El envío lo cotiza Sendcloud por obra y zona; no hay una tarifa fija que declarar.
- **`telephone` y dirección postal.** No son datos públicos de contacto de 140d.
- **La URL del Perfil de Empresa en `sameAs`.** El perfil se quita.

## Fuentes

- Datos estructurados de organización (subtipos, `legalName`, `taxID`, logotipo): https://developers.google.com/search/docs/appearance/structured-data/organization?hl=es
- Prioridad de la política de devoluciones: https://developers.google.com/search/docs/appearance/structured-data/return-policy?hl=es
- Datos estructurados de producto: https://developers.google.com/search/docs/appearance/structured-data/product?hl=es
- Actualizaciones automáticas de artículos: https://support.google.com/merchants/answer/3246284?hl=es
- Jerarquía de `ArtGallery`: https://schema.org/ArtGallery
