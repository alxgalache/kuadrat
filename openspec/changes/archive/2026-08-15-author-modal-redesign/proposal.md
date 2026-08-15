## Why

La ficha de artista que se abre desde la galería (`AuthorModal`) presenta hoy una foto de perfil circular de 96 px sobre un bloque de texto centrado: la imagen queda anecdótica, la biografía es difícil de leer y, cuando el texto es largo, el modal crece hasta chocar con los bordes de la pantalla arrastrando la foto fuera de vista. Además, las listas que el admin puede crear con el editor Quill (viñetas y numeradas) se renderizan sin marcadores ni sangría, por lo que la información publicada llega distorsionada al comprador.

## What Changes

### Rediseño de la ficha de artista

- `AuthorModal` pasa a una **maqueta de dos columnas tipo ficha de catálogo** en escritorio: imagen del artista a la izquierda ocupando toda la altura del panel, contenido textual a la derecha.
- La columna de imagen es **fija (sticky)**: permanece visible mientras se hace scroll por la biografía.
- La biografía se desplaza dentro de su propio contenedor con altura acotada; **el panel del modal nunca supera el alto de la ventana** (`max-h`), por lo que deja de colapsar contra los bordes.
- Se refuerza la lectura de "ficha" con elementos gráficos discretos: filete divisorio entre columnas, cabecera con nombre y ubicación separada del cuerpo por una regla, etiqueta de sección para la biografía y una barra de acción inferior fija con el botón "Cerrar".
- En **móvil** la ficha se apila: imagen apaisada arriba (ratio controlado, sin ocupar toda la pantalla), texto debajo con su propio scroll, y el botón "Cerrar" siempre accesible en la barra inferior.
- Se contemplan los estados de datos ausentes: sin `profile_img` se muestra un marcador con las iniciales del artista; sin `location` o sin `bio` la maqueta no deja huecos.

### Dos imágenes por artista

La banda apilada de móvil y la columna de escritorio tienen proporciones opuestas y extremas (hasta 3,8:1 por debajo de `md`, 0,46:1 en escritorio), así que una sola fotografía no puede llenar ambas conservando su sujeto: en pantallas pequeñas los retratos verticales aparecían con la cara partida. En vez de buscar un encuadre universal —imposible geométricamente— cada artista pasa a tener dos imágenes:

- **`users.profile_img_mobile`** (nueva columna): variante apaisada usada por debajo de `md`. Vacía → se usa `profile_img`, de modo que los artistas existentes no cambian.
- **`users.hide_profile_img_mobile`** (nueva columna): cuando está activa, no se muestra ninguna imagen por debajo de `md` y la ficha se abre directamente por el nombre. Por defecto desactivada.
- Los formularios de **creación y edición** de artista incorporan el campo "Imagen para móvil" y la casilla "No mostrar imagen en versión móvil".
- El modal **no incorpora enlaces de navegación** (decisión del usuario): sigue siendo informativo, con "Cerrar" como única acción.

### Corrección del renderizado de listas

- **Causa raíz (única):** el modal aplica las clases `prose prose-sm`, pero `@tailwindcss/typography` **no está instalado** (`client/tailwind.config.js` tiene `plugins: []`), así que son clases inertes. El *preflight* de Tailwind resetea `ul`/`ol` a `list-style: none; margin: 0; padding: 0`, y por eso las listas aparecen como líneas sueltas sin viñeta ni sangría.
- **Particularidad del contenido:** Quill 2 codifica las viñetas como `<ol><li data-list="bullet">`, es decir, el tipo de lista vive en el atributo `data-list`, no en la etiqueta. Los estilos deben derivar el marcador del atributo; estilar por etiqueta renderizaría numeradas las listas de viñetas. **Verificado** que `SafeAuthorBio` sí conserva hoy `data-list` (DOMPurify aplica `ALLOW_DATA_ATTR: true` por defecto, y esa rama tiene prioridad sobre `ALLOWED_ATTR`) y que ya descarta el `<span class="ql-ui">`, de modo que el saneado no forma parte del fallo.
- **Solución:** una hoja de estilos propia con ámbito acotado (clase `author-bio` en `client/app/globals.css`) que restituye márgenes, viñetas y sangrías de `p`, `ul`, `ol`, `li`, `strong`, `em`, `u` y `a`, incluyendo la regla específica para `li[data-list="bullet"]` / `li[data-list="ordered"]` de Quill 2. En `SafeAuthorBio` se fija además de forma **explícita** el contrato del que dependen esos estilos (`data-list` en `ALLOWED_ATTR`, `span` en `FORBID_TAGS`): no cambia el comportamiento actual, pero impide que una futura configuración más estricta rompa el renderizado en silencio.
- Sin nuevas dependencias ni ~30 KB de CSS del plugin `typography` (decisión del usuario).

### Alcance del componente

- Se rediseña el **componente compartido** (decisión del usuario): la nueva ficha aparece en `/galeria`, `/tienda`, las páginas de autor, el detalle de producto, sorteos y eventos live. La corrección de listas beneficia además a `/seller/profile` y `/admin/authors/[id]`, que también renderizan la biografía con `SafeAuthorBio`.

No hay variables de entorno nuevas.

## Capabilities

### New Capabilities
- `author-bio-modal`: la ficha de artista compartida — incluye la selección de imagen por tamaño de pantalla (`profile_img` / `profile_img_mobile` / `hide_profile_img_mobile`) y su gestión desde el formulario de artista — maqueta de dos columnas, imagen sticky, scroll acotado del texto, comportamiento responsive, estados de datos ausentes y renderizado fiel del HTML enriquecido de la biografía (párrafos, listas de viñetas y numeradas, negritas, cursivas, subrayados y enlaces) tal y como lo produce el editor Quill del panel de administración.

### Modified Capabilities
<!-- Ninguna. Ningún spec existente define requisitos sobre la ficha de artista ni sobre el renderizado de la biografía. -->

## Impact

**Base de datos** — dos columnas nuevas en `users`, declaradas en el `CREATE TABLE` y añadidas con `safeAlter` para bases existentes: `profile_img_mobile TEXT` y `hide_profile_img_mobile INTEGER NOT NULL DEFAULT 0`. Ambos valores por defecto reproducen el comportamiento previo, así que no hay backfill.

**Backend afectado**
- `api/config/database.js` — las dos columnas.
- `api/routes/admin/authorRoutes.js` — nuevo endpoint `POST /:id/upload-avatar-mobile`; lógica de subida extraída a `storeAuthorAvatar(req, res, column)` y compartida con `upload-avatar`; `hide_profile_img_mobile` persistido en el alta y en la edición; columnas añadidas a los `SELECT` de autor.
- `api/controllers/usersController.js` — las dos columnas en las consultas públicas de autores que alimentan la ficha.

**Código afectado**
- `client/components/AuthorModal.js` — reescritura de la maqueta (dos columnas, sticky, scroll, barra de acciones, estados vacíos) y selección de imagen por tamaño de pantalla.
- `client/components/admin/AuthorImageDropzone.js` — **nuevo**: campo de imagen reutilizable (validación, vista previa y ciclo de vida de los object URL), compartido por los dos campos de las dos páginas de artista.
- `client/app/admin/autores/nuevo/page.js` y `client/app/admin/authors/[id]/edit/page.js` — campo "Imagen para móvil", casilla de ocultar y subida de la nueva variante.
- `client/lib/api.js` — `adminAPI.authors.uploadAvatarMobile()`.
- `client/components/SafeHTML.js` — `SafeAuthorBio` permite `data-list` y elimina el `span.ql-ui` residual de Quill.
- `client/app/globals.css` — nuevo bloque de estilos `.author-bio` para el HTML enriquecido.
- `client/app/seller/profile/page.js` y `client/app/admin/authors/[id]/page.js` — pasan a usar la clase `author-bio` en lugar de las clases `prose` inertes (misma corrección de listas).

**Consumidores del modal (sin cambios de API del componente)**
`client/app/galeria/page.js`, `client/app/galeria/autor/[authorSlug]/GalleryAuthorContent.js`, `client/app/galeria/p/[id]/ArtProductDetail.js`, `client/app/tienda/page.js`, `client/app/tienda/autor/[authorSlug]/GalleryMasAuthorContent.js`, `client/app/tienda/p/[id]/OthersProductDetail.js`, `client/app/eventos/sorteo/[id]/DrawDetail.js`, `client/app/live/[slug]/EventDetail.js` — todos siguen invocando `<AuthorModal author open onClose />` sin modificaciones.

**Sin impacto en**: dependencias npm, variables de entorno, Docker, CSP.
