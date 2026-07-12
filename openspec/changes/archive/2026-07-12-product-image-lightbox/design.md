## Context

Las páginas de detalle de producto (`galeria/p/[id]` y `tienda/p/[id]`) renderizan las imágenes vía `client/components/ProductImageCarousel.js`: un contenedor `aspect-square` con `next/image fill` + `object-cover`. Las imágenes no cuadradas se recortan sin que el usuario pueda ver la obra completa. El grid (`ProductGrid.js`) usa el mismo patrón, pero ahí el recorte es aceptable y no cambia.

En la BD no se guarda width/height de las imágenes (`product_images` solo tiene `basename` + `position`), así que el aspect ratio solo puede conocerse en cliente al cargar la imagen.

Sobre optimización: `next.config.js` fija `unoptimized: process.env.NODE_ENV === 'development'`. En dev el navegador descarga los originales (1500–2000px, varios MB) y los reescala, causando moiré y lentitud en el grid. En prod/staging el optimizador está activo (remotePatterns para `api.140d.art`, `api.pre.140d.art`, `cdn.140d.art`) y el grid ya declara `sizes`, así que ahí no hay problema. El motivo del bypass en dev es que el optimizador hace el fetch **desde el servidor Next**: dentro del contenedor `client`, `http://localhost:3001` no resuelve al contenedor `api` (se alcanza vía `http://api:3001`, ya expuesto como `INTERNAL_API_URL` y usado por `app/coa/page.js`).

Restricciones: minimalismo extremo (Tailwind UI as-is), sin TypeScript, UI en es-ES, tema claro.

## Goals / Non-Goals

**Goals:**
- El comprador puede ver la imagen completa de un producto no cuadrado desde la página de detalle.
- El indicador (pill) solo aparece cuando la imagen visible está realmente recortada.
- Navegación entre imágenes dentro del lightbox reutilizando el diseño de flechas existente.
- Imágenes del grid optimizadas también en desarrollo (sin cambios en prod).

**Non-Goals:**
- Pinch-zoom táctil dentro del lightbox (el zoom es con rueda de ratón en escritorio; en móvil el lightbox se comporta como una vista fija).
- Cambiar el layout del grid o del carrusel (siguen cuadrados con `object-cover`).
- Guardar dimensiones de imagen en BD o generar thumbnails en el backend.
- Aplicar el lightbox a subastas, sorteos o eventos (solo detalle de arte y tienda; extensible en el futuro).

## Decisions

### D1 — Implementación propia con Headless UI Dialog (sin librería de lightbox)
Se usa `@headlessui/react` `Dialog` (dependencia existente, patrón ya usado en los modales del proyecto) en un nuevo componente `ProductImageLightbox.js`. Alternativa considerada: `yet-another-react-lightbox` u otra librería — descartada: añade dependencia y estilos propios que chocan con el minimalismo; la funcionalidad requerida (overlay, contain, flechas, X, ESC/click-outside) es pequeña y Dialog ya resuelve focus-trap y accesibilidad.

### D2 — Detección de ratio en cliente, por imagen, con tolerancia
En `ProductImageCarousel`, el `onLoad` del `next/image` lee `naturalWidth/naturalHeight` y guarda el ratio en un estado `Map/objeto` clave `basename`. Una imagen se considera "cuadrada" si `|w/h - 1| <= 0.02` (tolerancia 2% para redondeos de exportación). Alternativa: guardar dimensiones en BD al subir — descartada por tocar backend/esquema para un dato puramente presentacional; puede reconsiderarse si se necesita en SSR.

Nota: con el optimizador activo, `naturalWidth/naturalHeight` corresponden a la variante servida del srcset, pero el **ratio** se preserva en el redimensionado, que es lo único que se usa.

### D3 — Pill y clickabilidad para TODAS las imágenes
El pill ("Ver imagen completa" + icono de lupa `MagnifyingGlassPlusIcon`) se superpone arriba-derecha (`absolute top-2 right-2`, mismo lenguaje visual que el pill de variaciones del grid: fondo `bg-white/80`, `rounded-full`, texto `text-xs`/`text-sm` gris oscuro), `aria-hidden` en el icono. El click que abre el lightbox se habilita en toda la imagen (y en el pill) para cualquier imagen visible, independientemente de su ratio; `cursor-pointer` siempre que haya imagen. La detección de ratio se conserva únicamente para sembrar el dimensionado del panel del lightbox (`knownRatios`), no para condicionar el pill ni la apertura. Motivo del cambio: el lightbox aporta valor (vista completa + zoom) también en imágenes cuadradas, así que se ofrece siempre en lugar de solo cuando hay recorte.

### D4 — Lightbox: estructura y comportamiento
- `Dialog` con backdrop `bg-black/70` (oscurecido "leve" pero suficiente contraste; transición de opacidad).
- El `DialogPanel` se dimensiona EXACTAMENTE a la caja renderizada de la imagen: con el ratio conocido (medido en `onLoad`, sembrado con los ratios del carrusel vía prop `knownRatios`), `width: min(92vw, calc(85vh * r))` y `height: min(85vh, calc(92vw / r))`. Así el elemento `<img>` (fill + `object-contain`) coincide con los píxeles visibles, los controles quedan superpuestos DENTRO de la imagen y cualquier click fuera de la imagen visible es un outside-click que cierra el Dialog (comportamiento nativo de Headless UI). Nota: un panel casi-viewport con la imagen letterboxeada dentro NO funciona — el `<img>` con `fill` ocupa todo el panel y los clicks en el letterbox no cierran.
- "X" arriba-derecha DENTRO de la imagen (`XMarkIcon` de heroicons, mismo tratamiento `bg-white/70 hover:bg-white rounded-full shadow` que las flechas).
- Cierre: click en cualquier punto fuera de la imagen visible (outside-click nativo de Dialog), botón X y tecla ESC (nativo de Dialog).
- Con `images.length > 1`: flechas prev/next DENTRO de la imagen en sus bordes, replicando exactamente las clases de las flechas actuales del carrusel (`absolute top-1/2 -translate-y-1/2 size-8 rounded-full bg-white/70 hover:bg-white ...`), navegación circular. El lightbox abre en el índice actual del carrusel y navega por TODAS las imágenes del producto (incluidas las cuadradas — dentro del lightbox no hay recorte, así que no hay motivo para excluirlas).
- El estado de índice del lightbox es propio (inicializado al abrir); no muta el índice del carrusel de fondo.

### D5 — Optimizador activo en dev vía rewrite proxy same-origin
- `next.config.js`: se elimina `unoptimized` (queda activo en todos los entornos) y se añade `rewrites()` solo-dev: `{ source: '/img-proxy/:path*', destination: '${INTERNAL_API_URL}/:path*' }` con fallback `http://localhost:3001/api` (cubre `next dev` fuera de Docker).
- `client/lib/api.js`: `getArtImageUrl`/`getOthersImageUrl` devuelven `/img-proxy/art/images/<basename>` y `/img-proxy/others/images/<basename>` cuando `process.env.NODE_ENV === 'development'` y no hay `CDN_URL` (Next inlina `NODE_ENV` también en el bundle cliente, por lo que la condición es estable en build). Al ser URLs relativas (same-origin), el optimizador las acepta sin `remotePatterns` y el fetch interno atraviesa el rewrite hasta `api:3001`.
- Alternativa considerada: añadir `{ protocol: 'http', hostname: 'localhost', port: '3001' }` a `remotePatterns` — descartada: el fetch server-side del optimizador desde el contenedor `client` no alcanza `localhost:3001`, que es exactamente el motivo del bypass actual.
- Prod/staging: los helpers siguen devolviendo URLs absolutas (CDN o API) y nada cambia.

### D6 — Zoom con rueda de ratón dentro del lightbox
- **Listener nativo no-passive:** el `onWheel` de React se registra passive en la raíz, por lo que `e.preventDefault()` se ignora. Para impedir de verdad el scroll/zoom de la página (incluido `ctrl`+rueda del trackpad) se adjunta el listener con `el.addEventListener('wheel', h, { passive: false })` vía `ref` sobre la caja de la imagen, solo mientras el lightbox está abierto. El `Dialog` ya bloquea el scroll del `body`, pero el `preventDefault` cubre el caso del zoom del navegador y el scroll-chaining.
- **Recorte al marco (`overflow-hidden`):** el panel ya se dimensiona al box exacto de la imagen; se le añade `overflow-hidden` y el zoom se aplica como `transform: translate() scale()` sobre un wrapper `absolute inset-0` (`transform-origin: 0 0`). Así el zoom amplía el detalle DENTRO del mismo rectángulo, se preserva "click fuera cierra" (el box no cambia de tamaño), y la X/flechas siguen en las esquinas (con `z-10` para quedar sobre la imagen transformada). Alternativa descartada: dejar que la imagen desborde a pantalla completa — degrada el cierre por click-fuera y tapa los controles.
- **Pan tipo lupa de tienda (sigue al cursor):** con `transform-origin 0 0`, la fracción de cursor `fx = mx/W`, `fy = my/H` (acotada a `[0,1]`) determina el translate: `tx = −fx·(s−1)·W`, `ty = −fy·(s−1)·H`. Así, al barrer el cursor de un borde a otro, la porción visible recorre todo el desbordamiento de la imagen; los límites quedan garantizados por `fx,fy ∈ [0,1]` (sin huecos, no hace falta clamp adicional). El zoom NO exige arrastre: el `pointermove` recalcula el translate desde la posición del cursor (solo cuando `scale > 1`, si no devuelve el mismo estado para evitar re-render). Escala acotada `[1, 5]`; la rueda re-ancla al cursor actual.
- **Reset:** el zoom vuelve al estado inicial cuando el cursor sale de la imagen (`pointerleave` → `ZERO_TRANSFORM`), y también vía efecto en `[open, safeIndex]` (abrir/cerrar y cambio de imagen).
- **Cursor:** por defecto sobre la imagen (sin `zoom-in`/`grab`), para no sugerir arrastre.
- **Táctil:** el pinch queda fuera de alcance (Non-Goal); sin gesto de pellizco.

## Risks / Trade-offs

- [El pill puede parpadear: el ratio solo se conoce tras `onLoad`] → Estado inicial "desconocido" = sin pill y sin click; el pill aparece al conocerse el ratio. No hay layout shift (es un overlay absoluto).
- [Rewrite dev: si `INTERNAL_API_URL` no está definido fuera de Docker] → Fallback a `http://localhost:3001/api`, que es el default ya usado por `serverApi`/`.env.example`.
- [El optimizador en dev añade latencia al primer render de cada imagen (resize on-demand)] → Aceptable en dev; las variantes quedan cacheadas en `.next/cache` (volumen `client_next` ya montado).
- [Doble descarga potencial: la variante del carrusel (~50vw) y la del lightbox (100vw) son distintas] → Aceptado: el lightbox solo carga al abrirse y el navegador reutiliza caché cuando la variante coincide.
- [`onLoad` con imágenes ya en caché del navegador] → `next/image` dispara `onLoad` de forma fiable también para imágenes cacheadas (usa el evento del `<img>` subyacente con `complete` check); no se requiere workaround.

## Migration Plan

Solo frontend, sin BD ni API. Deploy normal del cliente. Rollback = revert del commit. La parte del rewrite solo afecta a desarrollo local; verificar tras el cambio que `docker compose -f docker-compose.yml -f docker-compose.local.yml up` sirve las imágenes del grid vía `/_next/image`.

## Open Questions

- Ninguna bloqueante. (Confirmado con el usuario: el problema de calidad del grid ocurre solo en dev — moiré y lentitud — consistente con el bypass del optimizador.)
