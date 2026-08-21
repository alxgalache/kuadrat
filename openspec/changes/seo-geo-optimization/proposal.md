## Why

140d salió a producción hace unos días con una base de SEO mejor de lo habitual —hay `metadataBase`, plantilla de títulos, Open Graph, sitemap dinámico, `robots.js`, `FAQPage` y `Product` en JSON-LD— pero **el contenido que da valor a la galería no existe en el HTML que se sirve**. Las cuatro familias de página que concentran todo el tráfico de descubrimiento (ficha de obra, ficha de artista, ficha de tienda y ficha de evento) envían al servidor un contenedor vacío y pintan el título, la descripción, el precio, las dimensiones y la biografía desde `useEffect`. Google acaba renderizando ese JavaScript en una segunda pasada, con retraso y coste de presupuesto de rastreo; **GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot y CCBot no ejecutan JavaScript en absoluto**, así que hoy no ven ni una línea citable de ninguna obra ni de ningún artista. Para un negocio cuyo activo diferencial es exactamente ese texto —quién es el artista, qué técnica usa, qué mide la pieza, por qué es única— es la diferencia entre ser citado por un asistente y no existir en él.

A eso se suma un conjunto de defectos concretos y verificables acumulados desde el renombrado de rutas (`navigation-naming`): `client/public/llms.txt` anuncia a los rastreadores de IA tres secciones que devuelven 404, `/tienda` no tiene ni título ni descripción propios, y `/eventos` se presenta a los buscadores como «Subastas de Arte» cuando aloja también los sorteos.

## What Changes

### 1. Contenido rastreable sin JavaScript (el cambio de fondo)

- Las fichas de **obra** (`/galeria/p/[id]`), **artista** (`/galeria/autor/[slug]` y `/tienda/autor/[slug]`), **producto de tienda** (`/tienda/p/[id]`) y **evento** (`/live/[slug]`) pasan a renderizar su contenido en el servidor: `<h1>`, descripción completa, ficha técnica (técnica, dimensiones, edición, año) y atribución al artista viajan ya dentro del HTML.
- El componente cliente existente deja de ser la fuente del contenido y pasa a recibir los datos ya resueltos como prop, conservando intacta toda la interactividad (cesta, modales, carrusel, pujas). No se duplica contenido: se mueve.
- Se elimina el `useEffect` de carga inicial en esas rutas, que hoy repite en el navegador una petición que el servidor ya hizo en `generateMetadata`.

### 2. Datos estructurados a la altura de una galería

- La obra deja de describirse sólo como `Product` genérico y pasa a `VisualArtwork` + `Offer`, usando columnas que ya existen en `art` y hoy no se aprovechan: `dimensions` (`width`/`height`), `type` (`artMedium`), `edition_size` (`ArtworkEdition`), `created_at`, `ai_generated`.
- Nueva `Person` para cada artista, con `name`, `description` (bio), `image`, `address` (location) y `sameAs`, más `ItemList` de sus obras. Hoy la ficha de artista **no emite ningún dato estructurado**.
- `Organization` de la raíz se enriquece a `OnlineStore`/`ArtGallery` con dirección, ámbito de servicio, fecha de fundación y `knowsAbout`.
- `ItemList` en los listados (`/galeria`, `/tienda`) y `BreadcrumbList` en las rutas que aún no lo emiten.

### 3. Superficies nuevas de contenido para AEO/GEO

- **`/sobre-140d`**: página de entidad server-rendered (`AboutPage`) — quiénes somos, dónde, desde cuándo, cómo funciona la comisión, cómo se autentica una obra. Es el documento que un asistente cita cuando le preguntan «¿qué es 140d?».
- **`/galeria/artistas`**: índice público de artistas. Hoy **no existe ninguna página que los liste**, de modo que sus fichas sólo se alcanzan filtrando el listado y quedan huérfanas de enlaces internos.
- **`/guias/*`**: guías y glosario (cómo comprar arte original online, qué es una edición limitada, cómo se autentica una obra con NFC, qué es el régimen REBU). Contenido de respuesta directa, el formato que los motores generativos citan.
- **`/preguntas-frecuentes`** se amplía con envíos, devoluciones, autenticidad/COA, ediciones limitadas y pagos, y **se reorganiza en las secciones que `draws-faq` ya exige y la implementación actual no tiene** (hoy es una lista plana).

### 4. Descubrimiento e higiene

- `robots.js`: declaración explícita de los rastreadores de IA (GPTBot, OAI-SearchBot, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, CCBot, Bingbot, Applebot-Extended) con `Allow`, además del `*` actual.
- `llms.txt` deja de ser un fichero estático desincronizado y pasa a **generarse como ruta de Next**, con las secciones reales y los enlaces a las guías. **Corrige tres rutas que hoy son 404.**
- `sitemap.js`: se añaden los sorteos (`/eventos/sorteo/[id]`), las páginas legales que faltan, las superficies nuevas, y **imágenes por obra** (`ImageSitemap`) — canal de descubrimiento de primer orden para una galería.
- Metadatos que faltan o mienten: `layout.js` propio para `/tienda`, título correcto para `/eventos`, metadatos y canónica para la home.
- `CDN_BASE_URL` se documenta y se cablea en el cliente: hoy `client/lib/serverApi.js` lo lee para construir las imágenes de Open Graph y JSON-LD, pero **sólo está documentada en `api/.env.example`**, así que en producción las imágenes sociales salen por la API en vez de por el CDN.

## Capabilities

### New Capabilities

- `crawlable-content-rendering`: el contenido de las fichas de obra, artista, tienda y evento viaja en el HTML del servidor, sin depender de la ejecución de JavaScript.
- `structured-data-schema`: cobertura y forma de los datos estructurados schema.org en todas las superficies públicas (`VisualArtwork`, `Person`, `ItemList`, `Organization`, `BreadcrumbList`, `Event`, `Offer`).
- `seo-metadata-coverage`: toda ruta pública indexable declara título, descripción, canónica, Open Graph y Twitter Card, y ninguna declara información falsa o heredada.
- `ai-crawler-discovery`: `robots.txt`, `llms.txt` y `sitemap.xml` como contrato de descubrimiento para buscadores clásicos y motores generativos.
- `entity-content-pages`: páginas de entidad y de respuesta (`/sobre-140d`, `/galeria/artistas`, `/guias/*`) que dan a los asistentes hechos atribuibles que citar.

### Modified Capabilities

- `draws-faq`: la página de preguntas frecuentes se estructura en secciones (requisito ya presente en el spec y **no cumplido** por la implementación actual, que es una lista plana) y amplía su alcance a envíos, devoluciones, autenticidad, ediciones limitadas y pagos.

## Impact

**Frontend (`client/`), casi todo el cambio:**

- `app/galeria/p/[id]/`, `app/tienda/p/[id]/`, `app/galeria/autor/[authorSlug]/`, `app/tienda/autor/[authorSlug]/`, `app/live/[slug]/` — traslado de la carga de datos del cliente al servidor. Es el punto de mayor riesgo del cambio: son las rutas de compra.
- `app/robots.js`, `app/sitemap.js`, `app/layout.js`, `app/page.js`, `app/eventos/layout.js`, nuevo `app/tienda/layout.js`, nueva ruta `app/llms.txt/route.js`.
- Nuevas rutas: `app/sobre-140d/`, `app/galeria/artistas/`, `app/guias/`.
- `lib/serverApi.js` (nuevos fetchers de listado para el índice de artistas y el sitemap), nuevo `lib/schema.js` (constructores de JSON-LD, hoy dispersos e inline en cada página).
- `client/public/llms.txt` se **elimina**, sustituido por la ruta generada.
- `client/.env.example`, `docker-compose.prod.yml`, `docker-compose.pre2.yml` — `CDN_BASE_URL`.

**Backend (`api/`), cambios menores y aditivos:**

- Endpoint público de listado de artistas con biografía y recuento de obras para `/galeria/artistas` y el sitemap (hoy `/users/authors` existe pero hay que confirmar que devuelve `bio` y no expone `seller_email`).
- **Hallazgo fuera del alcance de SEO, a decidir aparte:** `getAllArtProducts` y la ficha de obra hacen `SELECT a.*, u.email as seller_email` y devuelven el correo del artista en una respuesta pública. No lo toco en este cambio sin confirmarlo contigo, pero conviene saberlo.

**Riesgo y despliegue:**

- Sin cambios de esquema de base de datos, sin migraciones, sin variables nuevas salvo el cableado de `CDN_BASE_URL`.
- El SSR de las fichas **debe respetar la disciplina de hidratación** que ya documenta el proyecto: ningún proveedor nuevo puede leer `localStorage` en un inicializador de `useState`, y nada puede renderizar distinto en servidor y cliente (la lección de `StoryVideo` y `TestAccessGate`).
- Las fichas ya son ISR (`revalidate = 300`, `generateStaticParams` vacío); el cambio **no altera esa configuración**, sólo llena de contenido el HTML que ya se estaba cacheando. El efecto sobre la CPU del contenedor cliente debe medirse, dado el techo conocido de 25 req/s en fichas.
- Purga obligatoria de la caché de nginx en el despliegue, como cualquier cambio de cliente.
