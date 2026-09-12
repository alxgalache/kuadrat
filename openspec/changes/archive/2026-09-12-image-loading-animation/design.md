## Context

Diez superficies del escaparate pintan una imagen de producto o de evento dentro de una caja `aspect-*` con `bg-gray-200`, exactamente como exige la capacidad `nextjs-image-usage`. Ese gris es lo único que ve el visitante mientras la imagen viaja, y es indistinguible del gris que deja un producto sin foto o una imagen rota.

Tres hechos del proyecto condicionan la solución más de lo que parece:

1. **Las imágenes son remotas y se optimizan en tiempo de ejecución.** No hay `import` estático de ninguna imagen de producto: los `basename` son UUID que se resuelven contra S3/CloudFront y pasan por `/_next/image`. Eso descarta de entrada el camino estándar de Next (`placeholder="blur"` con `blurDataURL` generado en build) — ver Decisión 1.
2. **Parte de estas rejillas se renderizan en el servidor** (`/galeria/autor/[slug]`, `/tienda/autor/[slug]`, las fichas de subasta y sorteo). Cualquier estado inicial que difiera entre servidor y cliente es un desajuste de hidratación, y el proyecto ya pagó ese aprendizaje con `StoryVideo` y su `Math.random()` en un inicializador de `useState`.
3. **`client/` no tiene runner de tests.** Todo lo que se decida aquí se verifica a mano o no se verifica.

El usuario ha fijado tres cosas antes de empezar: alcance completo incluyendo eventos, muestrario dentro de la aplicación, y aparición retardada.

## Goals / Non-Goals

**Goals:**

- Que el hueco gris de una imagen que está llegando sea visiblemente distinto del hueco gris de una imagen que no existe.
- Un solo componente y un solo hook para las diez superficies. Diez copias de la misma lógica de carga es el error que `zoneResolver` documenta y que el `productCategory === 'others'` triplicado de `ProductForm` pagó.
- Cero movimiento visible cuando la imagen ya está en caché, que es el caso mayoritario en navegación dentro del sitio.
- Cero cambio de layout: la animación vive dentro de la caja que ya estaba reservada.
- Un muestrario que permita decidir mirando, no leyendo — con las 20 candidatas a los dos tamaños reales en que se van a ver.

**Non-Goals:**

- **No se genera LQIP/blurhash.** Ver Decisión 1.
- **No se cambia nada del transporte de imágenes**: ni `priority`, ni `sizes`, ni `deviceSizes`, ni `minimumCacheTTL`, ni el peso de los originales. Este cambio no hace que las imágenes lleguen antes; hace que la espera se entienda.
- **No hay indicador de carga global de página** (el `<p>Cargando...</p>` de `/galeria` y compañía se queda como está). El alcance es el hueco de una imagen concreta.
- **No se toca el admin** más allá de lo que herede `ProductImageCarousel` en `/admin/products/[id]/preview`, que usa el mismo componente y lo recibe gratis.
- **No se añade texto** («Cargando…») en ninguna de las superficies: la galería es deliberadamente muda y 24 rótulos serían ruido.

## Decisions

### Decisión 1 — Una animación CSS, no `placeholder="blur"`

Lo que Next ofrece de serie para este problema es `placeholder="blur"`: una miniatura base64 incrustada que se muestra desenfocada hasta que llega la real. **No es viable aquí sin un cambio mucho mayor que el pedido.** Next sólo genera el `blurDataURL` automáticamente para imágenes importadas estáticamente; para URLs remotas hay que suministrarlo, lo que significa calcular un LQIP por cada fila de `product_images` en el momento de la subida, guardarlo en una columna nueva y arrastrarlo por todas las consultas y por `attachProductImages`. Eso es una migración de esquema, un cambio en el pipeline de subida y un backfill de todo el catálogo, para un efecto que además no comunica «estoy esperando» sino «esto ya está, borroso».

Se descarta también como paso previo: el usuario ha pedido una animación y ha pedido elegirla. Queda anotado como evolución posible e independiente.

### Decisión 2 — La carga se detecta con `img.complete`, no sólo con `onLoad`

Es la trampa central de este cambio. `onLoad` es un manejador de React: si la imagen ya estaba completa en caché cuando React adjuntó el manejador —justo el caso de la vuelta atrás del historial o de la segunda visita—, **el evento ya se disparó y no vuelve a dispararse**. Un indicador que dependa sólo de `onLoad` se quedaría encendido para siempre encima de una imagen perfectamente visible.

`useImageLoaded` resuelve con tres señales, no una:

- un `ref` al `<img>` subyacente (`next/image` reenvía la ref) y una comprobación imperativa de `node.complete && node.naturalWidth > 0` en un efecto de montaje — `naturalWidth` importa porque una imagen fallida también reporta `complete: true`;
- `onLoad`, para el caso normal;
- `onError`, que **también apaga el indicador**. Una animación girando sobre una imagen que nunca va a llegar es peor que el gris estático: miente. Con `onError` el hueco vuelve a ser el gris de siempre, que es exactamente lo que esa situación es.

*Alternativa considerada:* envolver cada `<Image>` en un componente que retrase el montaje de la imagen hasta tener el estado listo. Rechazada: retrasa la descarga, que es lo contrario de lo que se busca, y rompe el `priority` del LCP.

### Decisión 3 — El estado inicial es «sin indicador», y el retardo vive en un `setTimeout` del efecto de montaje

`showLoader` arranca en `false`. Un `useEffect` programa un `setTimeout` de `IMAGE_LOADER_DELAY` (200 ms, en `client/lib/constants.js` junto a `ANIMATION_FADE` y compañía) que lo pone a `true` sólo si para entonces la imagen sigue sin cargar.

Esto resuelve dos problemas con una sola pieza:

- **El parpadeo.** Con caché la imagen está pintada mucho antes de 200 ms y no se ve ninguna animación. Sin el retardo, moverse por el catálogo sería un centelleo constante — el remedio percibido como defecto.
- **La hidratación.** `useEffect` no corre en el servidor, así que el HTML servido no contiene indicador alguno y el primer render del cliente tampoco. No hay desajuste posible, y no hace falta ningún `suppressHydrationWarning`. Es la misma regla que ya obliga a que todo contexto de `app/layout.js` lea `localStorage` desde un efecto y nunca desde un inicializador de `useState`.

200 ms es el umbral habitual por debajo del cual una espera se percibe como instantánea; queda como constante con nombre precisamente para poder moverlo mirando, no editando diez ficheros.

### Decisión 4 — El indicador se desmonta al cargar, y sólo anima `transform` y `opacity`

Dos reglas, las dos por el mismo motivo: el dispositivo del visitante.

- **Desmontar, no ocultar.** Una rejilla llena son hasta 24 animaciones en bucle; dejarlas corriendo detrás de imágenes ya pintadas es trabajo puro para el compositor sin nada que mostrar.
- **Sólo propiedades compuestas.** El *shimmer* clásico anima `background-position` sobre un degradado que cubre toda la caja, y eso repinta la caja entera en cada fotograma. Cualquiera de las 20 candidatas debe expresarse con `transform` y `opacity` sobre dos o tres elementos pequeños. Es un criterio de selección del muestrario, no un ajuste posterior.

### Decisión 5 — Los `@keyframes` van en `globals.css`, no en `tailwind.config.js`

`tailwind.config.js` está hoy prácticamente vacío (sólo la familia `Inter`), y eso es coherente con la regla de minimalismo extremo del proyecto: componentes de Tailwind sin modificar. Declarar la animación en `theme.extend` crearía una utilidad `animate-loquesea` disponible en toda la aplicación, que es precisamente por donde esa regla se erosiona.

`globals.css` ya tiene un `@layer components` (el bloque `.author-bio`, que existe por la misma razón: algo que Tailwind no da y que hay que acotar a un contenedor). La animación elegida vive ahí, con nombre propio, usada por un único componente y a un `git rm` de distancia si se cambia de idea. La CSP no estorba: `style-src` ya incluye `'unsafe-inline'`.

### Decisión 6 — El indicador es `aria-hidden`

No lleva `role="status"` ni texto alternativo. El `<Image>` que hay encima ya tiene su `alt` descriptivo, que es lo que un lector de pantalla necesita; anunciar además «cargando» veinticuatro veces en una rejilla es ruido, no accesibilidad. El indicador es decoración pura del hueco.

`prefers-reduced-motion: reduce` se atiende **en CSS, no en JavaScript**: una `@media` dentro del mismo bloque que define la animación, que la sustituye por un marcador estático de contraste suave. En JavaScript habría que consultar `matchMedia` y volveríamos a tener dos verdades que mantener de acuerdo, además de un valor distinto en servidor y cliente.

### Decisión 7 — El muestrario es una ruta real de la aplicación, y es andamiaje declarado

`client/app/laboratorio-loaders/page.js`, servida en `localhost:3000/laboratorio-loaders`. Con el Tailwind compilado del proyecto, la Inter real y el `bg-gray-200` real, que es la única forma de que lo que se elija sea lo que luego se vea.

Condiciones que la ruta debe cumplir mientras exista:

- `robots: { index: false }` en sus metadatos y **fuera de `client/app/sitemap.js`** — no vaya a ser que un despliegue accidental la publique;
- no la importa ningún componente de la aplicación, y ella no aporta nada que la aplicación necesite: se borra entera con `rm -r` y no queda referencia colgando;
- **se borra antes de archivar el cambio**, y esa es una tarea explícita, no un recordatorio.

*Alternativa considerada:* un HTML suelto en el directorio de scratch o publicado como Artifact. Rechazada para la decisión: reproduce el estilo «muy parecido», y «muy parecido» es justo lo que no sirve cuando lo que se está juzgando es un gris sobre otro gris a 300 px.

### Decisión 8 — Las 20 candidatas se juzgan a los dos tamaños reales, y a la vez

Una animación que funciona a 600 px en la ficha puede ser invisible a 150 px en una celda de rejilla en móvil, y una que funciona pequeña puede resultar aparatosa grande. El muestrario pinta cada candidata **dos veces**: en una celda de rejilla al tamaño real (la misma retícula `grid-cols-2 … lg:grid-cols-4` y el mismo `aspect-square`) y en una caja de ficha de detalle. Cada una va numerada y con nombre, para que la elección se pueda comunicar en una palabra.

El muestrario incluye además un control para relanzar todas las animaciones a la vez (el estado real dura un instante y no se puede juzgar de reojo) y un conmutador que simula `prefers-reduced-motion`, porque esa variante también hay que verla.

**Criterios que acotan las 20.** La primera ronda los fijó por descarte, y ese descarte es el hallazgo de diseño de este cambio, no un contratiempo: se construyeron veinte piezas con **figura** —marcos, passepartouts, encuadres, retículas, tramas de semitono, un arco segmentado cuadrado— y el usuario las rechazó todas. Las dos únicas que se salvaron (un barrido diagonal y una cortinilla) eran precisamente las dos que **no dibujaban nada**: un velo pasando sobre el gris.

La regla que sale de ahí, y que gobierna la segunda ronda: **el indicador no tiene forma propia.** Un glifo centrado en el hueco de una obra compite con la obra que va a ocupar ese hueco, y en una galería deliberadamente muda eso se lee como ruido. Lo que encaja es lo que un *skeleton* hace: una variación de luz que recorre o late sobre el marcador, y que se percibe como «esto está en camino» sin pedir que se la mire.

- Sin figura: velos y degradados de borde a borde, nunca un objeto centrado.
- Monocromas sobre el `gray-200` del escaparate, sin color, sin marca, sin texto.
- Expresables con `transform`/`opacity` sobre un degradado **estático** (Decisión 4).
- Legibles a 150 px de lado.

**Dos ejes, y las 20 los recorren:**

- **Cuánto se nota.** Las candidatas van ordenadas de menos a más explícita —de una respiración plana sin dirección hasta un barrido nítido y rápido— de modo que bajar por el muestrario *es* recorrer el eje. Eso convierte «no sé cuánto quiero que se note» en una decisión que se toma mirando.
- **Polaridad.** `luz` aclara el gris (el brillo clásico del skeleton); `sombra` lo oscurece, que es lo que hacían las dos supervivientes de la primera ronda. Tres parejas del mismo gesto en ambas polaridades (04/05, 08/09, 11/12) permiten decidir este eje **por separado** del anterior, en vez de confundir «demasiado evidente» con «demasiado oscuro».

### Decisión 9 — Qué recibe indicador en cada una de las diez superficies

| Superficie | Caja que lo recibe | Nota |
|---|---|---|
| `ProductGrid` | la celda `aspect-square bg-gray-200` | cubre `/galeria`, `/tienda` y las dos fichas de autor |
| `ProductImageCarousel` | la caja `aspect-square` de la imagen actual | se reevalúa al cambiar de imagen: la siguiente no está descargada |
| `ProductImageLightbox` | el panel dimensionado por la proporción | es la descarga más pesada de la aplicación; donde más se nota |
| `AuctionImageMosaic` | **cada celda**, no el mosaico entero | cada imagen llega por su cuenta; un indicador único seguiría animando sobre celdas ya pintadas, contra la Decisión 4. Hay que mirarlo: cuatro indicadores a la vez en 2×2 pueden resultar inquietos, y si lo son se reduce la intensidad, no el criterio |
| `DrawGridItem` | la caja `aspect-square` | |
| `AuctionDetail`, `DrawDetail` | la imagen principal de la ficha | |
| `/live` (listado) | la caja de la imagen, **bajo el degradado** | el degradado de tres paradas que funde imagen y texto se pinta encima |
| `/live/[slug]` `EventDetail` | la imagen del evento | |

Las miniaturas de variación de `ProductGridItem` (32 px) y los iconos de `EventBadge` quedan fuera: a ese tamaño no hay animación legible y el hueco no se percibe como espera.

## Risks / Trade-offs

- **`onLoad` que nunca llega por caché → indicador eterno sobre una imagen visible.** → Decisión 2: comprobación imperativa de `complete && naturalWidth > 0` en el montaje, además del evento.
- **Imagen que falla (404, red caída) → animación mintiendo indefinidamente.** → `onError` apaga el indicador y deja el gris estático.
- **Desajuste de hidratación en las rutas renderizadas en servidor.** → Decisión 3: estado inicial `false` y retardo en un efecto; el servidor no emite indicador alguno.
- **Parpadeo en navegación repetida**, que convertiría una mejora en una molestia. → el retardo de 200 ms; y si en revisión sigue apareciendo, el ajuste es una constante con nombre, no una refactorización.
- **Coste de CPU en móvil con una rejilla llena**, y en particular con las imágenes que aún están fuera de pantalla: el temporizador corre al montar, así que una celda por debajo del pliegue puede tener su indicador animando sin que nadie lo mire. → sólo `transform`/`opacity`, desmontaje al cargar, y un máximo de tres elementos animados por indicador. **A verificar en un móvil de gama media**, no sólo en el portátil; la alternativa (arrancar el temporizador con un `IntersectionObserver`) añade un observador por celda y se deja como salida si la medición lo pide.
- **Cuatro indicadores simultáneos en el mosaico de subasta.** → anotado en la Decisión 9 como punto de revisión visual explícito.
- **La ruta del muestrario se queda olvidada en el repositorio.** → `noindex`, fuera del sitemap, y una tarea de borrado que bloquea el archivado del cambio.
- **Nada de esto tiene test automático.** `client/` sigue sin runner. → la lista de verificación manual es parte de las tareas, enumerada superficie por superficie y navegador por navegador, no un «probar que funciona».

## Migration Plan

Despliegue normal del cliente, sin pasos previos: no hay columnas, ni variables de entorno, ni contrato con la API, ni nada que deba desplegarse acompasado. Un despliegue del cliente basta y el purgado de caché de nginx es el de siempre (obligatorio en todo despliegue de cliente, porque el HTML cacheado referencia *chunks* que el nuevo build ya no tiene).

Reversión: revertir el commit del cliente y redesplegar. El estado anterior es el gris inmóvil, que sigue funcionando.

El único orden que importa es interno al cambio: **el muestrario se revisa y se elige antes de tocar ninguna de las diez superficies**, y el borrado del muestrario es lo último.

## Open Questions

Las tres se resolvieron durante la implementación:

- **Cuál de las veinte.** Hicieron falta **tres rondas**. La primera (figuras: marcos, encuadres, retículas, tramas) se descartó entera; la segunda (velos tipo *skeleton*, en los ejes sutil↔explícito y luz↔sombra) también. La elegida es **un anillo indeterminado** —el arco crece y mengua mientras gira— de una tercera ronda de diez spinners. El recorrido tiene una lectura útil: lo que encaja en el hueco de una obra no es ni un dibujo con forma propia ni un velo casi imperceptible, sino el elemento convencional de espera, discreto y pequeño.
- **Si el indicador debe atenuarse al llegar la imagen.** **No se atenúa: se desmonta.** La imagen cubre por completo el hueco (`object-cover`, y `object-contain` sobre un panel dimensionado por la proporción en el visor) y se pinta en el mismo commit en que el indicador desaparece, así que una transición de salida sería trabajo que nadie llega a ver — y mantendría un elemento animado vivo 300 ms más por celda, hasta veinticuatro a la vez durante el desplazamiento. `ANIMATION_FADE` queda sin usar aquí.
- **Si cuatro indicadores en el mosaico de subasta resultan inquietos.** **No lo resultan.** No pudo comprobarse al implantarlo —el conjunto de preproducción no tenía ni una subasta ni un sorteo, `/api/auctions` y `/api/draws` devolvían cero en todo 2026-2027—, y lo verificó después el usuario a mano sobre subastas y sorteos reales, junto con las dos fichas. Se queda como está: cada celda gestiona su propio indicador.

## Lo que cambió respecto a lo previsto

- **El indicador no arranca al montar la celda, sino cuando el navegador va a pedir la imagen.** `next/image` marca como `loading="lazy"` todo lo que no lleva `priority`, y una celda lejos del área visible no ha iniciado la descarga (`currentSrc` vacío). Medido en `/galeria`: **ocho de doce celdas** con el indicador girando sobre imágenes que nadie había pedido, y que con el scroll infinito no se resuelven nunca. Eso no es un coste de CPU, es una afirmación falsa — el indicador dice «esto viene en camino» cuando no hay nada en camino. `useImageLoaded` arma el temporizador desde un `IntersectionObserver` con `rootMargin: 200px`, que es además la respuesta al riesgo de CPU que este documento ya anotaba.
- **El tamaño es fijo (`clamp(24px, 16%, 46px)`), no proporcional.** Salió de mirar el muestrario a los tres tamaños reales: un aro proporcional al hueco mide 80 px en la ficha de detalle y deja de leerse como indicador para leerse como dibujo.
- **El `stroke-dasharray` es una excepción admitida a la regla de «sólo `transform` y `opacity`»**, y la regla se reescribió para decir lo que de verdad protege: que el repintado no alcance la caja de la imagen. El trazo repinta los 46 px del anillo.
- **El giro acabó sobre el `<circle>` y no sobre el `<svg>`,** tras un temblor que el usuario detectó probando con 3G. Girando el `<svg>` la caja se compone como textura y se remuestrea en cada ángulo: con 34,5 px de lado y un trazo de 2,16 px de dispositivo a `devicePixelRatio` 1, eso redistribuye el antialiasing del anillo entero en cada fotograma. Girando el `<circle>` la rotación es contenido del SVG, se rasteriza en espacio de dispositivo, y un anillo simétrico de revolución da los mismos píxeles a cualquier ángulo. Se descartó primero la hipótesis geométrica midiendo el centro en ocho ángulos: **deriva 0,0000 px**. Es también la razón por la que la Decisión 4 habla de área repintada y no de «propiedades compuestas»: componer el giro aparte no ahorraba nada, porque la animación del trazo ya obliga a repintar la capa en cada fotograma.
- **La animación tiene una variante para el visor de imagen completa** (`.image-loader--on-dark`): allí no hay hueco gris detrás sino el telón negro del diálogo, y el `gray-400` no se ve.
