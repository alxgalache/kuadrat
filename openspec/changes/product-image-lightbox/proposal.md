## Why

Las imágenes de producto se muestran en contenedores cuadrados (`aspect-square`) tanto en el grid como en la página de detalle. Cuando la obra no es 1:1 (vertical u horizontal), `object-cover` la recorta y el comprador nunca puede ver la obra completa — un problema grave en una galería de arte, donde la imagen ES el producto. Además, en desarrollo local el optimizador de imágenes de Next.js está desactivado (`unoptimized: true`), por lo que el navegador descarga los originales de 1500–2000px y los reescala él mismo, produciendo moiré/artefactos y cargas lentas en el grid.

## What Changes

- **Lightbox en páginas de detalle** (`galeria/p/[id]` y `tienda/p/[id]`, vía `ProductImageCarousel`):
  - Detección del aspect ratio real de cada imagen en cliente (naturalWidth/naturalHeight al cargar).
  - SOLO si la imagen visible no es cuadrada (fuera de una tolerancia del 2%): pill superpuesto arriba-derecha con icono de orientación (rectángulo vertical u horizontal según la imagen) y texto "Ver imagen completa"; la imagen adquiere `cursor-pointer`.
  - Click en la imagen abre un modal lightbox: fondo negro semitransparente, imagen completa sin recortar (`object-contain`), botón "X" arriba-derecha, cierre con click en el fondo o con ESC.
  - Si el producto tiene varias imágenes, el modal muestra flechas de navegación con el mismo diseño que las flechas actuales del carrusel de detalle.
  - Implementación propia sin librería externa de lightbox, usando `@headlessui/react` `Dialog` (ya es dependencia) para focus-trap, ESC y click-outside.
- **El grid de productos NO cambia visualmente**: sigue mostrando las imágenes recortadas con `object-cover`, sin pill ni lightbox.
- **Optimización de imágenes en desarrollo**: se elimina el bypass `unoptimized` en dev. Como el optimizador hace el fetch desde el servidor Next (que en Docker no alcanza `localhost:3001`), en desarrollo los helpers de URL de imagen devuelven rutas relativas servidas a través de un rewrite proxy de Next hacia `INTERNAL_API_URL` (`http://api:3001/api`). Producción/staging no cambian (URLs absolutas CDN/API ya cubiertas por `remotePatterns`).

## Capabilities

### New Capabilities
- `product-image-lightbox`: pill indicador de imagen recortada y modal lightbox de imagen completa (con navegación entre imágenes) en las páginas de detalle de producto de arte y tienda.

### Modified Capabilities
- `nextjs-image-usage`: nuevo requisito — el optimizador de imágenes de Next.js debe estar activo también en desarrollo; las imágenes de producto en dev se sirven vía rewrite proxy same-origin para que el optimizador pueda hacer el fetch desde el contenedor.

## Impact

- **Frontend:**
  - `client/components/ProductImageCarousel.js` — detección de ratio, pill, apertura del lightbox.
  - `client/components/ProductImageLightbox.js` — NUEVO componente modal (Headless UI Dialog + next/image `object-contain` + flechas + X).
  - `client/app/galeria/p/[id]/ArtProductDetail.js` y `client/app/tienda/p/[id]/OthersProductDetail.js` — sin cambios de código previstos (consumen el carrusel), solo verificación.
  - `client/components/ProductGrid.js` — sin cambios visuales; se beneficia de la optimización en dev.
  - `client/lib/api.js` — `getArtImageUrl` / `getOthersImageUrl` devuelven ruta relativa `/img-proxy/...` solo en desarrollo sin CDN.
  - `client/next.config.js` — se elimina `unoptimized` en dev; se añade `rewrites()` para `/img-proxy/:path*` → `INTERNAL_API_URL`.
- **Backend:** sin cambios.
- **Dependencias:** ninguna nueva (se reutiliza `@headlessui/react` y `@heroicons/react`).
- **Entornos:** producción y staging sin cambios de comportamiento; solo mejora el entorno de desarrollo local.
