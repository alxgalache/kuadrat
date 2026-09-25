## Context

### Qué se midió, y cómo

Punto de partida: PageSpeed Insights (móvil, Lighthouse 13.5, 25/09/2026 10:09) sobre `https://140d.art/galeria` → **82**, FCP 2,0 s, LCP 4,5 s, Speed Index 3,5 s, TBT 0, CLS 0. Tres avisos: CSS que bloquea el render (14,4 KiB), «JavaScript antiguo» (14 KiB estimados en `2cnjjkibz7aog.js`) y candidatos a `preconnect` (`analytics.140d.art`, `api.140d.art`).

Para no diseñar sobre suposiciones se reprodujo con Lighthouse 13.5 local contra producción, en los dos modos:

| `/galeria` | Rendimiento | FCP | LCP | SI | TBT | CLS |
|---|---|---|---|---|---|---|
| Simulado (Lantern, lo que usa PSI) | 99 | 1,0 s | 1,3 s | 1,9 s | 100 ms | 0,036 |
| **Throttling aplicado** (4G lenta real + CPU ×4) | 88 | **2,7 s** | **2,7 s** | 3,4 s | 180 ms | 0,036 |

La diferencia entre PSI (82) y el simulado local (99) no es ruido del sitio, es cómo trabaja Lantern: estima el LCP con **todas las peticiones que terminaron antes del LCP observado** en una ejecución sin limitar (`LargestContentfulPaint.getPessimisticGraph`, `cutoffTimestamp: lcp`). En la máquina de PSI, más lenta, el primer pintado observado ocurre después de que hayan llegado muchos de los 17 chunks de JS, y todos ellos entran en la estimación; en la local, el pintado a 158 ms deja fuera casi todo. **Lo que reduce el LCP de PSI es reducir lo que se descarga antes del primer pintado**, no un recurso concreto.

La ejecución con throttling aplicado enseña el mecanismo sin modelo de por medio:

```
    0 ─ 701 ms   /galeria (HTML, 16 KB)
  640 ms         se lanzan A LA VEZ:
                   CSS 14 KB (VeryHigh) ................ termina 2.680 ms  ← bloquea el render
                   Inter 48 KB (High) .................. termina 4.691 ms
                   4 imágenes precargadas (High) ....... terminan 2.8–4.2 s
                   analytics.140d.art/js/pa-….js (High)  otro origen, otra conexión TLS
                   17 chunks JS, ~408 KB gzip (Low) .... terminan 1.9–5.3 s
 2.680 ms        FCP = LCP (texto del banner de cookies, visitante nuevo)
~5.600 ms        hidratado → GET /api/users/authors + GET /api/art?page=1 (cada uno con preflight OPTIONS)
```

La prioridad VeryHigh del CSS no lo protege: nginx 1.24 no reordena lo que ya está en los búferes TCP, y 400 KB de JS «Low» comparten el mismo enlace. **La hoja de 14 KB tarda dos segundos porque compite.**

### De qué está hecho el JavaScript inicial

Descargados los chunks de producción e identificado su contenido por cadenas:

- `2cnjjkibz7aog.js` (105 KB gzip): Next router + Sentry + **Session Replay (rrweb)**, ~35–40 KB gzip solo este último. Aquí están los 8 avisos de «JavaScript antiguo»: 7 son `next/dist/build/polyfills/polyfill-module` (~1,2 KB reales, protegidos por `in`), y `Array.from` es el parche de rrweb.
- `1cibg66ra42lm.js` + `28mjalw3lw_9q.js` + `416ge5xqtgnev.js` (~57 KB gzip): **la cesta** — Stripe Elements, autocompletado de Google Maps, paso de envío/Sendcloud, restos de Revolut — más newsletter y banner de cookies. Llegan en todas las páginas porque `Navbar` importa `ShoppingCartDrawer` de forma estática y `Navbar` vive en el layout raíz.
- `1s3ha3449y-ur.js` (11 KB gzip): **DOMPurify**, arrastrado en los listados por `AuthorModal` → `SafeHTML`.
- Headless UI + Floating UI (~40 KB gzip): menú de la navbar, notificaciones. Se queda (ver Non-Goals).

### Otras páginas (Lighthouse simulado, local)

| Ruta | Puntuación | LCP | Elemento LCP | Hallazgos |
|---|---|---|---|---|
| `/` | 93 | 3,2 s | `<video>` de la portada | CLS 0,04: el contenedor del vídeo cambia de ancho al llegar sus metadatos |
| `/tienda` | 99 | 1,4 s | banner de cookies | igual que `/galeria`; CLS 0,064 (filtro de autores tardío) |
| `/galeria/p/[slug]` | 83 | 4,5 s | imagen de la obra (150 KB) | mismo patrón: JS que termina antes del LCP observado |
| `/eventos` | 98 | 1,3 s | banner de cookies | 2 GET a la API al montar, cada uno con preflight |
| `/galeria/artistas` | 100 | 1,4 s | banner de cookies | — |

Todas cargan ~390–420 KB gzip de JS inicial y la misma hoja externa.

### Restricciones que condicionan el diseño

- Producción: `t4g.medium` (2 vCPU), contenedor `client` con `cpus: 0.5` y 1.500 MB; el techo medido del sitio es la CPU de Next, no la red.
- Caché ISR en memoria (`cache-handler.js`, un `Map` sin tope) y caché de páginas de nginx que `./deploy/deploy.sh` purga en cada despliegue.
- `client/` no tiene runner de tests: la verificación del cliente es manual y con instrumentación en el navegador. `api/` sí tiene suite.
- Público mayoritario: primera visita, móvil, desde Instagram (ver `production-load-hardening`). Optimizar la primera carga pesa más que la segunda.

## Goals / Non-Goals

**Goals:**
- Que nada compita con la hoja de estilos antes del primer pintado: CSS en el flujo del HTML y ningún recurso de terceros con prioridad alta en el `<head>`.
- Recortar del JS inicial de todas las páginas lo que solo se usa tras una interacción: cesta, modales y Session Replay. Objetivo verificable: **rrweb, Stripe Elements y el código de la cesta ausentes de los chunks que referencia el HTML** de `/galeria`, `/` y `/galeria/p/[slug]`.
- Que `/galeria` y `/tienda` no hagan ninguna petición a la API durante la carga, y que su CLS vuelva a 0.
- Que ninguna lectura anónima a la API pague un preflight CORS.
- CLS 0 en la portada.

**Non-Goals:**
- Una puntuación concreta en PSI. La varianza entre ejecuciones de PSI es de ±5–10 puntos y Lantern no es lineal; el compromiso es medir antes y después con el mismo procedimiento, no un número.
- Quitar los polyfills de Next (ver proposal: ~1,2 KB reales, aviso sin puntuación, y `URL.canParse` es imprescindible para Safari 16.4–16.x).
- Brotli, calidad de imagen, vídeos de portada, Headless UI, partición de Tailwind por ruta, prefetch de la rejilla, CLS de `/eventos`, recarga al montar de las fichas de artista: ver proposal, «Non-goals».
- Las balizas de New Relic del informe de PSI: no salen de la aplicación (comprobado en HTML, en los 20 chunks y en cinco ejecuciones locales).

## Decisions

### D1. CSS en línea con `experimental.inlineCss`

`next.config.js` → `experimental: { inlineCss: true }`. Next sustituye el `<link rel="stylesheet">` por un `<style data-precedence="next" data-href="…">` con el contenido de la hoja, **solo en respuestas HTML** (`render-css-resource.js`: `entryCssFile.inlined && !isRSCRequest`); las navegaciones de cliente siguen referenciando el fichero.

**Por qué:** es la única opción que elimina la competición de raíz — los bytes del CSS viajan en el flujo del documento, que se envía primero, en lugar de en una petición que nace a la vez que 400 KB de JS. En el grafo de Lantern desaparece el único nodo que bloquea el FCP además del documento.

**Coste aceptado, y medido:** Next incrusta la hoja **dos veces** —en el `<style>` del `<head>` y otra, escapada como cadena JSON, dentro del payload RSC que va al final del documento— y gzip no deduplica copias separadas por más de 32 KB. El HTML de `/galeria` pasa de 19 a **58 KB gzip** (+39 KB, el triple de lo estimado al diseñar). La copia del payload cae detrás de todo el marcado visible, así que no retrasa el primer pintado, pero sí alarga la descarga del documento. Un visitante que recarga vuelve a traer ese CSS (la hoja externa tenía caché `immutable` de un año). La caché ISR guarda ~140 KB más por entrada: con el catálogo actual, decenas de MB sobre 1.500.

**Por qué compensa aun así (A/B sobre la misma compilación, ver tasks 8.3):** con throttling aplicado, el FCP/LCP de `/galeria` pasa de 1.510 ms a **805 ms** con el CSS en línea y se queda en 1.519 ms sin él aunque el resto del cambio esté aplicado; en el modo simulado de PSI, la puntuación es 99 frente a 94.

**Turbopack:** el binario `next-swc` 16.2.12 declara `inline_css` en su `NextConfig`, pero eso no prueba que el manifiesto lo marque. **Puerta de verificación:** el HTML de la compilación de producción debe contener el `<style data-href>` y ningún `<link rel="stylesheet">` a `/_next/static/chunks/*.css`. Si no, se para aquí y se reevalúa (no hay plan B que no sea un cambio de empaquetador).

**Primera navegación de cliente:** el payload RSC trae `<link rel="stylesheet" precedence>`, y cabía que React no reconociera el `<style data-href>` servido como el mismo recurso y suspendiera el commit hasta descargar la hoja. **Verificado que no ocurre:** con 4G lenta y CPU ×4, la navegación de `/galeria` a una ficha no pide ningún `.css` y pinta con estilos a los 94 ms del clic. La mitigación prevista (prefetch en reposo de las hojas en línea) no hace falta.

**Alternativas descartadas:**
- *CSS crítico extraído* (`experimental.optimizeCss` / beasties): pensado para Pages Router, añade una fase de compilación, y en un sitio de utilidades Tailwind el CSS «crítico» es casi toda la hoja.
- *Mantenerla externa y solo aligerar el JS* (D2): reduce la competición pero conserva el viaje de ida y vuelta, y no resuelve la priorización de nginx.
- *`net.ipv4.tcp_notsent_lowat=16384` en la instancia*: haría efectiva la priorización HTTP/2 para usuarios reales y es un cambio de una línea, pero es de operación, Lantern no lo modela y no sustituye a D1. Queda como seguimiento opcional (Open Questions).

### D2. La interfaz de interacción se descarga bajo demanda

Patrón único: el hook `useOnDemandComponent(load, open, onLoadError)` (`client/hooks/useOnDemandComponent.js`), con `load = () => import(...)` declarado fuera del componente. Descarga el módulo la primera vez que `open` pasa a verdadero (o cuando alguien pide `mount()`), **lo monta cerrado y lo abre en el fotograma siguiente**, y a partir de ahí lo deja montado para que la animación de cierre y el estado interno se conserven igual que hoy. Expone también `preload()` para la intención y el reposo.

**Por qué no `next/dynamic`, como se planteó al principio:** monta el componente con las props del momento en que llega el chunk, y en ese momento `open` ya es verdadero. Un `Transition` de Headless UI que nace abierto no anima la entrada —`AuthorModal` usa `<Transition show={open}>` sin `appear`—, así que el modal aparecería de golpe. Montarlo cerrado y abrirlo después reproduce la secuencia de siempre; verificado en Chrome headless: la cesta se desliza desde `translateX(372px)` y la biografía hace el fundido completo, las dos abiertas en frío. Si la descarga falla, `onLoadError` devuelve `open` a falso para que el siguiente clic lo reintente.

**Cesta (`Navbar` → `ShoppingCartDrawer`):**
- El escuchador de `open-cart-drawer` (lo disparan `/pago-fallido` y `/pago-cancelado`) sigue en `Navbar`, que siempre está cargado; ahora además marca `hasOpened`.
- **Precarga por intención:** `pointerenter`, `focus` y `touchstart` del botón de la cesta llaman a `import('./ShoppingCartDrawer')` — mismo especificador, mismo chunk. **Precarga en reposo** cuando la cesta tiene artículos: quien ya añadió algo es quien la va a abrir.
- **Orden Revolut pendiente:** la cesta tiene un efecto *de montaje* que restaura una orden Revolut de `sessionStorage` y la cancela si la cesta cambió. Montada solo al abrir, ese efecto se retrasaría. Si `sessionStorage` contiene la clave, `Navbar` monta la cesta (cerrada) en reposo, preservando el comportamiento exacto. La clave (`kuadrat_revolut_order_cache`) pasa a `lib/constants.js` para que los dos lectores no tengan literales que puedan divergir.
- **Animación de entrada:** montar un `Dialog` de Headless UI ya con `open` puede saltarse la transición de entrada. Se verifica; si ocurre, se monta cerrado y se abre en el fotograma siguiente.

**`AuthorModal`:** ocho consumidores lo renderizan siempre (listados, fichas, eventos). Un envoltorio `components/LazyAuthorModal.js` encapsula el patrón y los consumidores solo cambian el import. En los listados se lleva con él DOMPurify; en las fichas DOMPurify sigue haciendo falta para la descripción renderizada en servidor, y lo que se ahorra es el propio modal.

**`NewsletterSubscribeModal`:** lo monta `NewsletterBanner` (layout raíz); el pie lo abre por el evento `open-newsletter-modal`, cuyo escuchador se queda en el banner.

**Sentry Session Replay:** se quita `Sentry.replayIntegration()` de `integrations` y se añade tras `load` + `requestIdleCallback` (con `setTimeout` de respaldo, `client/lib/idle.js`) con `Sentry.addIntegration`. El `import()` apunta a `client/lib/sentryReplay.js`, que sólo hace `export { replayIntegration } from '@sentry/nextjs'`: el `import('@sentry/nextjs')` directo sí sacaba rrweb del bundle inicial, pero el chunk diferido llevaba **el SDK completo** (feedback, replay de canvas, profiler…: 105 KB gzip). Con la reexportación con nombre el chunk es sólo Replay, 39 KB gzip, y no depende de ninguna ruta interna del SDK. Los ratios (`replaysSessionSampleRate`, `replaysOnErrorSampleRate`) se quedan en `Sentry.init`: la integración los lee al registrarse. Tracing, captura de errores y `onRouterTransitionStart` siguen desde el primer instante. El cableado es idéntico en desarrollo (el transporte sigue mudo por `enabled`), como exige `sentry-environment-gating`.
- **Puerta de verificación:** `@sentry/nextjs` se importa estáticamente en el mismo fichero, así que un `import('@sentry/nextjs')` puede no generar un chunk aparte. La comprobación es `rrweb` ausente de los chunks del HTML y presente en uno asíncrono pedido tras `load`. Si Turbopack no lo separa, se prueba `import('@sentry/browser')`; si tampoco, `Sentry.lazyLoadIntegration('replayIntegration')`, que lo trae del CDN de Sentry y exige añadir `https://browser.sentry-cdn.com` a `script-src` (y lo cortan los bloqueadores). La elección final queda anotada en el código.
- **Coste aceptado:** un error en los primeros segundos, antes de que Replay se registre, llega a Sentry sin grabación; las sesiones muestreadas empiezan a grabar tras la carga.

**Medición:** suma de los tamaños gzip de los `<script src>` del HTML de `/galeria`, `/` y `/galeria/p/[slug]` (sin el chunk `noModule`, que los navegadores modernos no descargan), antes y después. Se estimaron 90–110 KB gzip menos; **medido: 55–66 KB por ruta (~17 %)**, de 377 a 312 KB en `/galeria`. Lo que queda (`route-bundle-stats.json`): react-dom 63 KB, runtime de Next con el núcleo de Sentry 80 KB, Headless UI con Floating UI ~40 KB, heroicons 14 KB, y el layout y la página.

**Alternativa descartada:** quitar Session Replay. Es una decisión de producto, no de rendimiento, y cargarla tarde conserva casi todo su valor.

### D3. El tracker de analítica sin precarga en el `<head>`

`<Script strategy="afterInteractive" src=…>` hace en App Router un `ReactDOM.preload(src, { as: 'script' })` (`next/dist/client/script.js`): un `<link rel="preload">` **de prioridad alta** a otro origen, con su DNS, TCP y TLS, en plena ventana crítica. Lantern lo cuenta como bloqueante del FCP si termina antes del pintado observado (`hasRenderBlockingPriority`: script High), y es el candidato a `preconnect` de «330 ms» del informe.

Se sustituye por un `<Script id="plausible-loader" strategy="afterInteractive">` **en línea** que crea el `<script async src>` con la URL literal. Next no precarga scripts en línea, y el momento de ejecución es el mismo que hoy: tras hidratar. Lo único que cambia es que la descarga de 6 KB empieza después en vez de antes. El stub `plausible-init` (`beforeInteractive`) no se toca: la cola de eventos sigue funcionando desde el primer instante. El literal sigue en `app/layout.js` y la CSP no cambia.

**Alternativas descartadas:**
- *`preconnect` a `analytics.140d.art`*: acalla el aviso sin ganar nada — la precarga ya abre esa conexión en el mismo punto del `<head>` — y deja el recurso de terceros compitiendo.
- *`strategy="lazyOnload"`*: espera a `load` (todas las imágenes no diferidas) y a reposo; en móvil lento son varios segundos, y las salidas rápidas del tráfico de Instagram dejarían de contarse. Es una pérdida de datos a cambio de 6 KB.

### D4. Listados sembrados que no repiten la carga al montar

Hoy `useGalleryProducts` recibe la página 1 del servidor y, por diseño explícito, **la vuelve a pedir al montar**: era la única forma de conocer `hasMore`, que el servidor no enviaba. Y `useGalleryAuthors` pide los autores al montar porque nadie los siembra.

- `fetchCatalogPage` (`lib/serverApi.js`) devuelve `{ products, hasMore }`, y ante cualquier fallo `{ products: [], hasMore: false }`, conservando el criterio de «nunca romper el `docker build`».
- `app/galeria/page.js` y `app/tienda/page.js` siembran productos, semilla, `hasMore` y autores (`fetchAuthors(category)`, que ya existe). Las fichas de artista siembran autores.
- `useGalleryProducts`: con siembra completa (productos no vacíos y `hasMore` conocido) **y sin instantánea de restauración**, la carga de montaje no llama a la API; fija `hasMore`, la semilla y la notifica a la restauración. Con instantánea la siembra no cuenta como completa ni siquiera para el estado inicial de `hasMore`: al volver atrás el navegador recoloca el scroll antes de que llegue la rehidratación, y con `hasMore` ya en verdadero el centinela del scroll infinito disparaba la página 2 en paralelo a la restauración (visto en la verificación y corregido). La rama sembrada apaga `isInitialLoad` con el estado y no con la referencia, porque StrictMode ejecuta el efecto de montaje dos veces. Con instantánea (volver atrás desde una ficha), el comportamiento de hoy: rehidrata N páginas en una petición. Sin siembra (la API falló en la compilación, o fichas de artista), el de hoy. Como los tres valores del servidor solo tienen sentido juntos, se agrupan en un único argumento en lugar de añadir un sexto posicional.
- `useGalleryAuthors`: con autores sembrados no pide nada.

**Frescura:** la página 1 pasa a ser tan fresca como el ISR (≤ 5 min, más lo que nginx sirva caducado). Es la misma frescura que ya tienen las fichas. Las páginas 2+ se piden en vivo con la misma semilla; si el catálogo cambió entre la compilación y el desplazamiento, `Concatenación sin duplicados` (`grid-infinite-scroll`) ya filtra repeticiones, y la posible omisión de una obra es la misma clase de anomalía que hoy existe entre la página 1 y la 2, con una ventana más larga.

**Efecto colateral buscado:** el filtro de autores de móvil (`AuthorMobileFilter`) se pinta hoy vacío y crece al llegar los autores, empujando la rejilla — es exactamente el CLS de 0,036 (`/galeria`) y 0,064 (`/tienda`). Sembrado, viene completo en el HTML.

### D5. Lecturas anónimas sin preflight CORS; los preflights restantes, cacheados

`apiRequest` (`lib/api.js`) añade `Content-Type: application/json` a toda petición que no sea `FormData`, también a los GET sin cuerpo. Ese encabezado, con ese valor, convierte una petición simple en una que exige preflight: cada lectura anónima (catálogo, autores, eventos, subastas, sorteos) cuesta un `OPTIONS` y un viaje de ida y vuelta extra.

- **Cliente:** en `GET` y `HEAD` no se envía `Content-Type`. Se limita a esos métodos deliberadamente: es donde está todo el beneficio (las demás llevan cuerpo o `Authorization`, que exige preflight igual), y deja intacto lo que recibe el servidor en cualquier escritura. **Alto riesgo por alcance**, no por complejidad: es el cliente de toda la aplicación.
- **API:** `cors({ ..., maxAge: 7200 })` en `api/app.js` → `Access-Control-Max-Age: 7200`. Chrome cachea el permiso hasta 2 h (su tope), Firefox hasta 24 h. La caché es por URL, así que ayuda a las peticiones autenticadas repetidas, no a la primera. Solo cachea el permiso de una lista de orígenes que no cambia en caliente; revocar un origen exige despliegue y el peor caso es que un navegador lo siga aceptando dos horas.

### D6. `preconnect` a la API solo en las rutas que la usan al cargar

`ReactDOM.preconnect(apiOrigin, { crossOrigin: 'anonymous' })` desde un componente de servidor mínimo (`client/components/ApiPreconnect.js`), montado en los layouts de `app/eventos/` y `app/live/` y en las dos fichas de artista, que también piden a la API al cargar (su rejilla repite la carga; ver Non-Goals). Medido cargando cada ruta pública. El origen sale de `NEXT_PUBLIC_API_URL`.

- **`crossOrigin: 'anonymous'` no es opcional:** `apiRequest` usa el modo de credenciales por defecto (`same-origin`), así que sus peticiones a `api.140d.art` van sin credenciales y el navegador las sirve desde el grupo de sockets anónimo. Un `preconnect` sin `crossorigin` abriría una conexión que ninguna de ellas usaría.
- **No global:** con D4, `/galeria` y `/tienda` ya no tocan la API al cargar, y la portada y las fichas tampoco. Un `preconnect` global abriría una conexión TLS inútil dentro de la ventana crítica de todas esas páginas, y Lighthouse lo señalaría como no usado.

### D7. La portada reserva el tamaño del vídeo

`StoryVideo` es `w-auto` dentro de un `flex justify-center`: su ancho sale del tamaño intrínseco del `<video>`, que es 300 × 150 hasta que llegan los metadatos y 720 × 720 después (las historias son `sq720`). El contenedor salta de ancho y se recoloca: el CLS de 0,04. Con `w-full max-w-[720px]` el ancho deja de depender del vídeo y el resultado final es el mismo en todos los anchos (columna menor de 720 → ocupa la columna; mayor → 720), manteniendo `aspect-[1/1] max-h-[100vh]`. Se verifica que la disposición final es idéntica a 390, 768, 1024 y 1440 px.

### D8. Sin prefetch en enlaces que abren pestaña nueva

El enlace a la política de cookies del banner es `target="_blank"`: la pestaña nueva es una carga completa que no aprovecha el router del documento actual, así que su prefetch —seis peticiones RSC en cada carga de un visitante nuevo— no lo usa nadie. `prefetch={false}`. Es el único `<Link target="_blank">` del cliente.

## Risks / Trade-offs

- **[`inlineCss` es experimental]** → Una sola línea de configuración; la reversión es quitarla. La puerta de verificación de D1 impide desplegar si Turbopack no lo aplica.
- **[Primera navegación de cliente descarga la hoja]** → Verificación explícita y, si ocurre, prefetch en reposo de las hojas en línea (D1).
- **[Primera apertura de la cesta en conexión lenta]** → Precarga por intención y en reposo con artículos. Sin precarga, el primer clic espera ~50 KB gzip.
- **[Efecto de montaje de la orden Revolut]** → Montaje en reposo cuando hay orden pendiente (D2). El resto de efectos de la cesta dependen de `open` o del contenido, que se evalúan igual al montar.
- **[Session Replay no separable en Turbopack]** → Escalera de alternativas con criterio de parada (D2).
- **[Errores tempranos sin grabación]** → Aceptado; errores y trazas no se ven afectados.
- **[Listados menos frescos]** → Misma frescura que las fichas; la deduplicación existente cubre el desfase de páginas.
- **[`lib/api.js` es compartido por toda la aplicación]** → Cambio limitado a `GET`/`HEAD`; recorrido manual de inicio de sesión, cesta y pago, panel de vendedor y de administración antes de desplegar.
- **[`maxAge` mantiene un permiso CORS revocado hasta 2 h]** → Revocar un origen ya exige despliegue; aceptado.
- **[Memoria de la caché ISR]** → +~70 KB por entrada; se comprueba `docker stats` tras un recorrido del catálogo.
- **[El informe de PSI varía entre ejecuciones]** → Tres ejecuciones antes y tres después, mediana; y las dos variantes de Lighthouse local como referencia estable.
- **[Sin tests en el cliente]** → Verificación manual enumerada en `tasks.md`; el único cambio de backend (D5) lleva test en la suite de la API.

## Migration Plan

1. Rama desde `staging`. API y cliente son independientes: `maxAge` es aditivo y el cliente no depende de él, así que el orden de despliegue es indiferente.
2. Compilación de producción local (`docker compose exec -e NODE_ENV=production client npm run build`) para pasar las puertas de D1 y D2 antes de tocar preproducción.
3. Preproducción: recorrido manual completo (tasks, sección de verificación).
4. Producción con `./deploy/deploy.sh`. **La purga de la caché de páginas de nginx es obligatoria aquí** —el HTML cacheado referencia la hoja externa de la compilación anterior— y el script ya la hace tras levantar los contenedores.
5. Medición posterior con el mismo procedimiento que la línea base.

**Reversión:** revertir el commit. Cada decisión es independiente; `inlineCss` se puede desactivar solo.

## Open Questions

- **`tcp_notsent_lowat` en la instancia** (D1, alternativas): mejora la priorización HTTP/2 de nginx para usuarios reales sin tocar código. Es operación, no se mide en PSI y queda fuera de este cambio; conviene decidirlo con datos de usuarios reales, no con Lighthouse.
