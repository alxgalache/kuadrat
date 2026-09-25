## Why

PageSpeed Insights (móvil, 25/09/2026) puntúa `/galeria` con **82**: FCP 2,0 s, LCP 4,5 s, Speed Index 3,5 s. Reproducido en local con Lighthouse 13.5 y **throttling aplicado** (no simulado), la causa es una sola y es la misma en todas las páginas del sitio: el HTML llega a los 700 ms, y en ese instante el navegador lanza **a la vez** la hoja de estilos (14 KB, la única que bloquea el render), la fuente, cuatro imágenes precargadas, el script de analítica y **~400 KB de JavaScript repartidos en 17 chunks**. Todos compiten por el mismo enlace de 1,6 Mbps y el CSS no termina hasta los **2.680 ms**: la página entera está en blanco dos segundos esperando 14 KB. El LCP de un visitante nuevo es el texto del banner de cookies, que se pinta en ese mismo instante, así que FCP = LCP = 2,7 s.

El JavaScript inicial es el segundo factor y el que más se puede recortar: Sentry Session Replay (rrweb) viaja en el chunk principal de **todas** las páginas; la cesta de la compra completa —Stripe Elements, autocompletado de direcciones, paso de envío, Revolut— se descarga en cada visita porque `Navbar` la importa estáticamente aunque solo se use al abrirla; y los modales de biografía (con DOMPurify) y newsletter igual. A eso se suman peticiones evitables en el arranque de `/galeria` y `/tienda`: la rejilla ya viene construida en el HTML (ISR) y aun así se vuelve a pedir la página 1 a la API al montar, más la lista de autores, y **cada GET anónimo a la API dispara un preflight CORS** porque el cliente manda `Content-Type: application/json` en peticiones sin cuerpo.

## What Changes

- **CSS en línea en el HTML** (`experimental.inlineCss`): la hoja deja de ser una petición que bloquea el render y compite por el ancho de banda; viaja en el mismo flujo que el HTML, con la prioridad más alta.
- **Presupuesto de JavaScript inicial**: la interfaz que solo existe tras una interacción se descarga bajo demanda.
  - `ShoppingCartDrawer` se descarga al abrir la cesta por primera vez (y se precarga por intención o en reposo), conservando el evento `open-cart-drawer` y el restablecimiento de una orden Revolut pendiente.
  - `AuthorModal` y `NewsletterSubscribeModal` se cargan al abrirse.
  - Sentry Session Replay se añade tras el evento `load` y en reposo, fuera del bundle inicial. Tracing y captura de errores siguen igual desde el primer instante.
- **Analítica fuera de la ventana crítica**: el tracker de Plausible deja de emitir un `<link rel="preload">` de prioridad alta en el `<head>`; se inyecta tras la hidratación, que es cuando ya se ejecutaba. El número de páginas vistas registradas no cambia de forma apreciable.
- **Listados sin peticiones redundantes al montar** (`/galeria`, `/tienda`): el servidor siembra también `hasMore` y la lista de autores, y el cliente no repite la página 1 que ya está en el HTML. Elimina además el desplazamiento de diseño que hoy provoca el filtro de autores al aparecer tarde (CLS 0,036 en `/galeria`, 0,064 en `/tienda`). Las fichas de artista reciben la lista de autores sembrada.
- **Sin preflight CORS en las lecturas anónimas**: `lib/api.js` solo declara `Content-Type` cuando la petición lleva cuerpo; la API responde a los preflights que quedan (peticiones autenticadas) con `Access-Control-Max-Age`.
- **`preconnect` solo donde se usa**: a la API en las rutas que la consultan durante la carga (`/eventos`, `/live` y sus fichas, y las fichas de artista), no en todo el sitio.
- **Estabilidad de diseño en la portada**: el vídeo de la portada reserva su tamaño antes de conocer sus metadatos (CLS 0,04 hoy).
- **Sin prefetch de enlaces que abren pestaña nueva** (la política de cookies del banner): hoy genera seis peticiones RSC que ninguna navegación usará.

Capas afectadas: **frontend** (casi todo) y **backend** (una opción de CORS en `api/app.js`). **Sin cambios de esquema** en la base de datos. **Sin dependencias nuevas.** Sin variables de entorno nuevas.

## Capabilities

### New Capabilities
- `critical-rendering-path`: qué puede competir con el primer pintado (CSS en línea, ningún recurso de terceros con prioridad alta antes de hidratar), política de `preconnect` y de prefetch, y reserva de espacio para contenido que llega tarde.
- `initial-js-budget`: qué interfaz se descarga bajo demanda en lugar de en el bundle inicial (cesta, modales, Session Replay), cómo se precarga y qué comportamiento debe conservar, y cómo se mide el presupuesto.
- `catalog-listing-seeding`: los listados sembrados desde el servidor no repiten al montar la petición cuyo resultado ya está en el HTML; autores y `hasMore` viajan sembrados; la restauración de scroll sigue pidiendo lo que necesita.
- `api-preflight-avoidance`: las lecturas anónimas a la API son peticiones CORS simples y los preflights inevitables se cachean.

### Modified Capabilities
- `environment-aware-analytics`: el tracker se sigue cargando solo en producción y desde la instancia autoalojada, pero ya no como `<script src>`/preload en el HTML servido sino inyectado tras la hidratación.

## Non-goals

- **Eliminar los polyfills de Next.js** que señala «JavaScript antiguo». Son `next/dist/build/polyfills/polyfill-module`, ~1,2 KB reales (los 14 KiB son una estimación del modelo de Lighthouse), el aviso **no puntúa**, y el módulo incluye `URL.canParse`, que Safari 16.4–16.x no trae: quitarlo entero rompería el sitio en esos iPhone, y sustituirlo exige apuntar a una ruta interna de Next que puede cambiar en cualquier actualización. El `Array.from` de esa misma lista viene de rrweb y **sí** desaparece del bundle inicial con este cambio.
- **Las balizas `bam.nr-data.net` (New Relic)** del árbol de dependencias de PageSpeed no salen de la aplicación: no están en el HTML servido, en ninguno de los 20 chunks de JS/CSS de producción ni en ninguna ejecución local de Lighthouse. Se atribuyen al entorno de medición; no hay nada que quitar.
- Brotli en nginx (~15–20 % menos bytes en JS/CSS): exige un módulo en la instancia y compresión por petición en una máquina de 2 vCPU cuyo techo medido es la CPU. Decisión de operación aparte.
- Calidad/tamaño de las imágenes de producto (q=75) y de los vídeos de la portada (2,3 MB): la imagen es el producto; y un `poster` exigiría generar fotogramas a mano para cada vídeo subido.
- Sustituir Headless UI o partir la hoja de Tailwind por ruta.
- Cambiar el prefetch de los enlaces de la rejilla: ocurre tras hidratar, lo sirve la caché de nginx y es lo que hace instantánea la navegación a una ficha.
- La rejilla de las fichas de artista sigue repitiendo su carga al montar (siembra hasta 100 obras para el JSON-LD y la rejilla pagina de 12 en 12); alinearlas exige decidir cuántos enlaces de obra se sirven en el HTML, que es una decisión de SEO, no de rendimiento.
- El CLS residual de `/eventos` (0,023): la fecha se decide en el cliente a propósito (ver CLAUDE.md, «Ninguna página estática puede decidir una fecha durante el render»).

## Impact

**Frontend (`client/`)**
- `next.config.js` — `experimental.inlineCss`.
- `app/layout.js` — cargador del tracker de Plausible.
- `instrumentation-client.js` — Session Replay diferida.
- `components/Navbar.js`, `components/ShoppingCartDrawer.js` — cesta bajo demanda.
- `components/NewsletterBanner.js`, `app/galeria/GalleryContent.js`, `app/tienda/GalleryMasContent.js`, las dos fichas de artista y el resto de consumidores de `AuthorModal` — modales bajo demanda.
- `hooks/useGalleryProducts.js`, `hooks/useGalleryAuthors.js`, `lib/serverApi.js`, `app/galeria/page.js`, `app/tienda/page.js`, `app/galeria/autor/[authorSlug]/page.js`, `app/tienda/autor/[authorSlug]/page.js` — siembra de `hasMore` y autores.
- `lib/api.js` — `Content-Type` solo con cuerpo. **Alto riesgo: es el cliente de toda la aplicación.**
- `components/StoryVideo.js`, `components/CookieBanner.js`, layouts de `app/eventos/` y `app/live/`.

**Backend (`api/`)**
- `app.js` — `maxAge` en las opciones de `cors()`.

**Operación**
- Ninguna acción nueva en el despliegue: `./deploy/deploy.sh` ya purga la caché de páginas de nginx, que es obligatorio aquí porque el HTML cacheado referencia la hoja externa.
- Memoria del contenedor `client`: cada entrada ISR guarda ~70 KB más de HTML (el CSS en línea). Con el catálogo actual son decenas de MB frente a un límite de 1.500 MB.
