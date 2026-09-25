# critical-rendering-path

## Purpose

Qué puede competir con el primer pintado de las páginas públicas y qué no. Medido en producción (25/09/2026, 4G lenta real): la hoja de estilos global —14 KB y lo único que bloquea el render— tardaba 2,7 s porque nacía a la vez que la fuente, las imágenes precargadas, un tracker de terceros y ~380 KB de JavaScript. Aquí se fijan el CSS en línea, la ausencia de recursos de terceros de prioridad alta antes de hidratar, la política de `preconnect` y de prefetch, y la reserva de espacio para contenido que llega tarde.

> Capa afectada: `client/next.config.js`, `client/app/layout.js`, `client/components/ApiPreconnect.js`, `client/components/CookieBanner.js`, `client/components/StoryVideo.js`.

## Requirements

### Requirement: La hoja de estilos global viaja en línea en el HTML

Las respuestas HTML del cliente Next.js SHALL incluir la hoja de estilos global en línea, como `<style>` dentro del `<head>`, en lugar de referenciarla con `<link rel="stylesheet">`. Se activa con `experimental.inlineCss: true` en `client/next.config.js`.

Las respuestas RSC (navegación de cliente) NO SHALL llevar el CSS en línea: siguen referenciando el fichero, que el navegador cachea como `immutable`.

Next incrusta la hoja dos veces en el HTML (en el `<style>` y dentro del payload RSC), lo que añade ~39 KB gzip a cada documento. Se acepta porque el A/B medido lo justifica; cualquier cambio de versión de Next que altere ese coste SHALL volver a medirse con el mismo procedimiento.

#### Scenario: Primera visita a cualquier página pública
- **WHEN** un navegador sin caché pide `/galeria`, `/`, `/tienda` o `/galeria/p/[slug]`
- **THEN** el HTML contiene un `<style>` con el CSS de la aplicación
- **AND** no contiene ningún `<link rel="stylesheet">` hacia `/_next/static/chunks/*.css`
- **AND** el navegador no hace ninguna petición a un `.css` antes del primer pintado

#### Scenario: La compilación no aplica la opción
- **WHEN** la compilación de producción genera HTML que sigue enlazando la hoja externa
- **THEN** el cambio NO SHALL desplegarse hasta resolverlo

#### Scenario: Primera navegación de cliente tras la carga
- **WHEN** el visitante pasa de `/galeria` a una ficha de obra con el router del cliente
- **THEN** la ficha se muestra con estilos desde el primer fotograma
- **AND** si esa navegación necesita la hoja como fichero, SHALL encontrarla ya en la caché del navegador y no esperar a descargarla

### Requirement: Ningún recurso de terceros con prioridad alta antes de hidratar

El HTML servido NO SHALL contener `<link rel="preload">` ni `<script src>` hacia un origen distinto de `140d.art` que el navegador descargue con prioridad alta durante la carga inicial. Los scripts de terceros que se ejecutan tras hidratar SHALL inyectarse tras hidratar, sin precarga en el `<head>`.

#### Scenario: Tracker de analítica en producción
- **WHEN** se inspecciona el `<head>` del HTML de producción de cualquier página
- **THEN** no aparece ningún `preload` ni `script src` hacia `analytics.140d.art`
- **AND** la petición del tracker se produce después de la hidratación

#### Scenario: Informe de dependencias de red
- **WHEN** se ejecuta Lighthouse sobre `/galeria`
- **THEN** `analytics.140d.art` no figura entre los candidatos a `preconnect`

### Requirement: `preconnect` solo hacia orígenes que la página usa durante la carga

Una página SHALL declarar `preconnect` hacia el origen de la API únicamente si hace peticiones a ella durante la carga inicial. El `preconnect` SHALL llevar `crossorigin="anonymous"`, porque el cliente de la API (`client/lib/api.js`) hace peticiones sin credenciales y el navegador las atiende desde el grupo de conexiones anónimas. El origen SHALL derivarse de `NEXT_PUBLIC_API_URL`, nunca de un literal.

El `preconnect` NO SHALL declararse en el layout raíz.

#### Scenario: Página que consulta la API al cargar
- **WHEN** se carga `/eventos`, `/live`, una de sus fichas o una ficha de artista
- **THEN** el `<head>` contiene `<link rel="preconnect" href="<origen de la API>" crossorigin="anonymous">`
- **AND** la primera petición a la API reutiliza esa conexión

#### Scenario: Página que no consulta la API al cargar
- **WHEN** se carga `/galeria`, `/tienda`, `/` o una ficha de obra
- **THEN** el `<head>` no contiene `preconnect` hacia la API
- **AND** Lighthouse no informa de ningún `preconnect` sin usar

### Requirement: Sin prefetch de enlaces que abren una pestaña nueva

Todo `<Link>` de `next/link` con `target="_blank"` SHALL declarar `prefetch={false}`. La pestaña nueva hace una carga completa que no usa la caché del router del documento actual.

#### Scenario: Banner de cookies de un visitante nuevo
- **WHEN** el banner de cookies está visible con su enlace a la política de cookies
- **THEN** el navegador no pide ningún `/legal/politica-de-cookies?_rsc=…`

### Requirement: El vídeo de la portada reserva su tamaño

El contenedor del vídeo decorativo de la portada (`client/components/StoryVideo.js`) SHALL tener un ancho que no dependa del tamaño intrínseco del `<video>`, de modo que la llegada de sus metadatos no cambie la disposición. La disposición final SHALL ser la misma que antes del cambio.

#### Scenario: Carga de la portada en móvil
- **WHEN** se carga `/` a 412 px de ancho
- **THEN** el contenedor del vídeo tiene su tamaño definitivo desde el primer pintado
- **AND** el CLS de la página es 0

#### Scenario: Disposición final en escritorio
- **WHEN** se carga `/` a 390, 768, 1024 y 1440 px de ancho y el vídeo ya reproduce
- **THEN** el tamaño y la posición del vídeo coinciden con los de la versión anterior
