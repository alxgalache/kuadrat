## 1. Higiene de descubrimiento (sin riesgo, desplegable por separado)

- [x] 1.1 Extraer la lista de rutas excluidas de `client/app/robots.js` a una constante única, reutilizable por todos los grupos de agentes
- [x] 1.2 Añadir en `robots.js` grupos explícitos para GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, CCBot, Applebot-Extended y Bingbot, cada uno con la MISMA lista de `Disallow` (un grupo específico sustituye al `*`, no se suma)
- [x] 1.3 Verificar que con `WEB_APP_HIDDEN=true` el `robots.txt` sigue devolviendo `Disallow: /` para todos y NO emite los grupos permisivos
- [x] 1.4 Crear `client/app/llms.txt/route.js` que genere el documento con las secciones y rutas reales, servido como `text/plain; charset=utf-8`
- [x] 1.5 Borrar `client/public/llms.txt` (describe la estructura anterior al renombrado; las 301 de `next.config.js` evitan que dé 404, pero sigue desactualizado)
- [x] 1.6 Comprobar que todos los enlaces relativos del nuevo `llms.txt` devuelven 200
- [x] 1.7 Crear `client/app/tienda/layout.js` con título, descripción, canónica y Open Graph propios (hoy `/tienda` hereda el título por defecto de la raíz)
- [x] 1.8 Corregir `client/app/eventos/layout.js`: el título dice «Subastas de Arte» y la ruta aloja subastas y sorteos
- [x] 1.9 Añadir `export const metadata` a `client/app/page.js` con canónica `/` y descripción propia de la home
- [x] 1.10 Añadir `robots: { index: false }` a las rutas transaccionales y con token: `pago-cancelado`, `pago-fallido`, `pedido-completado`, `order-confirmation`, `pedido/[token]`, `user-activation/[token]`, `restablecer-password/[token]`
- [x] 1.11 Añadir `CDN_BASE_URL` a `client/.env.example` documentando que `lib/serverApi.js` la usa para las imágenes de Open Graph y JSON-LD, y su relación con `NEXT_PUBLIC_CDN_URL`
- [x] 1.12 ~~Añadir `CDN_BASE_URL` a los compose~~ — NO hace falta, y tampoco al `.env` de la raíz. Ese fichero sólo alimenta la interpolación de `${VAR}` en los `build.args`, donde únicamente entran variables de tiempo de compilación; por eso `NEXT_PUBLIC_CDN_URL` sí está en la raíz y ésta no.

  **Pero cada entorno lee un fichero de runtime distinto**, y eso no estaba dicho en ninguna parte: producción `client/.env` (prod), preproducción y M1 `client/.env.staging` (pre2 y m1), local `client/.env.local`. `client/.env.example` es una plantilla que **ningún compose lee**, así que documentarla ahí no la activa: hay que copiar la línea al fichero real de cada máquina. Recogido ya en el propio `.env.example`

## 2. Sitemap completo

- [x] 2.1 Añadir los sorteos al sitemap leyendo `GET /api/draws` (`/eventos/sorteo/[id]`)
- [x] 2.2 Añadir `/legal/aviso-legal` y `/legal/politica-de-cookies`, hoy ausentes
- [x] 2.3 Añadir las superficies nuevas: `/sobre-140d`, `/galeria/artistas`, `/guias` y cada guía
- [x] 2.4 Declarar las imágenes de cada obra y producto en su entrada del sitemap
- [x] 2.5 Poner un tope de páginas a `fetchAllPaginated` para que no pueda iterar sin fin si un origen siempre responde `hasMore: true`
- [x] 2.6 Comprobar que si un origen falla el resto de URLs siguen saliendo, y que con todos caídos el sitemap conserva las rutas estáticas
- [x] 2.7 Contrastar el sitemap generado con la lista de `Disallow` de `robots.txt`: ninguna URL puede estar en ambos

## 3. Módulo único de datos estructurados

- [x] 3.1 Crear `client/lib/schema.js` con constructores que omitan toda propiedad de valor vacío en un solo sitio
- [x] 3.2 Añadir escapado de `<`, `>` y `&` en el componente `JsonLd` (la descripción de obra y la bio de artista son entrada de vendedor y viajan dentro de un `<script>`)
- [x] 3.3 Migrar el JSON-LD existente de `layout.js`, `galeria/p/[id]`, `tienda/p/[id]`, `live/[slug]`, `eventos/subasta/[id]`, `eventos/sorteo/[id]` y `preguntas-frecuentes` a los constructores, SIN cambiar todavía la salida
- [x] 3.4 Verificar que la salida es idéntica a la anterior antes de continuar

## 4. Contenido en el servidor: ficha de artista (menor riesgo, primero)

- [x] 4.1 Mover la carga del autor a `galeria/autor/[authorSlug]/page.js` y pasar el registro como prop a `GalleryAuthorContent`
- [x] 4.2 Renderizar en servidor nombre (`<h1>` único), biografía completa, localización y la lista de obras con `<a href>` a cada ficha
- [x] 4.3 Devolver `notFound()` cuando el autor no existe o no es visible
- [x] 4.4 Repetir 4.1–4.3 en `tienda/autor/[authorSlug]`
- [x] 4.5 Comprobar con `curl` sin JavaScript que la respuesta trae nombre, bio y enlaces a las obras
- [x] 4.6 Comprobar en desarrollo que no aparece ningún aviso de hidratación — consola limpia en `/galeria/autor/[slug]`, `/galeria/p/[id]`, `/galeria`, `/galeria/artistas` y `/contacto`. **`/live/[slug]` NO se ha podido comprobar: no hay ningún evento en la base de datos local.** Es la ruta con reloj de servidor, así que conviene mirarla en preproducción

## 5. Contenido en el servidor: ficha de tienda y de evento

- [x] 5.1 Mover la carga del producto a `tienda/p/[id]/page.js` y pasarlo como prop a `OthersProductDetail`; renderizar nombre, descripción y precio en servidor
- [x] 5.2 Devolver `notFound()` para producto inexistente, no visible, no aprobado o retirado
- [x] 5.3 Mover la carga del evento a `live/[slug]/page.js` y pasarlo como prop a `EventDetail`; renderizar título, descripción y fecha en servidor
- [x] 5.4 Verificar que el HTML del evento NO contiene tokens de streaming, tokens de asistente, identidades de asistentes ni controles de anfitrión
- [x] 5.5 Comprobar sin JavaScript que ambas rutas traen su contenido, y sin avisos de hidratación

## 6. Contenido en el servidor: ficha de obra (mayor riesgo, última)

- [x] 6.1 Probar a mano el flujo completo de compra en local ANTES de tocar nada, para tener la referencia
- [x] 6.2 Mover la carga de la obra a `galeria/p/[id]/page.js` y pasarla como prop a `ArtProductDetail`
- [x] 6.3 Eliminar el `useEffect` de carga inicial y la petición `artAPI.getById()` de `ArtProductDetail.js`
- [x] 6.4 Renderizar en servidor título (`<h1>` único), descripción completa, precio, atribución al artista y ficha técnica (técnica, dimensiones, edición) omitiendo los campos vacíos sin dejar etiqueta ni guion
- [x] 6.5 Devolver `notFound()` cuando la obra no existe o no es publicable (cambia el código de estado de 200 a 404: anotarlo para el despliegue)
- [x] 6.6 Verificar que cesta, carrusel, modal de artista, selección de envío y modales de consulta/cotización siguen funcionando igual
- [x] 6.7 Comprobar que el navegador ya no pide `GET /api/art/:id` en la carga inicial
- [x] 6.8 Repetir el flujo de compra completo y contrastarlo con la referencia de 6.1
- [x] 6.9 Confirmar en la tabla de rutas de `next build` que las cuatro familias siguen siendo ISR y no pasan a dinámicas
- [x] 6.10 Confirmar que `next build` (con `NODE_ENV=production`) sigue completando con la API caída

## 7. Datos estructurados enriquecidos

- [x] 7.1 Escribir el parser de `art.dimensions` que devuelva `null` ante cualquier formato no reconocido, sin adivinar medidas
- [x] 7.2 Emitir `VisualArtwork` en la ficha de obra con `artMedium`, `width`/`height`, `dateCreated`, `artEdition` y `creator` como `Person` enlazando a la ficha del artista
- [x] 7.3 Verificar que `outside_dimensions` y `outside_weight` NO aparecen en ningún dato estructurado (describen la caja, no la obra)
- [x] 7.4 Emitir el `Offer`: `SoldOut` si la edición está agotada, `PreOrder` si el escaparate está en modo cotización, `InStock` en el resto; sin revelar copias restantes
- [x] 7.5 Emitir `Person` en las fichas de artista con `name`, `url`, `description`, `image` y `address`, sin la dirección de correo
- [x] 7.6 Emitir `ItemList` de las obras del artista en su ficha
- [~] 7.7 `ItemList` emitido en `/galeria/artistas`, `/guias` y las dos fichas de artista. **NO** en `/galeria` ni `/tienda`.

  **Corrección del motivo que se anotó antes.** Se dijo que lo impedía el `layout.js`, que envuelve también las fichas anidadas. Eso sólo vale si el nodo se pone en el layout; en el `page.js` de cada listado afectaría únicamente a esa ruta. El obstáculo real es otro y es menor: ambos listados son `'use client'` y piden sus productos desde el navegador, así que en el HTML servido no hay nada que enumerar. Emitirlo exigiría envolverlos en un componente de servidor que pida la primera página —el mismo patrón que ya usan las fichas de obra—.

  Queda sin hacer por decisión de alcance, no por imposibilidad: es una mejora aditiva e invisible sobre las dos rutas de más tráfico, y no parecía prudente meterla justo antes de un despliegue. El descubrimiento del catálogo está cubierto entretanto por el sitemap (49 URLs con imágenes) y por los `ItemList` de artista.
- [x] 7.8 Enriquecer `Organization` como galería de arte con `areaServed`, `inLanguage` y `knowsAbout`, y añadir `SearchAction` al `WebSite` — sólo con datos confirmados
- [x] 7.9 Emitir `BreadcrumbList` en las rutas de detalle que aún no lo hacen, con el mismo recorrido que la miga visible
- [x] 7.10 Preferir el slug sobre el id en toda URL canónica y en todo `url` de datos estructurados
- [x] 7.11 Poner canónica sin parámetros en los listados filtrados por query string
- [x] 7.12 Añadir `og:type: product` a las fichas de obra y de tienda
- [ ] 7.13 Validar cada tipo emitido con el validador de resultados enriquecidos de Google y el de Schema.org

## 8. Superficies de contenido nuevas

- [x] 8.1 Recabar los datos de la galería y las keywords objetivo — confirmados el 21/08/2026, recogidos en `design.md` § «Datos confirmados de la galería». El nº de artistas NO se publica como literal
- [x] 8.2 Crear `/sobre-140d`, server-rendered, con `AboutPage` y primer párrafo autocontenido que responda «qué es 140d» sin depender del contexto
- [x] 8.3 Crear `/galeria/artistas` leyendo `GET /api/users/authors` (ya devuelve `bio`, `location`, `slug`, `profile_img`: no hace falta endpoint nuevo), con `ItemList` de `Person`
- [x] 8.4 Enlazar el índice de artistas desde el listado de galería y/o el pie de página para que no quede huérfano
- [x] 8.5 Reestructurar `/preguntas-frecuentes` en secciones con encabezados reales bajo un `<h1>` único — cumple el requisito de `draws-faq` que la implementación actual (lista plana) incumple
- [x] 8.6 Ampliar la FAQ con envíos y plazos, devoluciones, autenticidad y certificado, ediciones limitadas y pagos, contrastando cada respuesta con las páginas legales publicadas
- [x] 8.7 Verificar que el `FAQPage` emitido coincide una a una con las preguntas renderizadas
- [x] 8.8 Crear `/guias` y las guías priorizadas con `Article`, cada una con `<h1>` único y respuesta autocontenida en el primer párrafo
- [x] 8.9 Añadir las guías al sitemap y al `llms.txt` generado
- [x] 8.10 Revisar la jerarquía de encabezados de las páginas nuevas: un solo `<h1>` y sin saltos de nivel

## 9. Privacidad: el correo del artista fuera de las respuestas públicas

- [x] 9.1 Comprobar qué consume `seller_email` / `email` en el cliente antes de tocar nada (`grep` sobre `client/`)
- [x] 9.2 Quitar `u.email as seller_email` de las consultas públicas de `api/controllers/artController.js`
- [x] 9.3 Quitar `u.email` de la consulta pública equivalente en `api/controllers/othersController.js` si existe
- [x] 9.4 Quitar `email` de `getVisibleAuthors` y `getAuthorBySlug` en `api/controllers/usersController.js`
- [x] 9.5 Verificar que los flujos que sí necesitan el correo usan rutas autenticadas y siguen funcionando — `routes/admin/authorRoutes.js`, `shipmentRetryScheduler`, `sendcloudWebhookController`, `admin/productRoutes` y `shippingController` conservan sus propias consultas con `email`/`seller_email`; `emailService` sigue resolviendo `seller_email_contact || seller_email`
- [x] 9.6 Añadir prueba que falle si una respuesta pública de catálogo o de autor vuelve a incluir una dirección de correo

## 10. Verificación y despliegue

- [x] 10.1 Recorrer todas las rutas públicas indexables y confirmar que cada una tiene título, descripción y canónica no vacíos
- [x] 10.2 Confirmar que ninguna cadena `/galeria/mas`, `/subastas` o `/espacios` sobrevive en metadatos, datos estructurados o ficheros de descubrimiento
- [x] 10.3 Confirmar que dos rutas distintas no declaran la misma canónica
- [ ] 10.4 Comparar tamaño de HTML y tiempo de render de una ficha de obra antes y después (techo conocido: ~25 req/s, cliente a 0.5 vCPU)
- [x] 10.5 Comprobar que las imágenes de Open Graph son absolutas y descargables desde fuera de la red interna
- [ ] 10.6 Desplegar con `./deploy/deploy.sh` y **purgar la caché de nginx después de que los contenedores respondan**
- [ ] 10.7 En producción, `curl` sin JavaScript sobre una ficha de obra y una de artista para confirmar que traen su texto
- [ ] 10.8 Enviar el sitemap en Search Console y en Bing Webmaster Tools, y revisar la cobertura pasados unos días

## 11. Hallazgos surgidos durante la implementación

- [x] 11.1 `SafeHTML` usaba `dompurify` a secas, sin `sanitize` fuera del navegador: al servir la obra desde el servidor daba **500 en la ruta de compra**. Nunca había saltado porque este código no llegaba a ejecutarse en servidor. Resuelto con `isomorphic-dompurify` (mismo DOMPurify + jsdom en servidor), que además garantiza salida idéntica en ambos lados
- [x] 11.2 `openGraph.type: 'product'` no es un tipo válido para Next: lanza «Invalid OpenGraph type» en render, un 500. Corregido a `website`; la naturaleza de producto la expresa el JSON-LD. Spec `seo-metadata-coverage` enmendado
- [x] 11.3 La biografía del artista es HTML del editor enriquecido y se pintaba como texto plano, dejando los `<p>` a la vista. Resuelto con `SafeAuthorBio`
- [x] 11.4 Las CINCO páginas legales declaraban la **portada** como su canónica (heredada de la raíz, que fija `canonical: '/'`), y su título duplicaba la marca. Defecto preexistente que destapó el barrido de metadatos
- [x] 11.5 `dynamicParams = false` en las guías provocaba `NoFallbackError`. Puesto a `true`; los slugs desconocidos ya los rechaza `getGuide()` con `notFound()`
- [x] 11.6 **Corrección de un dato del análisis inicial:** se afirmó que `/galeria/mas`, `/subastas` y `/espacios` daban 404. No es así — `next.config.js` tiene una redirección 301 para cada una. El `llms.txt` estaba desactualizado, no roto
- [ ] 11.7 **Dependencia nueva:** `isomorphic-dompurify` (arrastra `jsdom`, ~40 paquetes, sólo servidor). Confirmar que el tamaño de imagen y el consumo de memoria en el contenedor de cliente (0.5 vCPU / 1500M) siguen siendo aceptables tras el despliegue
- [x] 11.8 **`next/image` con URL absoluta rompía en desarrollo.** `getAuthorImageUrl` de `serverApi.js` servía a dos usos incompatibles: la URL ABSOLUTA que necesitan Open Graph y el JSON-LD (la leen clientes externos), y la que se le pasa a `next/image`, que en desarrollo debe ir por `/img-proxy/` —el optimizador descarga desde el propio servidor Next, donde `localhost:3001` no resuelve dentro de Docker—. Separadas en `getAuthorImageUrl` (absoluta) y `getAuthorImageDisplayUrl` (visualización). NO se añade `localhost` a los `remotePatterns`: el proxy es el mecanismo correcto y ya existía en `lib/api.js`
- [x] 11.9 **El aviso «Encountered a script tag while rendering React component» era CONSECUENCIA de 11.8, no un problema propio.** Verificado experimentalmente: reintroduciendo el fallo de imagen vuelven los dos juntos; con él corregido no aparece ninguno, ni en carga directa ni en navegación de cliente. El mecanismo está en la traza (`renderRootSync` / `performWorkOnRoot`): al fallar el render, React rehace el árbol ENTERO en cliente, y en ese pase encuentra el `<script>` de arranque de cookies del layout raíz — que React sólo señala cuando se renderiza en cliente. Ese `<script>` es correcto y no se toca: es deliberadamente el primer nodo del `<body>` para ocultar el banner antes del primer pintado (ver CLAUDE.md). **Cualquier error de render en cualquier página producirá ese mismo aviso**; es un síntoma, no una causa

## 12. Reversión de UI: la optimización no puede cambiar las pantallas existentes

Decisión del operador (21/08/2026): salvo las páginas NUEVAS, ninguna interfaz ya
existente puede cambiar de aspecto, diseño o estructura. La información para
buscadores y motores generativos tiene que viajar sin mostrarse al visitante.

- [x] 12.1 Retirada la cabecera de artista (`ArtistProfileHeader`) de `/galeria/autor/[slug]` y `/tienda/autor/[slug]`; el componente se elimina del repositorio
- [x] 12.2 Revertidas las migas de las fichas de obra y de tienda al recorrido original (`Galería|Tienda › Nombre`), y con ellas el `BreadcrumbList`, que no puede declarar un recorrido que el visitante no ve
- [x] 12.3 La biografía del artista pasa a viajar SOLO en el nodo `Person` de datos estructurados. **Es el canal previsto para esto**: JSON-LD lo leen buscadores y modelos, y no se muestra
- [x] 12.4 `<h1 className="sr-only">` con el nombre del artista en las dos fichas de artista. Es el patrón que el proyecto YA usa en `/eventos/page.js`, y corrige un defecto real de accesibilidad: la página no tenía ningún encabezado
- [x] 12.5 `<h1>` invisible también en la rama de carga de `/galeria` y `/tienda`. El `sr-only` existía, pero en la rama que sólo aparece tras cargar los productos en el cliente: el HTML servido —el único que ven los rastreadores sin JavaScript— **salía sin ningún encabezado**
- [x] 12.6 Confirmado que `/live/[slug]` no cambió de aspecto: sólo se sembró el dato, el árbol renderizado es el mismo
- [x] 12.7 Se conservan, por decisión explícita del operador: los tres enlaces del pie (Artistas · Sobre 140d · Guías), sin los cuales las páginas nuevas quedan huérfanas, y la FAQ reestructurada en secciones (que su propio spec `draws-faq` ya exigía)

**El límite del `sr-only`, que conviene no cruzar:** un encabezado que nombra la
página es accesibilidad legítima. Meter ahí la biografía entera, o cualquier
bloque de texto que el visitante no ve, sería cloaking — Google lo descuenta y
puede penalizarlo. Por eso la bio va en JSON-LD y no en un div oculto.

## 13. Rediseño del índice de artistas

- [x] 13.1 Rejilla con retrato dominante en 3:4, con el mismo vocabulario visual que `ProductGrid` (`rounded-md`, `bg-gray-200`, atenuado por opacidad limitado a `hover:hover`) para que la página no parezca de otro sitio
- [x] 13.2 Recuento real de obras por artista, en paralelo
- [x] 13.3 Versión anterior guardada en `alternativas/artistas-v1-rejilla-redonda.page.js` por si se prefiere volver

## 14. Revisión de los textos de las guías

Correcciones objetivas aplicadas:

- [x] 14.1 Tres concatenaciones sin espacio que salían pegadas al lector («etc.Este», «mismo.Desde», «galería.Debes»)
- [x] 14.2 «por tí» → «por ti»
- [x] 14.3 «estándares **criptográficos** ISO/IEC 14443…»: los tres son de comunicación NFC, no de criptografía. Reescrito como «la verificación es criptográfica (AES-128 CMAC) y el chip cumple los estándares NFC…»
- [x] 14.4 **Texto de instrucciones al redactor que seguía publicándose** en «¿Cómo lo compruebo?» («Detalla el paso a paso y qué se ve en cada resultado posible»). Sustituido por contenido real basado en los estados que devuelve `/coa`
- [x] 14.5 Contradicción en «¿Y si pierdo el certificado?»: decía que la pérdida es «irreparable» y a renglón seguido que la galería envía uno nuevo. El sistema permite revocar una etiqueta (`PATCH /api/admin/coa/tags/:uid/status`) y emitir otra, así que se reescribe conforme a lo que el producto hace

Revisados con el operador el 21/08/2026 y **aceptados tal cual**. Se dejan
registrados porque son afirmaciones públicas y conviene saber dónde están si el
proceso de negocio cambia:

- [x] 14.6 **«El dinero se liquida al final de cada día hábil»** contradice al spec `seller-withdrawals`, según el cual `POST /api/seller/withdrawals` es sólo un aviso al administrador, que procesa el pago desde `/admin/payouts/<sellerId>`. Puede que Stripe Connect sí liquide a diario en la configuración real; hay que confirmarlo antes de publicar un compromiso de pago a los artistas
- [x] 14.7 **Devoluciones**: los 14 días naturales SÍ coinciden con los términos publicados, pero la guía omite que los términos **excluyen las compras en subasta pública**. Un comprador de subasta leería que puede devolver
- [x] 14.8 **«La galería se encarga del embalaje» / «El artista no tiene que preocuparse de nada»**: `art.packaging_cost` es por obra y un artista que se autoembala con coste 0 es un caso contemplado. Verificar quién embala realmente antes de publicarlo como compromiso
- [x] 14.9 Menores: «Common Criteria EAL4» (la certificación del NTAG 424 DNA es **EAL4+**); «está avalado» sin decir por quién puede leerse como una certificación que no se tiene; «"x/y" indica el orden en que se ha **comercializado**» (convencionalmente indica la posición dentro de la edición, no el orden de venta)

## 15. Ajuste final del índice de artistas

- [x] 15.1 Rejilla de tres a **cuatro** columnas en escritorio (`grid-cols-2 … lg:grid-cols-4`), que es exactamente la retícula de `ProductGrid`. Los retratos resultaban demasiado grandes a tres por fila
- [x] 15.2 `sizes` actualizado de `33vw` a `25vw`: va atado al número de columnas, y desfasado hace que el navegador escoja del srcset una variante mayor de la necesaria

## 16. Herramienta de verificación

- [x] 16.1 `scripts/check-seo.py`: comprueba título, descripción, canónica, número de `<h1>` y validez de cada bloque JSON-LD sobre URLs ya publicadas, y detecta canónicas duplicadas entre rutas. Pensado para pasarlo contra producción después de desplegar
- [x] 16.2 En su primera ejecución encontró una ruta más sin `<h1>`: `/contacto`, que usaba un `<h2>` como encabezado principal. Promocionado a `<h1>` con las mismas clases — `@tailwind base` iguala tamaño y grosor de `h1..h6`, así que el render es idéntico píxel a píxel

## 17. Verificación de `/live/[slug]` (había un evento en local)

- [x] 17.1 Contenido en el HTML servido sin JavaScript: `<h1>` con el título, descripción, categoría, fecha, duración y anfitrión. Ya no sale la rama «Cargando…»
- [x] 17.2 **Sin fugas**: comprobado que el HTML de un visitante anónimo no contiene tokens JWT/LiveKit, `accessToken`, `attendeeId`, certificado de Agora, `vtoken` de vídeo ni ningún secreto
- [x] 17.3 Consola limpia: ningún aviso de hidratación, que era el riesgo principal de esta ruta por su reloj de servidor
- [x] 17.4 Interfaz sin cambios (comprobado con captura): miga, imagen, título, precio, descripción, categoría, fecha, anfitrión y estado, igual que antes
- [x] 17.5 **Parpadeo de dato falso corregido:** `fetchEvent` descartaba el `attendeeCount` que la API sí devuelve, así que el servidor pintaba «0 registrados» y saltaba al número real al hidratar. Ahora se siembra desde la misma respuesta cacheada. `serverTimeOffset` sigue SIN sembrarse a propósito: es un reloj que gobierna la sincronía del reproductor, y hornear en el HTML un desfase de hasta cinco minutos daría una sincronía mal por ese margen
- [x] 17.6 **Defecto preexistente en el `Event` de datos estructurados:** `startDate` se emitía en hora local ingenua (`2026-08-21T19:52`) y `endDate` en UTC absoluto vía `.toISOString()`. Dos marcos temporales en el mismo nodo: un consumidor que leyera ambos deduciría una duración desplazada por el desfase horario (con Europe/Madrid en agosto, dos horas de más). Ahora los dos van en el mismo marco. Verificado: 19:52 → 20:52, 60 min

  *No se toca `eventStatus`:* un evento terminado se queda en `EventScheduled`, y es lo correcto — schema.org no tiene un estado «finalizado», y son `startDate`/`endDate` los que dicen que ya pasó.

## 18. Rediseño de la tarjeta de evento en `/live`

Petición explícita del operador: la información bajo la descripción salía
desordenada. Tres causas, no una:

- [x] 18.1 **La imagen se llevaba el 50 % de la tarjeta** y ahogaba el texto en la otra mitad: la fila de metadatos no cabía y el navegador partía CADA dato por dentro («21 de agosto de / 2026», «60 / min», «por Alicia Nieto / Velázquez»). Baja al 40 % y cada dato lleva `whitespace-nowrap`, así que la fila se parte ENTRE datos, nunca dentro de uno
- [x] 18.2 **«En directo» aparecía dos veces**: como insignia arriba y otra vez en `EventCountdown`. Las insignias se quedan con lo que el evento ES (categoría) y lo que CUESTA (precio); el estado temporal es del contador, que además es el único de los dos que cambia solo
- [x] 18.3 **El anfitrión estaba metido a presión en la fila de metadatos**, que es de tiempo. Ahora tiene su propia línea
- [x] 18.4 Separadores de punto medio marcados `aria-hidden`: un lector de pantalla no debe leer «punto» entre la fecha y la hora
- [x] 18.5 El estado se separa con un filete y su propio espacio: es información de otra naturaleza y conviene leerla aparte
- [x] 18.6 Degradado de la imagen de dos paradas a tres (`from-white via-white/40 to-transparent`): con dos, el corte se veía
- [x] 18.7 `sizes` pasa a `(min-width: 640px) 40vw, 0px` — la imagen está `hidden` por debajo de `sm`, así que declarar 0 evita descargar una imagen grande donde no se muestra

**`EventCountdown` NO se ha tocado**: lo comparte la ficha de evento
(`/live/[slug]`), y modificarlo habría cambiado también esa pantalla.

## 19. Corrección tras el despliegue: el `<h1>` de `/galeria` y `/tienda`

`check-seo.py` contra producción encontró 2 problemas: ambos listados seguían
publicándose **sin ningún `<h1>`**, pese a que la comprobación local había dado
1. No era caché: el build de producción tampoco lo emitía.

- [x] 19.1 **Causa.** `useSearchParams()` obliga a estas dos páginas a salirse a cliente durante el prerenderizado, así que lo que Next hornea en el HTML estático es el **fallback del `Suspense`**, no el contenido ni su pantalla de carga. El `<h1>` estaba DENTRO de la frontera —tanto el preexistente del render de contenido como el que se añadió en 12.5— y por tanto nunca llegaba al HTML servido
- [x] 19.2 **Por qué la comprobación local no lo vio.** Se hizo contra `next dev`, que renderiza de otra forma que el prerenderizado estático: en desarrollo el `<h1>` sí aparecía. Comprobar SEO contra el servidor de desarrollo no equivale a comprobarlo contra lo que se publica
- [x] 19.3 **Arreglo.** Un único `<h1 className="sr-only">` por página, **fuera** del `Suspense`. Fuera de la frontera se renderiza siempre: en el HTML estático, mientras se muestra el fallback y tras hidratar. Se retiran los dos que había dentro, así que no puede duplicarse
- [x] 19.4 De paso, el `<h1>` de `/tienda` decía «Más Productos», nombre anterior al renombrado de rutas del spec `navigation-naming`. Ahora dice «Tienda de los artistas»
- [x] 19.5 Verificado en el HTML **horneado**, no en el servidor de desarrollo: `.next/server/app/{galeria,tienda,contacto}.html` → `h1=1` en los tres. Y en navegador tras hidratar: exactamente un `<h1>`, invisible, con las 24 obras cargadas y sin avisos de hidratación
- [x] 19.6 `scripts/check-seo.py` documenta ahora esta trampa y el comando para comprobar el HTML horneado, que es lo que había que haber hecho desde el principio

- [ ] 19.7 **Volver a desplegar** para que el arreglo llegue a producción, y repasar con `python3 scripts/check-seo.py https://140d.art` (debe dar 0 problemas)
