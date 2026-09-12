## Why

El hueco que ocupa una imagen de producto antes de que llegue es hoy un rectángulo `bg-gray-200` inmóvil, idéntico al que deja una imagen rota o un producto sin foto. En `/galeria` y `/tienda` eso son hasta 24 cuadrados grises a la vez, y **nada en pantalla dice que haya algo en camino**: el visitante no distingue «cargando» de «vacío», que es exactamente la lectura que no queremos en una galería donde la imagen *es* el producto.

No es un caso de laboratorio. Cada variante de imagen se genera bajo demanda en `/_next/image` sobre un contenedor de 1 vCPU a partir de originales de ~1,5 MB — la primera visita a una obra paga ese coste completo — y el techo de render medido en producción (25 req/s en fichas) hace que la espera se alargue justo cuando más gente está mirando. El indicador es lo único que convierte esa espera en algo legible.

## What Changes

- **Un único componente compartido de marcador de posición animado** (`ImageLoadingPlaceholder`) que se pinta bajo la imagen dentro del contenedor gris que ya existe, y desaparece en cuanto la imagen está pintada. Ninguna caja cambia de tamaño, ninguna reserva de espacio se altera: sólo se rellena el gris que ya estaba ahí.
- **Aparición retardada (~200 ms).** Si la imagen llega antes (caché del navegador, caché de nginx, vuelta atrás del historial) no se muestra ninguna animación. Sin ese retardo, la navegación repetida se llena de parpadeos y el remedio es peor que la enfermedad.
- **Una página de muestrario temporal** con **20 propuestas de animación** —ninguna es la rueda/spinner/barra habitual; como mucho una variación reconocible de ellas— renderizada dentro de la propia aplicación para que se vea con el Tailwind, la tipografía Inter y los grises reales. **Es andamiaje: se borra antes de archivar el cambio**, y el resto de la implementación no la referencia.
- **La elección la hace el usuario**, no la propuesta. La implementación se detiene tras el muestrario y no continúa hasta que hay una animación elegida.
- **Degradación con `prefers-reduced-motion`**: quien haya pedido menos movimiento ve un marcador estático de contraste suave, nunca una animación en bucle.
- **Cobertura completa de las superficies con imagen de producto o evento** (decisión del usuario: todo, incluyendo eventos):
  - Rejillas: `ProductGrid` (`/galeria`, `/tienda`, `/galeria/autor/[slug]`, `/tienda/autor/[slug]`), `AuctionImageMosaic` (subastas), `DrawGridItem` (sorteos), el listado de `/live`.
  - Fichas de detalle: `ProductImageCarousel` (`/galeria/p/…`, `/tienda/p/…`, vista previa de admin), `ProductImageLightbox` (imagen completa), `AuctionDetail`, `DrawDetail`, `EventDetail` de `/live/[slug]`.

Sin cambios en la API, en la base de datos, en variables de entorno ni en la CSP.

## Capabilities

### New Capabilities
- `image-loading-indicator`: cuándo aparece y cuándo no un indicador de carga sobre el marcador de posición de una imagen, cómo se comporta con imágenes ya cacheadas y con `prefers-reduced-motion`, y qué superficies del escaparate deben tenerlo.

### Modified Capabilities
- _(ninguna)_ — `nextjs-image-usage`, `product-images` y `product-image-lightbox` siguen valiendo tal cual: este cambio no toca `fill`, `sizes`, `priority`, `alt` ni el origen de los `basename`. Sólo pinta dentro del contenedor que esas reglas ya obligan a existir.

## Impact

**Código nuevo**
- `client/components/ImageLoadingPlaceholder.js` — el marcador animado.
- `client/hooks/useImageLoaded.js` — el estado de carga con retardo, compartido por las diez superficies.
- `client/app/laboratorio-loaders/page.js` — **temporal**, el muestrario de 20. Se borra.

**Código modificado**
- `client/components/ProductGrid.js`, `ProductImageCarousel.js`, `ProductImageLightbox.js`, `AuctionImageMosaic.js`, `DrawGridItem.js`.
- `client/app/eventos/subasta/[id]/AuctionDetail.js`, `client/app/eventos/sorteo/[id]/DrawDetail.js`, `client/app/live/page.js`, `client/app/live/[slug]/EventDetail.js`.
- `client/app/globals.css` — los `@keyframes` de la animación elegida (Tailwind no trae ninguno que sirva; `animate-pulse` es precisamente el efecto que no queremos).
- `client/lib/constants.js` — el retardo de aparición, junto a las constantes de animación que ya viven allí.

**Riesgos conocidos, que el diseño tiene que resolver explícitamente**
- `onLoad` de `next/image` **no se dispara** si la imagen ya estaba completa antes de que React adjuntara el manejador (caché). Un indicador que espere ese evento se quedaría eternamente encendido sobre la imagen ya visible.
- Las fichas de autor y las páginas de eventos renderizan su rejilla en el servidor. El estado inicial debe ser «sin indicador» para que el HTML del servidor y el del cliente coincidan; sale gratis, porque es el mismo estado que exige el retardo.
- `client/` sigue sin runner de tests: toda la verificación de este cambio es manual y hay que dejarla enumerada.
