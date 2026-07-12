# Tasks — product-image-lightbox

## 1. Lightbox component

- [x] 1.1 Crear `client/components/ProductImageLightbox.js`: Headless UI `Dialog` con backdrop `bg-black/70`, imagen `next/image fill sizes="100vw" object-contain` en contenedor casi-viewport, botón X arriba-derecha (`XMarkIcon`, `bg-white/70 hover:bg-white rounded-full shadow`), cierre por backdrop/X/ESC, labels es-ES (`aria-label="Cerrar"`, etc.)
- [x] 1.2 Añadir navegación en el lightbox: flechas prev/next con las mismas clases que las flechas del carrusel (`absolute top-1/2 -translate-y-1/2 size-8 rounded-full bg-white/70 hover:bg-white text-gray-900 shadow ...`), navegación circular sobre TODAS las imágenes, ocultas si `images.length <= 1`; índice propio inicializado con `initialIndex` al abrir

## 2. Carrusel de detalle (pill + trigger)

- [x] 2.1 En `ProductImageCarousel.js`: registrar ratio por `basename` en el `onLoad` del `next/image` (leer `naturalWidth/naturalHeight` de `e.target`) para sembrar `knownRatios` del lightbox (dimensionado del panel); el ratio ya no condiciona pill ni apertura
- [x] 2.2 Renderizar el pill "Ver imagen completa" arriba-derecha (`absolute top-2 right-2`, `bg-white/80 rounded-full`, texto pequeño gris oscuro) para TODAS las imágenes, con icono de lupa (`MagnifyingGlassPlusIcon`, `aria-hidden`)
- [x] 2.3 Hacer clickable la imagen visible siempre que haya imagen (`cursor-pointer`, onClick abre el lightbox con `initialIndex = safeIndex`); montar `<ProductImageLightbox>` controlado por estado `open`
- [x] 2.4 Verificar que `ArtProductDetail.js` y `OthersProductDetail.js` no necesitan cambios (consumen el carrusel; en tienda comprobar el remount por `key={selectedVariant?.id}` con el lightbox cerrado/abierto)

## 2b. Zoom con rueda de ratón en el lightbox

- [x] 2b.1 En `ProductImageLightbox.js`: panel `overflow-hidden` sobre el box ya dimensionado; wrapper `absolute inset-0` con `transform: translate() scale()` y `transform-origin: 0 0` sobre el `next/image`; controles X/flechas con `z-10`; cursor por defecto (sin `zoom-in`/`grab`)
- [x] 2b.2 Listener `wheel` nativo no-passive (`addEventListener('wheel', h, { passive:false })` vía `ref`, solo con `open`) que hace `preventDefault`, escala acotada `[1,5]`; translate por fracción de cursor `tx=−fx·(s−1)·W`, `ty=−fy·(s−1)·H`
- [x] 2b.3 Pan tipo lupa que sigue al cursor en `pointermove` con `scale > 1` (sin arrastre); reset al inicial en `pointerleave` y vía efecto en `[open, safeIndex]`

## 3. Optimización de imágenes en desarrollo

- [x] 3.1 En `client/next.config.js`: eliminar `unoptimized: process.env.NODE_ENV === 'development'` y añadir `rewrites()` solo-dev: `/img-proxy/:path*` → `` `${process.env.INTERNAL_API_URL || 'http://localhost:3001/api'}/:path*` ``
- [x] 3.2 En `client/lib/api.js`: `getArtImageUrl` / `getOthersImageUrl` devuelven `/img-proxy/art/images/<basename>` / `/img-proxy/others/images/<basename>` cuando `process.env.NODE_ENV === 'development'` y no hay `CDN_URL`; sin cambios con CDN o en producción
- [x] 3.3 Verificar en dev (Docker: `docker-compose.yml` + `docker-compose.local.yml`) que el grid pide las imágenes vía `/_next/image?url=%2Fimg-proxy%2F...` y que cargan correctamente (sin 400/502 del optimizador)

## 4. Verificación funcional

- [x] 4.1 Detalle de arte con imagen vertical u horizontal: pill visible, click abre lightbox, imagen completa sin recorte, cierre por X/backdrop/ESC
- [x] 4.2 Detalle con imagen cuadrada: pill visible, click abre el lightbox igual que las no-cuadradas
- [x] 4.6 Zoom con rueda dentro del lightbox: la rueda amplía solo la imagen (la página y el fondo oscurecido no cambian), recortado al marco; el movimiento del cursor desplaza la porción visible (tipo lupa de tienda); cursor por defecto; salir de la imagen, cerrar o navegar resetea el zoom; X/flechas siguen operativas
- [x] 4.3 Producto multi-imagen: lightbox abre en la imagen actual del carrusel, flechas navegan circularmente sin alterar el carrusel de fondo; producto de una sola imagen: sin flechas
- [x] 4.4 Detalle de tienda con variaciones: lightbox funciona con la lista combinada (imágenes de variación + producto) y sobrevive al cambio de variante
- [x] 4.5 Grid de galería y tienda: sin cambios visuales (recorte object-cover, sin pill); `npm run build` del cliente pasa sin errores
