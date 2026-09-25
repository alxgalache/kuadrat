## Línea base (medida el 25/09/2026, antes de tocar nada)

| Ruta | PSI móvil | LH simulado | LH throttling aplicado | JS inicial (gzip) | CLS |
|---|---|---|---|---|---|
| `/galeria` | 82 · FCP 2,0 · LCP 4,5 · SI 3,5 | 99 · FCP 1,0 · LCP 1,3 | 88 · FCP 2,7 · LCP 2,7 · SI 3,4 | ~408 KB / 17 chunks | 0,036 |
| `/` | — | 93 · LCP 3,2 | — | ~387 KB | 0,04 |
| `/tienda` | — | 99 · LCP 1,4 | — | ~408 KB | 0,064 |
| `/galeria/p/madonna-dello` | — | 83 · LCP 4,5 | — | ~417 KB | 0 |
| `/eventos` | — | 98 · LCP 1,3 | — | ~393 KB | 0,023 |

Procedimiento, para repetirlo igual al final: `npx lighthouse@13 <url> --only-categories=performance` (simulado) y lo mismo con `--throttling-method=devtools`; PSI tres veces y mediana.

## 1. API: preflights cacheables (backend)

- [x] 1.1 `api/app.js`: añadir `maxAge: 7200` a las opciones de `cors()`, con un comentario que explique el tope de Chrome y que la caché es por URL.
- [x] 1.2 `api/tests/corsPreflightCache.test.js`: preflight `OPTIONS` sobre una ruta pública con `Origin: config.clientUrl` y `Access-Control-Request-Headers: authorization` → `Access-Control-Allow-Origin` y `Access-Control-Max-Age: 7200`; desde otro origen → sin `Access-Control-Allow-Origin`. Usar `tests/helpers/app.js`.
- [x] 1.3 `docker compose exec api npm test` en verde, incluido `testEnvironmentIsolation.test.js`.

## 2. Cliente de la API sin preflight en lecturas — ALTO RIESGO (cliente compartido por toda la aplicación)

- [x] 2.1 `client/lib/api.js` → `apiRequest`: no enviar `Content-Type` cuando el método efectivo es `GET` o `HEAD` (sin `method` explícito, `fetch` usa `GET`). El resto de métodos, sin cambios.
- [x] 2.2 Revisar el resto de `fetch` de `client/lib/api.js` que no pasan por `apiRequest` y aplicar la misma regla si alguno fija `Content-Type` en un GET.
- [x] 2.3 Verificar en el navegador: `/eventos` sin sesión no emite ningún `OPTIONS`; inicio de sesión, perfil de vendedor, subida de imagen de producto (FormData) y una pantalla del panel de administración funcionan igual.
  - Hecho: interceptando `fetch` en `/eventos`, los GET salen sólo con `Authorization` (sesión) y sin `Content-Type`; `GET /api/seller/profile` con un JWT recién firmado responde 200 con y sin `Content-Type`. Los caminos POST y FormData no cambian por construcción; el recorrido con inicio de sesión real queda en 8.5.

## 3. CSS en línea

- [x] 3.1 `client/next.config.js`: `experimental: { inlineCss: true }`, con el porqué (competición medida: el CSS terminaba a 2.680 ms) y la contrapartida (HTML +13 KB gzip, sin caché de la hoja en recargas completas).
- [x] 3.2 **Puerta:** `docker compose exec -e NODE_ENV=production client npm run build` y comprobar en el HTML de `/galeria` (servido con `next start` o leyendo `.next/server/app/galeria.html`) que hay un `<style data-href=…>` y ningún `<link rel="stylesheet">` a `/_next/static/chunks/*.css`. Si no se cumple, parar y reevaluar D1.
  - Hecho: `<style data-precedence="next" data-href=…>` presente y ningún `<link rel="stylesheet">`. **Hallazgo:** Next incrusta el CSS DOS veces —en el `<style>` y otra dentro del payload RSC que va al final del HTML (byte 120.187, tras el último enlace de obra en el 111.423)—, y gzip no deduplica copias a más de 32 KB: el HTML crece ~26 KB gzip, no los 13 previstos. La copia del payload no retrasa el primer pintado. Se decide con el A/B medido de 8.3.
- [x] 3.3 Con la compilación de producción: navegar por el router de `/galeria` a una ficha y de vuelta, con la pestaña de red abierta y la red en «Slow 4G». Anotar si se pide algún `.css` y si la navegación espera por él.
  - Hecho: ninguna petición `.css`; la ficha se pinta con estilos 94 ms después del clic. React reconoce el `<style data-href>` en línea como el mismo recurso.
- [x] 3.4 (Solo si 3.3 lo muestra) `client/components/InlinedCssPrefetch.js`: tras `load` y en reposo, insertar `<link rel="prefetch" as="style">` por cada `style[data-href]` del documento; montarlo en `client/app/layout.js`. Repetir 3.3.
  - No aplica: 3.3 no lo muestra.

## 4. Analítica sin precarga en el `<head>`

- [x] 4.1 `client/app/layout.js`: sustituir el `<Script strategy="afterInteractive" src=…>` por un `<Script id="plausible-loader" strategy="afterInteractive">` en línea que cree el `<script async src>` con el mismo literal. Conservar el stub `plausible-init` y actualizar el comentario del bloque.
- [x] 4.2 Verificar con una compilación de producción y `NEXT_PUBLIC_APP_ENV=production`, **bloqueando `analytics.140d.art` en DevTools** para no ensuciar los datos reales: el `<head>` no contiene `preload` ni `script src` a ese origen, y la petición (bloqueada) del tracker aparece después de la hidratación.
- [x] 4.3 Comprobar que `grep -c "analytics.140d.art" client/next.config.js` sigue devolviendo `2` y que con `NEXT_PUBLIC_APP_ENV=preprod` no aparece ni el stub ni el cargador.

## 5. Listados sembrados sin recarga al montar

- [x] 5.1 `client/lib/serverApi.js` → `fetchCatalogPage`: devolver `{ products, hasMore }`, y `{ products: [], hasMore: false }` ante cualquier fallo. Actualizar su comentario y los de `fetchArtCatalog`/`fetchOthersCatalog`.
- [x] 5.2 `client/app/galeria/page.js` y `client/app/tienda/page.js`: pedir catálogo y `fetchAuthors('art' | 'other')` en paralelo y pasar al cliente la siembra agrupada (productos, semilla, `hasMore`) y los autores.
- [x] 5.3 `client/hooks/useGalleryProducts.js`: aceptar la siembra agrupada; con siembra completa y sin instantánea, la carga de montaje no llama a la API (fija `hasMore`, `seedRef`, `setOrderSeed` y termina la carga inicial). Con instantánea o sin siembra, exactamente el comportamiento actual. Reescribir el comentario que afirma que sembrar «NO cambia el comportamiento tras montar».
- [x] 5.4 `client/hooks/useGalleryAuthors.js`: tercer argumento `initialAuthors`; si no está vacío, no pedir nada.
- [x] 5.5 `client/app/galeria/GalleryContent.js`, `client/app/tienda/GalleryMasContent.js`, `client/app/galeria/autor/[authorSlug]/page.js` + `GalleryAuthorContent.js` y `client/app/tienda/autor/[authorSlug]/page.js` + `GalleryMasAuthorContent.js`: pasar y consumir los autores sembrados (y la siembra de catálogo en los dos listados).
- [x] 5.6 Verificar en `/galeria` y `/tienda`: ninguna petición a `api.140d.art` durante la carga; al desplazarse, la página 2 sale con la misma semilla que la del HTML; volver atrás desde una ficha restaura posición y páginas; a 412 px el filtro de autores viene completo y el CLS es 0.
- [x] 5.7 Verificar el respaldo: con el contenedor `api` parado, `npm run build` termina y `/galeria` pide su primera página y los autores al montar.

## 6. Interfaz de interacción bajo demanda (cesta, modales, Replay)

- [x] 6.1 `client/lib/constants.js`: exportar `REVOLUT_ORDER_STORAGE_KEY` (`'kuadrat_revolut_order_cache'`) y usarla desde `client/components/ShoppingCartDrawer.js` en lugar de su literal local.
- [x] 6.2 **ALTO RIESGO (checkout)** `client/components/Navbar.js`: `ShoppingCartDrawer` bajo demanda con `useOnDemandComponent` (sustituye a `next/dynamic`, que se saltaba la transición de entrada; ver design D2), renderizado solo desde la primera apertura y montado a partir de ahí; el escuchador de `open-cart-drawer` sigue abriéndola (y con ello la descarga); precarga del chunk en `pointerenter`/`focus`/`touchstart` del botón y en reposo si la cesta tiene artículos; montaje cerrado en reposo si `sessionStorage` contiene `REVOLUT_ORDER_STORAGE_KEY`.
- [x] 6.3 Verificar que la primera apertura reproduce la animación de entrada del `Dialog`; si no, montar cerrado y abrir en el fotograma siguiente.
- [x] 6.4 `client/components/LazyAuthorModal.js`: envoltorio sobre `useOnDemandComponent` que no renderiza `AuthorModal` hasta la primera apertura y lo mantiene montado después. Cambiar el import en sus ocho consumidores (`GalleryContent`, `GalleryMasContent`, `GalleryAuthorContent`, `GalleryMasAuthorContent`, `ArtProductDetail`, `OthersProductDetail`, `DrawDetail`, `EventDetail`).
- [x] 6.5 `client/components/NewsletterBanner.js`: `NewsletterSubscribeModal` bajo demanda con el mismo patrón; el enlace del pie (`open-newsletter-modal`) sigue abriéndolo.
- [x] 6.6 `client/instrumentation-client.js`: quitar `Sentry.replayIntegration()` de `integrations` y registrarla con `Sentry.addIntegration` tras `load` + `requestIdleCallback` (con `setTimeout` de respaldo). Ratios de Replay sin tocar en `Sentry.init`.
- [x] 6.7 **Puerta:** compilación de producción; `rrweb` ausente de los chunks que referencia el HTML de `/galeria` y presente en uno asíncrono pedido tras `load`. Si no, probar en orden `import('@sentry/browser')` y `Sentry.lazyLoadIntegration('replayIntegration')` (este último añade `https://browser.sentry-cdn.com` a `script-src` en `client/next.config.js`). Anotar la opción elegida en el comentario del fichero.
  - Hecho: `import("@sentry/nextjs")` sacaba rrweb del bundle inicial pero el chunk diferido llevaba el SDK entero (105 KB gzip). Con una reexportación con nombre (`lib/sentryReplay.js`) el chunk es sólo Replay: 39 KB gzip, pedido a los 244 ms con `load` a los 194 ms.
- [x] 6.8 Comprobar que el código de Stripe Elements, del paso de envío y DOMPurify no aparece en los chunks iniciales de `/galeria`; atribuir lo que quede con `next experimental-analyze`.
- [x] 6.9 Recorrido de compra en preproducción: añadir una obra, abrir la cesta desde el icono (en frío y tras precarga), dirección, envío, pago de prueba con Stripe; `/pago-cancelado` → «volver a la cesta» abre la cesta; abrir una biografía desde la rejilla y desde una ficha; abrir la newsletter desde el banner y desde el pie.
  - Hecho por el usuario en preproducción (25/09/2026): recorrido de compra y prueba general correctos.
- [x] 6.10 Provocar un error en preproducción tras la carga (`/api/sentry-example-api` o equivalente de cliente) y comprobar que llega a Sentry; con `SENTRY_ENABLE_DEV`/staging, que una sesión muestreada incluye grabación.
  - Hecho por el usuario en preproducción: error de cliente (lanzado con `setTimeout` desde la consola) y `/api/sentry-example-api` llegan a Sentry. Ojo: los eventos de preproducción figuran con `environment: production` (el SDK toma `NODE_ENV`).

## 7. `preconnect`, prefetch y vídeo de portada

- [x] 7.1 `client/components/ApiPreconnect.js` (componente de servidor): `ReactDOM.preconnect(<origen de NEXT_PUBLIC_API_URL>, { crossOrigin: 'anonymous' })`. Montarlo en `client/app/eventos/layout.js` y `client/app/live/layout.js`.
- [x] 7.2 Confirmar con la pestaña de red qué rutas piden a la API durante la carga (`/eventos`, `/live`, `/live/[slug]`, `/eventos/subasta/[id]`, `/eventos/sorteo/[id]`) y que ninguna otra ruta pública lo hace; ajustar dónde se monta 7.1 si el resultado difiere.
  - Hecho (Chrome headless contra el servidor de desarrollo): piden a la API al cargar `/eventos`, `/live`, `/live/[slug]`, `/eventos/subasta/[id]`, `/eventos/sorteo/[id]` **y las dos fichas de artista** (su rejilla sigue repitiendo la carga, fuera de alcance); no piden nada `/`, `/galeria`, `/tienda`, `/galeria/artistas`, `/galeria/p/[slug]`, `/autores`, `/contacto`. `ApiPreconnect` se monta también en las dos fichas de artista.
- [x] 7.3 `client/components/CookieBanner.js`: `prefetch={false}` en el enlace a la política de cookies (`target="_blank"`). Comprobar que no se pide ningún `/legal/politica-de-cookies?_rsc=…`.
- [x] 7.4 `client/components/StoryVideo.js`: contenedor `w-full max-w-[720px]` en lugar de `w-auto`, conservando `aspect-[1/1] max-h-[100vh]`. Verificar a 390, 768, 1024 y 1440 px que tamaño y posición finales coinciden con los actuales y que el CLS de `/` es 0.
  - Hecho sobre el DOM de producción (Chrome headless, analítica bloqueada): con `w-auto` la caja mide 300 × 300 hasta los metadatos y después 342/705/441/576 px; con el dimensionado nuevo mide desde el principio exactamente lo mismo que al final, y el final coincide al píxel con el actual en los cuatro anchos. En local no hay vídeos (sin S3), así que el CLS de `/` se mide tras desplegar.

## 8. Verificación final, documentación y despliegue

- [x] 8.1 `docker compose exec client npm run lint` sin errores (el `Dockerfile.prod` lo ejecuta y aborta el build si falla).
- [x] 8.2 `docker compose exec -e NODE_ENV=production client npm run build` sin errores y con `/galeria` y `/tienda` todavía `○ (Static)` con `5m 1y` en la tabla de rutas.
- [x] 8.3 Repetir las mediciones de la línea base en local (compilación de producción) y anotar aquí el JS inicial por ruta y las métricas.
  - A/B/C sobre la misma compilación local de producción (`next start`, Chrome headless de Lighthouse 13.5; analítica, Sentry y Meta bloqueados; **sin imágenes**, porque el optimizador no alcanza la API desde el contenedor — igual en las tres). A = `HEAD`, B = este cambio, C = este cambio sin `inlineCss`. Simulado: mediana de 3; throttling aplicado: mediana de 2.

    | | A | B | C |
    |---|---|---|---|
    | JS inicial gzip `/galeria` · `/` · ficha | 377 · 359 · 383 KB | 312 · 305 · 328 KB | igual que B |
    | HTML gzip `/galeria` | 15 KB | **58 KB** | 19 KB |
    | `/galeria` simulado: puntuación · FCP · LCP | 92 · 1.537 · 3.245 | **99 · 948 · 1.740** | 94 · 913 · 2.944 |
    | `/galeria` aplicado: FCP = LCP · TBT | 1.510 · 160 | **805 · 82** | 1.519 · 80 |
    | ficha simulado: puntuación · LCP | 88 · 3.843 | **99 · 2.113** | 97 · 2.574 |
    | ficha aplicado: FCP = LCP | 1.548 | **818** | 1.542 |

  - Lectura: con red lenta real, lo que parte el primer pintado por la mitad es el CSS en línea (C no mejora sobre A); el recorte de JS parte el TBT por la mitad y baja el LCP simulado. El CSS en línea cuesta **+39 KB gzip** de HTML —el triple de lo estimado en el diseño, porque la segunda copia va escapada como cadena JSON en el payload RSC— y aun así gana en los dos modos. Se mantiene.
  - El recorte de JS inicial es de 55–66 KB gzip por ruta (~17 %), menos que los 90–110 estimados. Los 39 KB de Replay siguen descargándose, pero tras `load`.
- [x] 8.4 `CLAUDE.md`: sección nueva con las reglas de este cambio (CSS en línea y su puerta; patrón «bajo demanda + precarga por intención»; Replay diferida; listados sembrados sin recarga; `Content-Type` solo con cuerpo; `preconnect` por ruta; cargador de Plausible). Actualizar las frases que dejan de ser ciertas en «LCP de los listados» y en «Plausible Analytics» («Two `<Script>` tags»).
- [x] 8.5 Preproducción: recorrido de 2.3, 5.6, 6.9 y 7.4; comprobar `docker stats` del contenedor `client` tras recorrer el catálogo (caché ISR con el CSS en línea).
  - Hecho por el usuario en preproducción.
- [x] 8.6 Producción con `./deploy/deploy.sh` (purga de la caché de páginas incluida). PSI tres veces sobre `/galeria`, `/` y `/galeria/p/[slug]`; anotar la mediana junto a la línea base.
  - Marcada como hecha a petición del usuario; la mediana de PSI en producción no quedó registrada en este fichero.
