## 1. Corrección del renderizado de la biografía

- [x] 1.1 En `client/components/SafeHTML.js`, extraer la configuración de `SafeAuthorBio` a una constante de módulo (`AUTHOR_BIO_CONFIG`) para que el `useMemo` de `SafeHTML` deje de invalidarse en cada render.
- [x] 1.2 Añadir `data-list` a `ALLOWED_ATTR` de `AUTHOR_BIO_CONFIG` (blindaje explícito, no corrección: DOMPurify ya lo conserva vía `ALLOW_DATA_ATTR`), manteniendo `ALLOWED_TAGS` sin cambios.
- [x] 1.3 Añadir `FORBID_TAGS: ['span']` a `AUTHOR_BIO_CONFIG` para descartar explícitamente el `<span class="ql-ui">` de Quill, que hoy ya cae por no estar en `ALLOWED_TAGS`.
- [x] 1.4 En `client/app/globals.css`, añadir dentro de `@layer components` el bloque `.author-bio` que restituye lo que borra el preflight: márgenes de `p`, `line-height` legible, `padding-left` en `ul`/`ol`, separación entre `li`, y estilos de `strong`, `em`, `u` y `a` (enlace visualmente distinguible).
- [x] 1.5 En el mismo bloque, añadir las reglas de marcador basadas en atributo: `.author-bio ol { list-style: none }`, `li[data-list="bullet"] → disc`, `li[data-list="ordered"] → decimal`, más los reservas `ul li:not([data-list]) → disc` y `ol li:not([data-list]) → decimal` para HTML heredado.
- [x] 1.6 Verificado con la biografía real de Alicia Nieto: la lista de tres másteres se renderiza con viñetas de disco y sangría, sin numeración y sin espacio residual del `span.ql-ui`.
- [x] 1.7 Verificado inyectando el HTML de Quill: `data-list="ordered"` numera 1./2./3. correlativamente desde 1.

## 2. Rediseño de la ficha de artista

- [x] 2.1 En `client/lib/constants.js`, añadir las constantes es-ES de la ficha (etiqueta de sección "BIOGRAFÍA" y el texto de biografía no disponible), siguiendo el patrón de `EDITION_COPY`.
- [x] 2.2 En `client/components/AuthorModal.js`, reescribir `DialogPanel` como `w-full max-w-4xl overflow-hidden rounded-2xl` con `flex flex-col md:flex-row` (altura acotada en `.author-card-panel`), conservando intacto el contrato de props (`author`, `open`, `onClose`) y las transiciones existentes. **Flex, no grid** — ver D1 y la tarea 4.1.
- [x] 2.3 Implementar la columna de imagen con `next/image`, `object-cover` y `sizes` acorde al ancho real. La selección entre las dos variantes se añade en el grupo 7.
- [x] 2.4 Implementar el marcador de iniciales para artistas sin `profile_img`: derivar las iniciales de `full_name` (primeras letras de las dos primeras palabras, en mayúsculas) sobre `bg-gray-100`, conservando la maqueta de dos columnas.
- [x] 2.5 Implementar la columna de contenido como `flex flex-col min-h-0` con tres bandas: cabecera fija (nombre en `DialogTitle` + ubicación), cuerpo `flex-1 overflow-y-auto` y barra de acciones fija.
- [x] 2.6 Renderizar la biografía en el cuerpo con `SafeAuthorBio` y la clase `author-bio`, retirando las clases `prose prose-sm` inertes; mostrar el texto de biografía no disponible cuando `author.bio` esté vacía.
- [x] 2.7 Omitir la ubicación por completo cuando `author.location` esté vacía, sin reservar espacio.
- [x] 2.8 Añadir los elementos gráficos de ficha: filete divisorio entre columnas (vertical en `md+`, horizontal en móvil), regla bajo la cabecera, etiqueta de sección en mayúsculas con `tracking` ampliado sobre la biografía y regla sobre la barra de acciones.
- [x] 2.9 Mantener "Cerrar" como única acción, sin enlaces de navegación, y ajustar su ancho a la barra de acciones (ya no a ancho completo del panel).
- [x] 2.10 Aplicar `max-h-[88dvh]` en móvil declarando antes el valor en `vh` como reserva para motores sin soporte de `dvh`.

## 3. Coherencia en las vistas de perfil

- [x] 3.1 En `client/app/seller/profile/page.js`, sustituir las clases `prose` inertes del `SafeAuthorBio` por `author-bio`.
- [x] 3.2 En `client/app/admin/authors/[id]/page.js`, aplicar el mismo cambio.

## 4. Verificación

Realizada en Chrome contra el dev server (`localhost:3000`), midiendo el DOM además de inspeccionar visualmente.

- [x] 4.1 Escritorio: ficha de Alicia Nieto (biografía larga) desde `/galeria`. Imagen a 778 px de alto, fija durante el scroll del texto; panel 779 px = 90 % de un viewport de 865 px, sin tocar los bordes. **Destapó el fallo del grid** corregido en D1.
- [x] 4.2 Escritorio: fichas de Chema B y Elena Valiente (biografías cortas). El panel se ajusta al contenido (339 px), sin barra de scroll ni espacio vacío.
- [x] 4.3 Ventana baja: **simulado** forzando el clamp del panel a 540 px (= 90 % de 600). Título visible, cuerpo con scroll y botón "Cerrar" dentro del panel. No se pudo redimensionar la ventana real (`resize_window` no altera el viewport con la ventana maximizada; los popups dimensionables están bloqueados).
- [x] 4.4 Móvil: **simulado** retirando las clases `md:` — exactamente lo que hace el navegador por debajo de 768 px. Apilado correcto, banda de imagen al 33 % de la altura del panel (≤ 40 % del spec), cuerpo con scroll y "Cerrar" fijo dentro del panel. No se pudo fijar un viewport real de 375 px por la misma limitación.
- [x] 4.5 Estados de datos ausentes: ningún autor real tiene campos vacíos, así que se forzaron los tres a `null` con una edición temporal del componente (revertida y verificada como revertida). Iniciales "AN" sobre fondo neutro, sin hueco de ubicación, y mensaje es-ES de biografía no disponible.
- [x] 4.6 Puntos de entrada comprobados: `/galeria`, `/tienda` y detalle de obra (`/galeria/p/…`), los tres con datos distintos. Página de autor, sorteo y evento en directo no se recorrieron: montan el mismo componente con el mismo contrato de props, ya ejercitado.
- [x] 4.7 Cierre verificado con el botón, con `Escape` y con clic en el fondo.
- [x] 4.8 Sin fugas: todas las reglas van acotadas por `.author-bio` y no se estila ninguna etiqueta desnuda. Confirmado además en `/admin/authors/67`, donde la clase aplica y el resto de la página no se altera.
- [ ] 4.9 Build de producción **no ejecutado**: `client/node_modules` está vacío en el host (dependencias dentro del contenedor) y lanzar `npm run build` ahí sobrescribiría el `.next` del dev server en uso. En su lugar se comprobó que Next compila los ficheros modificados sin errores y que la consola del navegador no registra errores ni avisos de hidratación tras recargar y abrir la ficha. El proyecto no tiene configuración de ESLint (`eslint.config.js` ausente), así que no hay linter que ejecutar.

## 5. Encuadre de la imagen — intentos revertidos

Dos enfoques implementados y verificados que funcionaban, pero que el usuario descartó por estética. Se dejan registrados porque acotan el espacio de soluciones.

- [x] 5.1 Marco de proporción fija 4:5 sobre fondo neutro, con `object-top` y dimensionado invertido por breakpoint. Recorte acotado al ~33 % y desacoplado de la longitud del texto. **Revertido.**
- [x] 5.2 Fondo con la propia imagen muy desenfocada tras ese marco, para recuperar la sensación de imagen a sangre. **Revertido.**
- [x] 5.3 Revertida la columna de imagen a la primera implementación validada (relleno a sangre con `object-cover`), conservando el resto del cambio (flex, CSS de biografía, altura del panel).

## 7. Dos imágenes por artista

- [x] 7.1 En `api/config/database.js`, añadir `profile_img_mobile TEXT` y `hide_profile_img_mobile INTEGER NOT NULL DEFAULT 0` al `CREATE TABLE users` y sendas líneas `safeAlter` para bases existentes.
- [x] 7.2 Extraer la lógica de subida a `storeAuthorAvatar(req, res, column)` y exponer `POST /:id/upload-avatar-mobile` junto al `upload-avatar` existente, con el nombre de columna tomado siempre de un literal del punto de llamada.
- [x] 7.3 Hacer que el borrado del fichero anterior consulte y limpie sólo la columna que se está escribiendo, para que sustituir una variante no elimine la otra.
- [x] 7.4 Persistir `hide_profile_img_mobile` en el alta (`POST /`) y en la edición (`PUT /:id`), con la misma convención de campo omitido = valor sin tocar.
- [x] 7.5 Añadir las dos columnas a los `SELECT` de autor del panel de administración y a las consultas públicas de `usersController` que alimentan la ficha.
- [x] 7.6 Crear `client/components/admin/AuthorImageDropzone.js` con la validación, la vista previa y el ciclo de vida de los object URL, para no duplicarlos en cuatro sitios.
- [x] 7.7 Añadir `adminAPI.authors.uploadAvatarMobile()` en `client/lib/api.js`.
- [x] 7.8 Añadir el campo "Imagen para móvil" y la casilla "No mostrar imagen en versión móvil" a las páginas de creación y de edición de artista, sustituyendo el dropzone en línea por el componente compartido y retirando los imports que quedan sin uso.
- [x] 7.9 En `AuthorModal`, elegir la variante por CSS (`hidden md:block` / `md:hidden`), con fallback a `profile_img` cuando no hay variante móvil, y omitir la columna por debajo de `md` cuando la casilla está activa.
- [x] 7.10 Verificar que la migración se aplica al arrancar la API y que las consultas públicas devuelven los dos campos nuevos con los valores por defecto correctos (`profile_img_mobile: null`, `hide_profile_img_mobile: 0`) para los artistas existentes.
- [x] 7.11 Verificar que las tres páginas afectadas (`/galeria`, alta y edición de artista) compilan y responden 200 sin errores.
- [ ] 7.12 **Pendiente de verificación manual del usuario**: subir una imagen apaisada a un artista y comprobar el cambio de variante en un móvil real; probar la casilla de ocultar; comprobar que sustituir el avatar no borra la imagen móvil.

## 6. Comprobaciones añadidas durante la implementación## 6. Comprobaciones añadidas durante la implementación

- [x] 6.1 Verificado con DOMPurify 3.x sobre el HTML real de la biografía que `data-list` **ya se conservaba** y que el `span.ql-ui` **ya se eliminaba**: la salida saneada es idéntica antes y después del cambio. Corregidos `proposal.md` y `design.md`, que atribuían el fallo al saneado.
- [x] 6.2 Verificado en el CSS servido que las 16 reglas `.author-bio` llegan al bundle, incluidas las de `data-list`.
- [x] 6.3 Verificado que la reserva `vh` sobrevive al optimizador CSS tras moverla a `@supports` (antes se perdía silenciosamente).
- [x] 6.4 Verificados los cuatro casos de lista: `data-list="bullet"` → disco, `data-list="ordered"` → 1./2./3. correlativos, y `ul`/`ol` heredados sin atributo → disco y decimal respectivamente.
