## Context

El proyecto salió a producción hace días con un SEO técnico razonable: `metadataBase`, plantilla de títulos, Open Graph, `sitemap.js` dinámico con ISR de una hora, `robots.js`, y JSON-LD de `Organization`, `WebSite`, `Product`, `Event`, `FAQPage` y `BreadcrumbList`. Nada de eso hay que rehacerlo.

Lo que falta es más básico y no se ve en una auditoría de metadatos: **el HTML que sale del servidor está vacío de contenido en las cuatro familias de página que importan.** `client/app/galeria/p/[id]/page.js` es un componente de servidor que pide la obra en `generateMetadata`, emite el JSON-LD… y delega el cuerpo en `ArtProductDetail.js`, que es `'use client'` y vuelve a pedir la misma obra con `artAPI.getById()` dentro de un `useEffect` (línea 87). Lo mismo en `tienda/p/[id]`, `galeria/autor/[authorSlug]`, `tienda/autor/[authorSlug]` y `live/[slug]`.

Para Google es un coste: renderiza JavaScript, pero en una segunda pasada diferida. Para los motores generativos es una ausencia total: GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot y CCBot no ejecutan JavaScript. Hoy, lo único que un asistente puede leer de una obra de 140d es su JSON-LD —que precisamente por eso es la pieza que más rendimiento da enriquecer— y su etiqueta `<meta name="description">` recortada a 160 caracteres.

Alrededor de eso hay un conjunto de defectos concretos, todos verificados en el repositorio:

| Hallazgo | Evidencia |
|---|---|
| `client/public/llms.txt` anuncia `/galeria/mas`, `/subastas` y `/espacios` | Rutas renombradas por el spec `navigation-naming` a `/tienda`, `/eventos`, `/live`. **No dan 404**: `next.config.js` tiene redirecciones 301 para las tres. Pero un documento cuyo único lector es automático, apuntando a tres redirecciones y describiendo una estructura que ya no existe, es una fuente desactualizada — y nada obligaba a mantenerlo. |
| `/tienda` no tiene título ni descripción propios | No existe `client/app/tienda/layout.js`; `galeria/` sí tiene el suyo. Hereda el título por defecto de la raíz. |
| `/eventos` se anuncia como «Subastas de Arte» | `client/app/eventos/layout.js`, resto del renombrado. La ruta aloja subastas **y** sorteos (`eventos/sorteo/[id]`). |
| El sitemap no incluye los sorteos | `client/app/sitemap.js` recorre `/auctions` pero no `/draws`, que existe (`api/routes/drawRoutes.js:23`). |
| El sitemap omite dos páginas legales | Faltan `/legal/aviso-legal` y `/legal/politica-de-cookies`, ambas publicadas. |
| El sitemap no declara imágenes | Para una galería, la búsqueda de imágenes es un canal de descubrimiento de primer orden. |
| `CDN_BASE_URL` se lee en el cliente pero sólo está documentada en la API | `client/lib/serverApi.js:104` la usa para las imágenes de Open Graph y JSON-LD; sólo aparece en `api/.env.example:45`. En el cliente la variable documentada es otra, `NEXT_PUBLIC_CDN_URL`. |
| La ficha de artista no emite ningún dato estructurado | `galeria/autor/[authorSlug]/page.js` sólo declara metadatos. Ni `Person` ni `ItemList`. |
| La FAQ no cumple su propio spec | `draws-faq` exige secciones etiquetadas; la implementación es un array plano sin encabezados de sección. |
| No existe ninguna página que liste los artistas | Sus fichas sólo se alcanzan filtrando el listado por query string. Son huérfanas de enlaces internos. |

Y uno que **no es de SEO** y aparece de camino: `api/controllers/usersController.js` devuelve `u.email` en `getVisibleAuthors` y `getAuthorBySlug`, y `api/controllers/artController.js` hace `SELECT a.*, u.email as seller_email`. Son endpoints públicos sin autenticación: el correo de cada artista viaja en la respuesta. Se documenta aquí porque este cambio toca esas respuestas, pero **no se corrige sin decisión explícita** — ver Open Questions.

## Goals / Non-Goals

**Goals:**

- Que el texto que define el valor de la galería —descripción de la obra, ficha técnica, biografía del artista— exista en el HTML servido, sin depender de JavaScript.
- Que cada entidad del catálogo tenga datos estructurados que la describan como lo que es (`VisualArtwork`, `Person`), no como un producto genérico.
- Que exista contenido de respuesta directa (entidad, índice de artistas, guías, FAQ ampliada) que un asistente pueda citar con atribución.
- Corregir todos los defectos de la tabla anterior.
- No degradar el rendimiento: las fichas ya tienen un techo medido de ~25 req/s.

**Non-Goals:**

- Reescribir la interacción de las fichas. La cesta, el carrusel, los modales y las pujas se quedan como están.
- Tocar el esquema de base de datos. Cero migraciones.
- Renderizar en servidor las rutas privadas (`/admin`, `/seller`, `/orders`) ni las transaccionales. Están correctamente excluidas.
- Traducir el sitio ni añadir `hreflang`. 140d es es-ES y no hay una segunda locale.
- Sustituir Plausible, tocar la CSP o modificar la analítica.
- Prometer resultados de posicionamiento. Esto habilita la indexación y la cita; el ranking depende de factores externos.

## Decisions

### 1. El servidor obtiene los datos y los pasa como prop; el cliente deja de pedirlos

**Decisión:** cada `page.js` afectado pasa a hacer el `fetch` en el cuerpo del componente de servidor, renderiza el contenido textual, y entrega el registro ya resuelto al componente cliente como prop. El componente cliente conserva su `'use client'` y toda su interactividad, pero pierde el `useEffect` de carga inicial y su estado `loading` de primera carga.

**Por qué, y no las alternativas:**

- *Añadir un bloque de servidor por encima del componente cliente sin tocarlo* (la opción intermedia) evita el refactor, pero deja dos fuentes del mismo contenido y obliga a ocultar visualmente una de las dos. Ocultar contenido que sólo existe para rastreadores es exactamente el patrón que los buscadores penalizan como cloaking, aunque la intención sea inocente. Descartada.
- *Dejarlo en cliente y confiar en el renderizado de Google* no resuelve nada del objetivo GEO, que es el que motiva el cambio.

**Lo que abarata el refactor:** el dato ya se pide en el servidor. `generateMetadata` llama a `fetchArtProduct(id)` y la página volverá a llamarla; Next deduplica los `fetch` idénticos dentro del mismo render, así que **no se añade ni una petición**. De hecho se quita una: la que hoy hace el navegador.

**El riesgo real está en el 404.** Hoy, si `fetchArtProduct` devuelve `null`, la página renderiza igualmente el componente cliente, que vuelve a pedir y muestra su propio mensaje de error con estado 200. Al mover el contenido al servidor hay que llamar a `notFound()`, y eso cambia el código de estado de rutas de compra en producción. Va con prueba explícita.

### 2. Un solo módulo construye todo el JSON-LD

**Decisión:** `client/lib/schema.js` exporta constructores (`buildVisualArtwork`, `buildPerson`, `buildItemList`, `buildBreadcrumb`, …). Las páginas dejan de componer literales inline.

**Por qué:** hoy el mismo `BreadcrumbList` está escrito a mano en cinco ficheros con pequeñas variaciones, y la lógica de «omite la propiedad si el valor está vacío» se repite con `...(x ? {k:v} : {})` en cada sitio. Centralizarlo permite además una prueba única sobre la regla que más silenciosamente se rompe: **una propiedad presente con valor vacío es peor que ausente**, porque los validadores la marcan como error y los consumidores la toman como un hecho.

**Escapado:** el JSON-LD lleva descripción de obra y biografía de artista, ambas texto de entrada de vendedor. El constructor escapa `<`, `>` y `&` para que no se pueda cerrar el `<script>`. El componente `JsonLd` existente es el único punto de emisión, así que el escapado va ahí.

### 3. `VisualArtwork` en lugar de `Product`, aprovechando columnas que ya existen

**Decisión:** la obra se describe como `VisualArtwork` con un `Offer` asociado, poblando `artMedium` desde `art.type`, `width`/`height` parseando `art.dimensions`, `dateCreated` desde `art.created_at` y `artEdition` desde `art.edition_size`.

**Por qué:** son datos que el modelo ya guarda y que hoy no salen a ningún sitio. Es la información que distingue una obra de un artículo de tienda y la que un asistente necesita para responder «¿qué obras de 60x80 en acrílico hay?».

**Dos cuidados que no son obvios:**

- `art.dimensions` es texto libre (`TEXT`), no un formato garantizado. El parser devuelve `null` ante cualquier cosa que no reconozca y entonces se omiten `width` y `height`. **No se adivina una medida**: publicar una dimensión inventada sobre una obra que se vende es peor que no publicar ninguna, y es el mismo criterio que la calculadora de envíos aplica a `outside_dimensions`.
- `outside_dimensions` y `outside_weight` **no se publican nunca**. Describen la caja, no la obra. Confundirlas pondría el tamaño del embalaje como tamaño del cuadro.

**Disponibilidad:** `availability` sale de `is_sold`, que en este proyecto significa «edición agotada». Con `edition_size > 1` **no se publica el número de copias restantes**, porque el propio producto ha decidido no mostrárselo al comprador (`EDITION_COPY` en `client/lib/constants.js`); el JSON-LD no puede filtrar lo que la interfaz oculta deliberadamente. Y cuando el escaparate está en modo cotización (`ART_BUY_AVAILABLE=false`), `InStock` sería falso: no hay nada que comprar en ese momento.

### 4. `llms.txt` se genera; el fichero estático se borra

**Decisión:** `client/app/llms.txt/route.js` genera el documento; `client/public/llms.txt` desaparece.

**Por qué:** el fichero actual es la demostración del problema. Se escribió antes del renombrado de rutas y nadie volvió a mirarlo. Las redirecciones 301 de `next.config.js` evitan que sus enlaces se rompan —esto se comprobó y **no** son 404, como se creyó al principio—, pero eso es la red de seguridad funcionando, no el documento estando bien: sigue describiendo una estructura que ya no existe, con nombres de sección que el sitio abandonó. Un documento cuyo propósito es orientar a un consumidor automático no puede depender de que alguien recuerde editarlo. Generándolo, las secciones y los enlaces a las guías salen de la misma fuente que el resto del sitio.

**Contenido:** identidad, secciones reales, cómo se compra y cómo se vende, y enlaces a la página de entidad, el índice de artistas, la FAQ y las guías. **Sin cifras sin confirmar.** Un `llms.txt` que inventa un año de fundación o un número de artistas es peor que no tenerlo: es una afirmación falsa servida en el formato que los modelos tratan como autoritativo.

*Nota:* existe además un `llms.txt` en la raíz del repositorio que es documentación de LiveKit, no del proyecto. No se toca; no se sirve.

### 5. Permitir explícitamente a los rastreadores de IA, con la misma lista de exclusión

**Decisión:** grupos explícitos para GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, CCBot, Applebot-Extended y Bingbot, cada uno con **la misma lista de `Disallow` que el grupo `*`**.

**Por qué la lista compartida es lo importante:** un grupo específico en `robots.txt` **sustituye** al grupo `*` para ese agente, no se suma a él. Declarar `User-agent: GPTBot / Allow: /` sin repetir las exclusiones abriría `/admin`, `/orders`, `/pedido/<token>` y `/user-activation/<token>` precisamente a los rastreadores que se pretendía dirigir. Por eso la lista se define una vez en el módulo y se reutiliza, en lugar de copiarse.

El modo oculto (`WEB_APP_HIDDEN`) sigue devolviendo `Disallow: /` para todos y **no emite los grupos permisivos**.

### 6. Ninguna API nueva

**Decisión:** el índice de artistas y el sitemap se sirven de `GET /api/users/authors`, que ya devuelve `full_name`, `slug`, `bio`, `location` y `profile_img`.

Verificado en `api/controllers/usersController.js`. El único cambio en la API sería quitar `email` del `SELECT`, y eso queda en Open Questions por no ser SEO.

### 7. El rendimiento se mide, no se supone

Las fichas ya son ISR con `revalidate = 300` y `generateStaticParams()` vacío, y esa configuración **no se toca**: el HTML que hoy se cachea vacío pasará a cachearse lleno. El coste marginal por render sube (más árbol que serializar), pero el número de renders no cambia y el contenedor cliente está limitado a 0.5 vCPU con nginx cacheando por delante.

Hay que medirlo igualmente, porque el techo conocido de la ficha de obra es ~25 req/s y esta ruta es la que más tráfico recibe desde buscadores. Se compara el tamaño del HTML y el tiempo de render antes y después, sobre la misma obra.

## Risks / Trade-offs

- **El refactor toca las rutas de compra.** → Es el riesgo dominante. Se convierte una familia cada vez, empezando por la ficha de artista (la de menor superficie interactiva) y terminando por la de obra (la de mayor). Antes de tocar la ficha de obra se comprueba a mano el flujo completo de compra en local.

- **`notFound()` cambia el código de estado de una ruta de producción.** → Hoy una obra inexistente devuelve 200 con un mensaje de error dentro. Pasará a 404, que es lo correcto, pero cualquier monitor o alerta que cuente 404 lo verá. Se anota en el despliegue.

- **Mover contenido al servidor puede introducir discrepancias de hidratación.** → El proyecto ya se llevó ese golpe dos veces (`StoryVideo` con `Math.random()` en un inicializador, `TestAccessGate` blanqueando el árbol entero). Regla explícita en el spec: nada que se renderice puede depender de `localStorage`, `window` ni de un valor no determinista. Se verifica en desarrollo, donde React sí avisa.

- **La caché de nginx guarda HTML durante un año y referencia chunks de JS.** → Purga obligatoria en el despliegue, después de que los contenedores respondan. Es el procedimiento que ya documenta `deploy/deploy.sh`; aquí sólo se recuerda porque un cambio de cliente sin purga da una página que pinta pero no hidrata.

- **Datos estructurados que no coinciden con lo que se ve son penalizables.** → Es la razón de fondo para hacer el SSR *antes* de enriquecer el JSON-LD, y no al revés: cuando el contenido está en el HTML, el schema describe algo que el rastreador puede verificar. Los constructores derivan del mismo registro que la página renderiza, no de una fuente paralela.

- **Contenido editorial nuevo es contenido que hay que mantener.** → Guías y página de entidad envejecen. Se arranca con un número pequeño de guías bien hechas antes que con muchas superficiales; la FAQ y la entidad son las que más rinden por unidad de mantenimiento.

- **Permitir el entrenamiento es una decisión con contrapartida.** → Es lo elegido, y es coherente con maximizar presencia. Pero significa que la obra de los artistas de la galería puede acabar en conjuntos de entrenamiento. Es reversible: cambiar `Allow` por `Disallow` en los agentes de entrenamiento puro es una edición de una línea.

- **`llms.txt` no es un estándar ratificado.** → Su adopción real es desigual. El coste de mantenerlo generado es bajo y el de tenerlo desincronizado ya se ha pagado; lo que de verdad mueve el GEO es el punto 1, no este fichero.

## Migration Plan

Sin migraciones de datos ni variables nuevas, salvo cablear `CDN_BASE_URL` en el cliente.

1. **Higiene primero** (sin riesgo, desplegable solo): `robots.js`, `sitemap.js`, `llms.txt` generado, `tienda/layout.js`, título de `/eventos`, metadatos de la home, `noindex` en rutas transaccionales, `CDN_BASE_URL`.
2. **`client/lib/schema.js`** y traslado del JSON-LD existente a los constructores, sin cambiar todavía lo que se emite. Cambio a igualdad de salida, verificable.
3. **SSR por familias**, de menor a mayor riesgo: artista → tienda → evento → obra.
4. **Enriquecimiento del schema** una vez el contenido está en el HTML: `VisualArtwork`, `Person`, `ItemList`, `Organization`.
5. **Contenido nuevo**: entidad, índice de artistas, FAQ reestructurada y ampliada, guías.

Cada bloque es desplegable por separado. **Rollback:** revertir el commit del bloque; no hay estado persistido que deshacer. El bloque 3 es el único que necesita comprobación manual del flujo de compra antes de subir.

Tras el despliegue: purgar la caché de nginx, validar el sitemap y los datos estructurados con las herramientas de Google y Schema.org, y comprobar con `curl` sin JavaScript que una ficha de obra y una de artista traen su texto.

## Datos confirmados de la galería

Confirmados por el operador el 21/08/2026. Todo lo que se publique sobre la identidad de 140d sale de aquí; lo que no esté en esta lista no se publica.

- **Nombre:** 140d. **Origen:** Salamanca, España. **Inicio de actividad:** 2026.
- **Naturaleza:** exclusivamente online, sin espacio físico.
- **Ámbito de venta y envío:** todo el territorio español. Expansión europea e internacional prevista en fases futuras, **no anunciada como disponible**.
- **Artistas:** españoles en esta primera fase.
- **Disciplinas:** arte contemporáneo, con énfasis en arte emergente y artistas jóvenes. **Sin restricción de disciplina** — cualquier disciplina artística cabe, y los medios digitales y de difusión de la galería sirven a todas.
- **Precios:** rango amplio; al predominar artistas emergentes y jóvenes, en general asequibles para un público amplio. Sin cifras concretas.
- **Detrás:** Alejandro Galache, programador de profesión y apasionado del arte, que da un giro a su carrera para poner su perfil técnico al servicio de la difusión del arte en España.

**El número de artistas no se publica como literal.** Hoy son cuatro y se prevén entre 20 y 30. Un número escrito a mano en `Organization`, en `llms.txt` o en la página de entidad envejece en semanas y, además, describe a la baja una galería en crecimiento. El índice de artistas los enumera desde la base de datos, que es la única forma de ese dato que no puede quedarse obsoleta.

**Eje de posicionamiento**, confirmado como prioritario junto a la venta:

1. Venta de arte emergente y joven en España.
2. **Difusión y participación**: implicar al público en el proceso creativo mediante streams, charlas, directos, talleres y cursos, de modo que quien compra acompaña al artista y ambas partes se nutren de la interacción.

El segundo eje es el que diferencia a 140d de un catálogo con carrito, y es el que da sentido a que `/live` y `/eventos` existan. Debe estar presente en la página de entidad, en `llms.txt` y en al menos una guía — no sólo en el listado de eventos.

## Open Questions

1. **Redacción de las guías.** Se publican con texto de marcador claramente señalado, para que el operador lo sustituya. La estructura, los metadatos, el `Article` y el enlazado sí quedan terminados.
2. ~~Datos de la galería~~ — resueltos arriba.
3. ~~Keywords y posicionamiento~~ — resueltos arriba.
4. ~~Correo del artista en endpoints públicos~~ — se corrige dentro de este cambio, por decisión explícita del operador (privacidad y seguridad).
