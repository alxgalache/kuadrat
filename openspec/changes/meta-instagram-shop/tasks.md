## 1. Generación compartida del catálogo (backend)

- [x] 1.1 Antes de tocar nada, copiar el `api/services/googleMerchantFeed.js` actual a `api/tests/fixtures/googleMerchantFeed.before.js`, con los `require` ajustados a la nueva ruta. Añadir `api/tests/googleFeedUnchanged.test.js`, que genere el XML con esa copia y con el código nuevo sobre los mismos datos (obra con medidas y tres imágenes, obra vendida, producto de la tienda con stock y sin stock, obra sin imagen) y exija igualdad exacta. Es temporal: se borra en 7.3
- [x] 1.2 Crear `api/utils/feedXml.js` con `xmlText` y `tag`, movidos sin cambios desde `googleMerchantFeed.js`
- [x] 1.3 Crear `api/services/productFeedCatalogue.js`, con lo que hoy decide qué se vende y cómo se describe. Mover desde `googleMerchantFeed.js`:
  - la carga con `visibilityPredicate` y el stock de la tienda;
  - `attachProductImages`, `plainText`, `formatDimensions`, `quoteShipping` y `mapLimit`;
  - la caché de 1 h con generación única y la vuelta a la generación anterior si una falla.

  Las entradas son neutras de canal. Llevan tipo, id numérico, slug, nombre, artista, descripción en texto plano, técnica, medidas, precio en céntimos, *basenames* en orden, céntimos y plazos del envío y, en la tienda, las variantes con `stock > 0` (`id`, `key`, `stock`, *basenames* `other_var`)
- [x] 1.4 Reescribir `api/services/googleMerchantFeed.js` como serializador puro de esas entradas. Mantener las exportaciones (`getGoogleMerchantFeed`, `generateFeed`, `formatDimensions`, `HANDLING_DAYS`, `__resetFeedCache`), y que `__resetFeedCache` vacíe la caché compartida
- [x] 1.5 En `productFeedCatalogue.js`, cuando falle la cotización de un producto que estaba en la generación anterior, reutilizar su cotización de envío anterior (el resto, de la lectura actual) y registrar `error`. «Sin imagen» y «sin zona con envío» siguen sacándolo. Añadir los dos escenarios de la spec a un test (simulando el fallo de `quoteSellerGroups`)
- [x] 1.6 Ejecutar `npm test` en `api/`. `googleMerchantFeed.test.js`, sin modificar, y `googleFeedUnchanged.test.js` en verde

## 2. Feed de Meta (backend)

- [x] 2.1 Crear `api/utils/metaContentId.js` con `contentId(productType, productId, variantId)`, con un comentario que remita a `contentId()` de `client/lib/metaPixel.js`. Un test fija `art_57` y `other_4_v12`
- [x] 2.2 Crear `api/services/metaCatalogFeed.js`: el serializador del RSS de Meta sobre las entradas compartidas. Debe seguir la spec `meta-catalog-feed`:
  - un artículo por obra y uno por variante con stock, con `item_group_id`;
  - título «Nombre – Artista», con la variante si hay más de una;
  - descripción precedida de técnica y medidas;
  - `brand` con «140d» si falta el artista;
  - `in stock`, `new`, `google_product_category` 500044 en las obras y `product_type`;
  - imágenes JPEG `${SITE_API_BASE_URL}/api/<art|others>/images/jpeg/v1/<basename>.jpg`, primero las de la variante, tres como máximo;
  - sin `shipping`.
- [x] 2.3 En `api/controllers/feedController.js` y `api/routes/feedRoutes.js`, añadir `GET /api/feeds/meta-catalog.xml`, con las mismas cabeceras que el feed de Google y los errores pasados a `next()`
- [x] 2.4 Crear `api/tests/metaCatalogFeed.test.js`, sin red y con los fixtures del test de Google, que cubra los escenarios de la spec:
  - identificadores e `item_group_id`, variantes agotadas fuera, títulos con variante, *brand* por defecto y descripción con técnica y medidas;
  - URLs JPEG y orden de imágenes, productos excluidos y escapado;
  - una sola generación para los dos feeds, comprobada contando las llamadas a la cotización.

## 3. Copias JPEG de las imágenes (backend)

- [x] 3.1 **[Riesgo alto: dependencia nativa en producción]** Añadir `sharp` a `api/package.json` y regenerar `api/package-lock.json`. Comprobar que el lockfile incluye los paquetes opcionales `@img/sharp-linuxmusl-arm64` y `@img/sharp-libvips-linuxmusl-arm64`
- [x] 3.2 Construir `api/Dockerfile.prod` para `linux/arm64` (`docker buildx build --platform linux/arm64 -f api/Dockerfile.prod api`) y ejecutar en la imagen `node -e "require('sharp')"`. Si falla, corregir el lockfile antes de seguir
- [x] 3.3 Crear `api/services/catalogImageService.js`, que haga lo siguiente:
  - leer el original por `productImageUrl()`, con `fetch` abortado a los 15 s o al pasar de 25 MB;
  - aplicar la rotación EXIF, aplanar sobre blanco y encajar con `contain` en 1600 × 1600 blanco;
  - generar un JPEG progresivo de calidad 85 sin metadatos;
  - limitarse con `sharp.concurrency(1)`, `sharp.cache(false)` y una conversión a la vez en el proceso;
  - aceptar en los tests un lector sustituible.
- [x] 3.4 Crear el controlador de la copia JPEG y montar `GET /images/jpeg/v1/:basename.jpg` en `api/routes/artRoutes.js` y `api/routes/othersRoutes.js`, junto a la ruta de imagen actual. El controlador hace esto:
  - valida el patrón del *basename* (400);
  - comprueba que existe en `product_images` con el `product_type` del prefijo (`art`, o `other`/`other_var`), y si no, 404 sin descargar;
  - responde con `image/jpeg` y `Cache-Control: public, max-age=31536000, immutable`;
  - devuelve 502 con `logger.error` si falla la descarga o la conversión.
- [x] 3.5 Crear `api/tests/catalogJpegImages.test.js`, sin red, con un lector simulado e imágenes generadas con `sharp`. Debe cubrir:
  - el apaisado 2400 × 1600, que da 1600 × 1600 con la obra entera;
  - el original pequeño ampliado y el PNG transparente sobre blanco;
  - los errores 400, 404 (también con un *basename* de otro prefijo) y 502;
  - las cabeceras, y la serialización de cinco peticiones simultáneas.

## 4. Cesta compartida y píxel (frontend)

- [x] 4.1 Crear `client/lib/cartItems.js` con `artCartItem(product, shipping)`, `otherCartItem(product, variant, quantity, shipping)`, `getArtCta()` (movida desde `ArtProductDetail.js`), `isArtPurchasable(product)` e `isVariantPurchasable(product, variant)`
- [x] 4.2 En `client/app/galeria/p/[id]/ArtProductDetail.js`, sustituir los tres objetos escritos a mano en `addToCart` por `artCartItem`, e importar `getArtCta` del módulo nuevo. Verificar a mano que la línea guardada en `localStorage` es idéntica a la de antes, con envío elegido en el modal y con envío reutilizado del mismo artista
- [x] 4.3 En `client/app/tienda/p/[id]/OthersProductDetail.js`, sustituir los tres objetos por `otherCartItem`. Verificar a mano la línea guardada con una y con varias unidades
- [x] 4.4 **[Riesgo alto: CartContext]** En `client/contexts/CartContext.js`, exponer `isInitialized` en el `useMemo` del valor
- [x] 4.5 Comprobar que `Navbar` ya abre el cajón con el evento `open-cart-drawer` (lo usan `pago-fallido` y `pago-cancelado`) y reutilizarlo en `/cesta`, sin tocar `Navbar`. Se descarta el contador `cartDrawerRequest` del diseño inicial: sería una segunda vía para lo mismo
- [x] 4.6 En `client/lib/metaPixel.js`, hacer dos cambios:
  - añadir `parseContentId(id)` junto a `contentId`, que devuelve `{ productType: 'art', productId }`, `{ productType: 'other', productId, variantId }` o `null`;
  - emitir el `ViewContent` de la tienda con `content_type: 'product_group'`.

  Actualizar el comentario de cabecera: el catálogo ya existe y usa este formato (remitir a `api/utils/metaContentId.js`)

## 5. Página `/cesta` (frontend)

- [x] 5.1 Añadir `META_CHECKOUT_COPY` a `client/lib/constants.js` con todos los textos de la página: título, «Elegir envío», «Ya no está disponible», subtotal, nota del envío, «Continuar con la compra», sin productos y modo cotización
- [x] 5.2 En `client/lib/serverApi.js`, añadir lecturas por id de obra y de producto de la tienda con `cache: 'no-store'`, sin tocar las que usan las fichas con `revalidate`
- [x] 5.3 Crear `client/app/cesta/page.js` (componente de servidor):
  - metadatos con `robots: { index: false, follow: false }`;
  - lectura de `searchParams.products` con `parseContentId`, sumando los repetidos y descartando lo mal formado;
  - resolución en paralelo con las lecturas de 5.2;
  - cálculo en el servidor de lo comprable y de las cantidades (obra 1; variante hasta su stock y 10) con los predicados de `cartItems.js`.
- [x] 5.4 Crear `client/app/cesta/CestaFromMeta.js` (cliente):
  - espera a `isInitialized`; si hay algo comprable, `clearCart` y añade la tienda;
  - por cada obra, «Elegir envío» con `ShippingSelectionModal`, reutilizando `getSellerArtShipping`;
  - resumen con imagen, artista, variante, cantidad, precio y subtotal en céntimos enteros;
  - bloque «Ya no está disponible»;
  - modo cotización o sin pagos: enlaces a las fichas, sin tocar la cesta;
  - «Continuar con la compra» abre el cajón con el evento `open-cart-drawer`.

  Todo con `META_CHECKOUT_COPY` y en anchura de móvil
- [x] 5.5 Verificar a mano en local los escenarios de la spec `meta-checkout-url` (09/10/2026, en Chrome con la pestaña visible, hasta el formulario de datos del cajón sin iniciar sesión; el modo cotización solo se revisó en el código, sin relanzar el cliente con la variable):
  - sin parámetros, una obra, dos obras del mismo artista, una variante con cantidad mayor que el stock y una obra vendida;
  - cesta previa sustituida, recarga sin acumular y nada disponible sin tocar la cesta;
  - modo cotización (`NEXT_PUBLIC_ART_BUY_AVAILABLE=false`) y paso al cajón hasta el pago.

## 6. Verificación

- [x] 6.1 Ejecutar `npm test` en `api/` con la suite completa, incluida `testEnvironmentIsolation.test.js`
- [x] 6.2 Ejecutar `npm run lint` y `npm run build` en `client/`
- [ ] 6.3 Tras el despliegue conjunto (`./deploy/deploy.sh`), comprobar en producción lo siguiente:
  - el feed de Google conserva sus `<item>` e `id`;
  - el feed de Meta responde, y uno de sus `image_link` devuelve `image/jpeg` de 1600 × 1600 (con `X-Kuadrat-Cache: HIT` en la segunda petición);
  - `https://140d.art/cesta?products=art_<id>%3A1` lleva hasta el cajón.

  Anotar el resultado en el estado de `docs/tienda_meta/README.md`

## 7. Documentación y reglas

- [x] 7.1 Repasar `docs/tienda_meta/` contra el código final: rutas, URLs, nombres de constantes, el conteo de productos y la tabla «Si hay que tocar algo»
- [x] 7.2 Actualizar `docs/google-presencia/06-feed-automatico.md` («Si hay que tocar algo») si alguna constante cambió de fichero en el grupo 1, por ejemplo `ARTWORK_CATEGORY`
- [ ] 7.3 Borrar `api/tests/googleFeedUnchanged.test.js` y `api/tests/fixtures/googleMerchantFeed.before.js` cuando 1.6 y 6.3 estén comprobados, y volver a ejecutar `npm test`
- [x] 7.4 Registrar el porqué del cambio en `.claude/rules/`:
  - Crear `catalog/meta-catalog.md` con `paths:` a `api/services/{productFeedCatalogue,metaCatalogFeed,catalogImageService}.js`, `api/utils/metaContentId.js`, `client/app/cesta/**`, `client/lib/cartItems.js` y `docs/tienda_meta/**`. Debe recoger:
    - los ids del píxel y por qué no los slugs;
    - la sustitución de Meta que borra lo que falta, y las etiquetas que se pierden;
    - la reutilización de la última cotización buena;
    - WebP prohibido, y `v1` inmutable;
    - por qué la obra elige envío en `/cesta`;
    - la espera a `isInitialized`;
    - la Batch API descartada.
  - Actualizar `catalog/merchant-feed.md` para que remita al módulo compartido y añada sus `paths`.
  - Añadir la línea de la regla nueva al índice de `CLAUDE.md`.
  - Añadir en «Invariantes transversales» que los ids del catálogo de Meta son los del píxel (`contentId()` del cliente y `api/utils/metaContentId.js` cambian juntos o no cambian), comprobando que `CLAUDE.md` cabe en su presupuesto.
  - Ejecutar `node scripts/check-claude-rules.mjs`.
