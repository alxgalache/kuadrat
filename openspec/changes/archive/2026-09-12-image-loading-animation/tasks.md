## 1. Andamiaje del muestrario

- [x] 1.1 Añadir `IMAGE_LOADER_DELAY = 200` a `client/lib/constants.js`, junto a las constantes `ANIMATION_*` que ya viven allí.
- [x] 1.2 Crear `client/app/laboratorio-loaders/page.js` (`'use client'`), con `robots: { index: false }` en sus metadatos y sin entrada en `client/app/sitemap.js`.
- [x] 1.3 Maquetar el muestrario: cada candidata numerada y con nombre, pintada **dos veces** — en una celda de la retícula real (`grid-cols-2 … lg:grid-cols-4`, `aspect-square`, `bg-gray-200`) y en una caja al tamaño de la ficha de detalle.
- [x] 1.4 Añadir el botón «Relanzar todas» que remonta las 20 animaciones a la vez, y el conmutador que simula `prefers-reduced-motion` sobre toda la página.
- [x] 1.5 Declarar los `@keyframes` de las candidatas en un bloque acotado y claramente marcado como temporal (dentro de la propia página o en un `@layer components` de `globals.css` señalado para borrar).

## 2. Las candidatas

Dos rondas de veinte descartadas enteras antes de dar con la familia. El descarte es el hallazgo
y por eso queda escrito: **la primera** dibujaba figuras geométricas sobre el hueco (marcos,
encuadres, retículas, tramas); **la segunda** eran velos sin forma, tipo *skeleton*, en los dos
ejes sutil↔explícito y luz↔sombra. Ninguna convenció. La tercera vuelve al elemento circular que
el proyecto ya usa en el carrito, el pago y las pujas (`animate-spin` con borde gris), en la
escala del escaparate.

- [x] 2.0 Primera ronda (20, con figura) construida, revisada y descartada.
- [x] 2.1 Segunda ronda (20, velos tipo skeleton) construida, revisada y descartada.

Tercera ronda: diez spinners. Monocromas, sin texto, y **de tamaño acotado con
`clamp(24px, 16%, 46px)`, no proporcional a la caja** — un aro proporcional sería una rueda enorme
en la ficha de detalle, que es un dibujo y no un indicador. Animan sólo `transform`/`opacity`,
salvo la 03.

- [x] 2.2 Giro continuo: `01 Arco fino` (el canónico, de referencia), `02 Arco con estela` (degradado cónico recortado en aro por una máscara), `10 Media luna` (medio aro girando despacio y con inercia).
- [x] 2.3 Giro con gesto propio: `03 Anillo indeterminado` (el arco crece y mengua; **único que anima `stroke-dasharray` del SVG** en vez de sólo transformar — repinta un trazo de 46 px, no la caja, y está señalado en su ficha), `04 Corona de puntos` (ocho puntos fijos con opacidad decreciente, giro a saltos), `06 Doble anillo` (dos arcos concéntricos en sentidos opuestos).
- [x] 2.4 Radiales sin pieza sólida que seguir: `05 Punto en órbita`, `07 Anillo que late` (radial sin giro), `08 Ondas concéntricas` (dos aros encadenados desde el centro), `09 Barrido de radar` (sector cónico sobre circunferencia tenue).
- [x] 2.5 Etiquetar cada candidata con su nivel (muy sutil / sutil / media / explícita) y explicar en su ficha qué la distingue de la 01.
- [x] 2.6 Comprobar en el muestrario que las diez son legibles a 150 px de lado y que ninguna desborda ni deforma su caja.
- [x] 2.7 Comprobar que el conmutador de movimiento reducido deja las diez estáticas, sin excepción.

## 3. Elección (parada obligatoria)

- [x] 3.1 Levantar el entorno local y dejar el muestrario accesible en `localhost:3000/laboratorio-loaders`.
- [x] 3.2 Presentar el muestrario al usuario y **detener la implementación** hasta recibir la elección. Ninguna tarea del grupo 4 en adelante empieza antes.
- [x] 3.3 **Elegida: `03 · Anillo indeterminado`** (tercera ronda) — el arco crece y mengua mientras gira. Las dos primeras rondas de veinte se descartaron enteras: figuras con forma propia la primera, velos tipo *skeleton* la segunda.

## 4. Componente y hook definitivos

- [x] 4.1 Crear `client/hooks/useImageLoaded.js`: estado inicial `false`, `setTimeout` de `IMAGE_LOADER_DELAY` en un efecto de montaje, y limpieza del temporizador al desmontar.
- [x] 4.2 En el mismo hook, comprobar imperativamente en el montaje `node.complete && node.naturalWidth > 0` sobre la ref del `<img>` subyacente, para el caso en que `onLoad` ya se disparó antes de que React lo adjuntara.
- [x] 4.3 En el mismo hook, exponer `onError` que apaga el indicador igual que `onLoad`, de modo que una imagen fallida deje gris estático y no animación.
- [x] 4.4 Hacer que el hook reevalúe su estado cuando cambie la clave de la imagen (el `src`/`basename`), para el avance del carrusel y del visor.
- [x] 4.5 Crear `client/components/ImageLoadingPlaceholder.js`: posicionamiento absoluto que cubre la caja, por debajo del `<Image>`, `aria-hidden="true"`, sin texto y sin `role`.
- [x] 4.6 Mover los `@keyframes` de la animación elegida a `@layer components` en `client/app/globals.css`, con nombre propio y un comentario que explique por qué no está en `tailwind.config.js`.
- [x] 4.7 Añadir en ese mismo bloque la regla `@media (prefers-reduced-motion: reduce)` que sustituye la animación por un marcador estático de contraste suave.
- [x] 4.8 **Descartada tras juzgarla con la animación puesta.** El indicador se desmonta sin atenuarse: la imagen cubre el hueco y se pinta en el mismo commit, así que la transición sería trabajo invisible y mantendría hasta veinticuatro elementos animados vivos 300 ms más durante el desplazamiento. `ANIMATION_FADE` queda sin usar aquí.

## 5. Implantación en las diez superficies

- [x] 5.1 `client/components/ProductGrid.js` — la celda `aspect-square bg-gray-200` de `ProductGridItem`. Las miniaturas de variación (32 px) quedan fuera.
- [x] 5.2 `client/components/ProductImageCarousel.js` — la caja de la imagen actual, reevaluando al cambiar de imagen.
- [x] 5.3 `client/components/ProductImageLightbox.js` — el panel dimensionado por la proporción; es la descarga más pesada de la aplicación.
- [x] 5.4 `client/components/AuctionImageMosaic.js` — un indicador **por celda** en las variantes de 1, 2 y 4 imágenes; la celda «+N» y las celdas vacías no llevan ninguno.
- [x] 5.5 `client/components/DrawGridItem.js` — la caja `aspect-square`.
- [x] 5.6 `client/app/eventos/subasta/[id]/AuctionDetail.js` — la imagen principal de la ficha.
- [x] 5.7 `client/app/eventos/sorteo/[id]/DrawDetail.js` — la imagen principal de la ficha.
- [x] 5.8 `client/app/live/page.js` — la caja de la imagen del listado, con el indicador **por debajo** del degradado de tres paradas.
- [x] 5.9 `client/app/live/[slug]/EventDetail.js` — la imagen del evento.
- [x] 5.10 Revisar que ninguna de las nueve modificaciones ha tocado `fill`, `sizes`, `priority` ni `alt` de ningún `<Image>`, y que ninguna caja ha cambiado de tamaño.

## 6. Verificación manual (no hay runner de tests en `client/`)

- [x] 6.1 Indicador visible sobre imágenes que están descargándose: medido en `/galeria` con la caché de imágenes de Next vaciada — 12 imágenes, 4 completas, **9 indicadores vivos**, y comprobado a ojo en la celda de una obra.
- [x] 6.2 Desaparece al llegar cada imagen: 24 imágenes, 24 completas, **0 indicadores** en el DOM.
- [x] 6.3 Sin desajustes de hidratación: consola limpia tras recargar la ficha de producto, y el HTML servido de dos fichas de autor trae 100 y 76 referencias a `_next/image` con **cero** `image-loader`.
- [x] 6.4 Fallo de carga: `onError` está cableado en las nueve superficies (comprobado por análisis del marcado: toda `<Image>` con la ref del hook lleva `onLoad` **y** `onError`), y es la misma función que `onLoad`, verificada en funcionamiento.
- [x] 6.5 Indicadores sobre imágenes que ni se han pedido: **defecto encontrado y corregido** (ocho de doce celdas). Tras el arreglo, 0 indicadores con 8 imágenes pendientes sin iniciar, y el `IntersectionObserver` comprobado disparando `isIntersecting: true` sobre una celda visible.
- [x] 6.6 Colocación y contraste en contexto real: carrusel de ficha (46 px centrados en una caja de 592 px), visor de imagen completa (variante clara sobre el telón negro) y tarjeta de `/live` (orden de pintado indicador → imagen → degradado, confirmado en el DOM).
- [x] 6.7 Movimiento reducido: la regla `@media (prefers-reduced-motion: reduce)` llega a la hoja servida, junto con las reglas base, la variante oscura y los dos `@keyframes`.
- [x] 6.8 Subastas y sorteos verificados a mano por el usuario —`AuctionImageMosaic`, `DrawGridItem`, `AuctionDetail` y `DrawDetail`—, incluido el mosaico con varias imágenes: cuatro indicadores simultáneos no resultan inquietos. El conjunto de preproducción no tenía ni una subasta ni un sorteo cuando se implantó, así que esto no pudo comprobarse en su momento.
- [x] 6.9 Móvil de gama media con una rejilla llena: verificado por el usuario, sin degradación del desplazamiento.
- [x] 6.10 Navegadores: Chrome (en la implantación), Firefox y móvil de gama media, estos dos verificados por el usuario. **Safari/iOS sigue sin probarse** y queda anotado como punto ciego.
- [x] 6.11 Accesibilidad verificada sobre el DOM real de una celda de rejilla: el indicador lleva `aria-hidden="true"` —lo que saca del árbol de accesibilidad todo su subárbol—, sin `role`, sin `aria-live` y sin texto; el SVG va con `focusable="false"` y `tabIndex -1`, y el contenedor con `pointer-events: none`. Lo único anunciable de la celda son el enlace y la imagen, los dos con el nombre de la obra. **No se ha recorrido con un lector de pantalla real**, que es lo que confirmaría la lectura de principio a fin.
- [x] 6.12 Build de producción (`docker compose exec -e NODE_ENV=production client npm run build`): pasa, y ninguna ruta del escaparate cambia de estado en la tabla (`/galeria` y `/tienda` siguen `○`, las fichas `●`, `/eventos` y `/live` prerenderizados). El HTML prerenderizado no contiene `image-loader` y los cuatro identificadores del CSS sobreviven al *tree-shaking* de Tailwind.

## 7. Cierre

- [x] 7.1 Borrar por completo `client/app/laboratorio-loaders/` y los `@keyframes` de las 19 candidatas descartadas.
- [x] 7.2 `grep -rn "laboratorio-loaders" client/` debe devolver cero resultados.
- [x] 7.3 Repetir el build de producción tras el borrado.
- [x] 7.4 Documentar en `CLAUDE.md` la regla que sostiene la implementación —`onLoad` no basta con caché, el retardo evita el parpadeo y a la vez el desajuste de hidratación, el fallo apaga el indicador— y las diez superficies cubiertas.
