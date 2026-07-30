## Context

`client/components/AuthorModal.js` es un componente compartido de ~83 líneas construido sobre `Dialog` de Headless UI. Su maqueta actual es un `DialogPanel` de `sm:max-w-2xl` con una foto circular de `size-24` centrada, el nombre, la ubicación y la biografía saneada mediante `SafeAuthorBio`, más un botón "Cerrar" a ancho completo. El scroll lo gestiona el contenedor externo `fixed inset-0 overflow-y-auto`, por lo que con biografías largas **el panel entero crece y se desplaza**: la foto se va de la pantalla y el panel choca con los bordes del viewport.

Ocho vistas lo consumen con el mismo contrato de props (`author`, `open`, `onClose`): galería de arte y su página de autor, detalle de obra, tienda y su página de autor, detalle de producto de tienda, detalle de sorteo y detalle de evento en directo. Los datos del autor provienen de `usersController` y contienen `id`, `email`, `full_name`, `slug`, `profile_img`, `location`, `bio`, `visible`.

El bug de las listas tiene **una sola causa**: las clases `prose prose-sm` son inertes. `client/tailwind.config.js` declara `plugins: []` y `@tailwindcss/typography` no figura en `client/package.json`. El *preflight* de Tailwind resetea `ul, ol { list-style: none; margin: 0; padding: 0 }` y `p { margin: 0 }`, y nada lo restituye. De ahí que en la captura las listas aparezcan como líneas sueltas sin viñeta ni sangría.

Una particularidad del contenido condiciona la forma de la corrección: **Quill 2 codifica el tipo de lista en un atributo, no en la etiqueta.** El HTML almacenado usa `<ol><li data-list="bullet">`, de modo que unos estilos basados en la etiqueta renderizarían numeradas las listas de viñetas. Los selectores deben partir de `data-list`.

El saneado, en cambio, **no participa en el fallo**, contra lo que sugería el análisis inicial. Se comprobó ejecutando DOMPurify 3.x con la configuración actual de `SafeAuthorBio` sobre el HTML real de la biografía:

- `data-list` **se conserva**. DOMPurify aplica `ALLOW_DATA_ATTR: true` por defecto y esa rama de `_isValidAttribute` se evalúa antes que `ALLOWED_ATTR`, así que cualquier `data-*` pasa aunque no esté listado. (Por el mismo motivo, la entrada `'data-*'` del `ALLOWED_TAGS` por defecto de `SafeHTML` es decorativa: `ALLOWED_ATTR` no admite comodines.)
- `<span class="ql-ui" contenteditable="false"></span>` **ya se elimina**, porque `span` no está en `ALLOWED_TAGS` y su contenido es vacío.

La salida saneada es idéntica antes y después de tocar la configuración. Se fija de todos modos el contrato de forma explícita (ver D4), pero como blindaje, no como corrección.

Restricciones del proyecto: minimalismo extremo con TailwindCSS, tema claro únicamente, todos los textos en es-ES, JavaScript sin TypeScript.

## Goals / Non-Goals

**Goals:**

- Ficha de artista de dos columnas en escritorio con la imagen a tamaño protagonista y persistente durante el scroll del texto.
- Panel acotado en altura: nunca sobrepasa el viewport, con cabecera y barra de acciones fijas y scroll únicamente en el cuerpo.
- Maqueta apilada y usable en móvil, con "Cerrar" siempre accesible.
- Renderizado fiel de listas de viñetas y numeradas, párrafos, negritas, cursivas, subrayados y enlaces en la biografía.
- Corrección aplicada también a `/seller/profile` y `/admin/authors/[id]`, que renderizan la biografía con el mismo componente.
- Contrato de props del modal intacto: cero cambios en las ocho vistas consumidoras.
- Encuadre correcto de la fotografía en cualquier tamaño de pantalla, mediante una segunda imagen apaisada por artista y la opción de no mostrar ninguna en pantallas pequeñas.

**Non-Goals:**

- Instalar `@tailwindcss/typography` (decisión del usuario: CSS propio).
- Añadir CTA o enlaces de navegación en la ficha (decisión del usuario: sólo "Cerrar").
- Variables de entorno nuevas.
- Cambiar el editor Quill del panel de administración o normalizar el HTML almacenado.
- Añadir campos nuevos al perfil del artista (redes sociales, web, disciplina…).
- Dark mode.

## Decisions

### D1 — Maqueta: dos columnas con `flex`, imagen a altura completa, cuerpo con scroll propio

`DialogPanel` pasa a `w-full max-w-4xl overflow-hidden rounded-2xl` con `flex flex-col md:flex-row` (la altura máxima vive en `.author-card-panel`, ver D2). La columna de imagen es `md:w-2/5` con `Image fill object-cover`; la de contenido es `md:w-3/5 flex flex-col min-h-0` con tres bandas: cabecera fija, cuerpo `flex-1 overflow-y-auto`, barra de acciones fija.

`min-h-0` en la columna de contenido es la pieza crítica: sin ella, el hijo con `overflow-y-auto` no puede encogerse por debajo de su contenido y el scroll se propaga al panel — exactamente el defecto original.

**Se probó primero con `grid` (`md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]`) y falló.** Las filas `auto` de un grid se dimensionan según su contenido y **no** son comprimidas por el `max-height` del contenedor: con una biografía larga la fila medía 855 px dentro de un panel de 778 px, el cuerpo quedaba con `scrollHeight === clientHeight` (no scrollable) y la barra de acciones se salía del panel, recortada por `overflow-hidden` — el botón "Cerrar" quedaba inaccesible. Los ítems flex, en cambio, se estiran a la altura ya acotada del contenedor, que es justo lo que activa el scroller interno. Verificado en navegador: `canScroll: true`, botón dentro del panel.

En móvil (`< md`) la columna se apila arriba como banda `h-[30vh] max-h-64`, garantizando que el nombre y el inicio de la biografía queden a la vista al abrir. Qué imagen ocupa esa banda —y si se muestra siquiera— se decide en D7.

*Alternativas consideradas:*
- **`position: sticky` sobre la imagen dentro de un panel con scroll global.** Más simple, pero el panel seguiría creciendo con el texto y `sticky` es frágil dentro de `overflow-hidden`; además el botón "Cerrar" quedaría al final del scroll. Descartado.
- **Modal a pantalla completa tipo *drawer*.** Rompe con el resto de diálogos de la aplicación (carrito, pujas, acceso a eventos) y resulta invasivo para una ficha informativa. Descartado.
- **Imagen a la derecha.** Se descarta porque en el apilado móvil la imagen debe ir arriba, y mantener imagen-primero en ambos ejes hace que el orden del DOM coincida con el orden visual (mejor lectura por lector de pantalla, sin `order-*`).

### D2 — Altura por viewport en lugar de altura fija

`max-h-[90vh]` en el panel, con el cuerpo tomando el resto tras cabecera y barra de acciones vía `flex-1`. No se fijan alturas absolutas en píxeles: con biografías cortas el panel se ajusta al contenido y no aparece barra de scroll; con biografías largas el tope lo pone el viewport.

En móvil se usa `max-h-[88dvh]`: `dvh` descuenta las barras dinámicas del navegador en iOS/Android, donde `vh` deja el borde inferior del panel — y por tanto el botón "Cerrar" — bajo la barra del navegador. Para motores sin `dvh` se declara `vh` como reserva.

**La reserva va en `@supports`, no en dos declaraciones seguidas.** El primer intento (`max-height: 88vh; max-height: 88dvh;` en la misma regla) no sobrevive: el optimizador CSS del build deduplica propiedades repetidas y conserva sólo la última, de modo que el `vh` desaparecía del bundle servido. Con `@supports (max-height: 1dvh)` las dos declaraciones quedan en contextos distintos y ambas llegan al CSS final — verificado sobre el fichero servido por el dev server.

Por el mismo motivo la altura no se expresa con clases Tailwind (`max-h-[88vh] max-h-[88dvh]`): el orden de las utilidades en el atributo `class` no determina el orden de cascada, así que no puede construirse una reserva por esa vía.

### D3 — Estilos de la biografía: clase `.author-bio` en `globals.css`

Se añade en `client/app/globals.css` un bloque acotado a `.author-bio` que restituye lo que borra el preflight, con selectores de descendencia (`.author-bio p`, `.author-bio ul`, `.author-bio li`, …). Al ir dentro de `@layer components`, las utilidades de Tailwind que se apliquen en el mismo elemento siguen ganando por orden de capas.

La regla clave para Quill 2 no es la etiqueta sino el atributo:

```css
.author-bio ol { list-style: none; }               /* neutraliza el ol contenedor */
.author-bio li[data-list="bullet"] { list-style-type: disc; }
.author-bio li[data-list="ordered"] { list-style-type: decimal; }
.author-bio ul li:not([data-list]) { list-style-type: disc; }
.author-bio ol li:not([data-list]) { list-style-type: decimal; }
```

Para que la numeración sea correlativa con `list-style: none` en el `ol` padre, los `li[data-list="ordered"]` recuperan el contador con `counter-increment`/`::marker` o, más simple, restituyendo `list-style-type: decimal` en el `li` — que es lo que hace la regla anterior, ya que `list-style-type` es heredable por elemento y el contador del `ol` sigue vivo.

*Alternativas consideradas:*
- **Instalar `@tailwindcss/typography`.** Es la opción canónica, pero añade dependencia y ~30 KB de CSS y **no resuelve por sí sola** el caso `<ol><li data-list="bullet">`: `prose` estilaría la lista como numerada. Habría que escribir igualmente reglas para `data-list`. Descartada por el usuario.
- **Normalizar el HTML en el guardado (convertir `<ol data-list="bullet">` en `<ul>`).** Corrige el origen pero exige migrar las biografías ya almacenadas y tocar el flujo de administración; además Quill volvería a emitir su formato en la siguiente edición si no se intercepta cada guardado. Descartada por relación coste/beneficio.
- **Estilos en línea dentro del componente vía `<style>`.** Es el patrón de `QuillEditor.js`, pero aquí los estilos deben compartirse con `/seller/profile` y `/admin/authors/[id]`; `globals.css` evita triplicarlos.

### D4 — `SafeAuthorBio` fija explícitamente el contrato del que dependen los estilos

Los estilos de D3 dependen de que `data-list` llegue al DOM y de que el `span.ql-ui` no introduzca ruido. Hoy ambas cosas se cumplen **por comportamiento por defecto de DOMPurify**, no por configuración: `ALLOW_DATA_ATTR: true` deja pasar cualquier `data-*`, y `span` cae por no estar en `ALLOWED_TAGS`. Es una dependencia implícita y frágil — basta con que alguien endurezca la configuración con `ALLOW_DATA_ATTR: false` para que todas las viñetas pasen a numerarse, sin ningún error visible.

Se hace explícita: `data-list` en `ALLOWED_ATTR` y `FORBID_TAGS: ['span']`. **No cambia la salida** (verificado: idéntica antes y después), sólo la ancla.

`data-list` es un atributo de datos inerte: no ejecuta código ni carga recursos. El conjunto de etiquetas permitidas (`p`, `br`, `strong`, `b`, `em`, `i`, `u`, `a`, `ul`, `ol`, `li`) no se toca, así que la superficie de ataque no varía.

**Corrección adicional real:** `SafeHTML` memoriza el saneado con `useMemo([html, config])` y `config` llega como objeto literal, recreado en cada render, por lo que la memoización nunca acierta. Se extrae la configuración a una constante de módulo (`AUTHOR_BIO_CONFIG`), lo que hace efectiva la memoización sin alterar el comportamiento.

### D5 — Iniciales como marcador cuando no hay `profile_img`

Derivadas de `full_name` (primera letra de las dos primeras palabras, en mayúsculas), sobre fondo `bg-gray-100` con tipografía grande y `text-gray-400`. Se conserva la maqueta de dos columnas en lugar de colapsar a una sola: así la ficha mantiene una silueta constante entre artistas con y sin foto.

### D7 — Dos imágenes por artista en lugar de un encuadre universal

**El problema.** La columna de imagen toma su proporción del layout, no de la fotografía, y en los dos extremos es brutal:

| Contexto | Proporción del contenedor | Efecto sobre la imagen |
|---|---|---|
| Escritorio, columna 358×778 | 0,46 : 1 | Una apaisada 3:2 pierde ~55 % de su ancho |
| Por debajo de `md`, panel hasta 768 px de ancho y banda de `min(30vh, 256px)` | hasta 3,8 : 1 | Un retrato 2:3 pierde ~75 % de su alto — la cara partida |

Como el contenedor se estira en un eje y la imagen se recorta en el contrario, **ninguna elección de `object-position` arregla los dos casos a la vez**. Una sola fotografía no puede llenar bien dos contenedores de proporciones opuestas: es una imposibilidad geométrica, no un ajuste de CSS pendiente.

**La decisión.** En vez de buscar un encuadre que sirva para todo, se le da al artista **una segunda fotografía**. `profile_img` se reserva a `md+` y `profile_img_mobile` —de orientación apaisada— cubre lo que hay por debajo. El recorte deja de ser un problema porque cada imagen se prepara para la proporción en la que se va a mostrar; el operador controla el encuadre, que es quien sabe dónde está el sujeto.

Se añade además `hide_profile_img_mobile`: hay fotografías que sencillamente no funcionan en una banda apaisada, y para esas la mejor opción es no mostrar ninguna imagen en pantallas pequeñas y abrir la ficha directamente por el nombre.

Ambas columnas viven en `users`, junto a `profile_img`, siguiendo el patrón del repositorio: se declaran en el `CREATE TABLE` **y** se añaden con `safeAlter` para las bases de datos existentes. (`CLAUDE.md` dice "nunca añadir bloques `ALTER TABLE`"; el código hace exactamente esto para toda adición de columna desde hace muchos cambios — se sigue el código, que es la convención real, pero conviene alinear el documento.)

**Compatibilidad.** `profile_img_mobile` NULL cae de vuelta a `profile_img`, y `hide_profile_img_mobile` es 0 por defecto. Los artistas existentes se comportan exactamente como antes sin tocar un solo registro — verificado contra la API tras la migración.

*Alternativas consideradas y descartadas (las tres se probaron o se ofrecieron):*
- **Marco de proporción fija 4:5** sobre el fondo de la ficha. Funcionaba —recorte acotado al ~33 % y desacoplado del texto— pero el usuario lo descartó por estética: perdía la imagen a sangre que motivaba el rediseño.
- **Fondo con la propia imagen muy desenfocada** tras ese marco. Implementado y descartado también por estética.
- **`object-contain`.** Nunca recorta, pero deja bandas vacías cuya proporción varía con el texto.

**Coste asumido.** El operador tiene que preparar y subir dos ficheros por artista. Es trabajo manual recurrente, pero es exactamente lo que compra el control del encuadre: ninguna heurística automática sabe dónde está la cara sin detección facial, desproporcionada para este caso.

### D8 — La variante se elige por CSS, no por un hook de media query

Ambas imágenes se renderizan y se muestran/ocultan con `hidden md:block` / `md:hidden`. La alternativa —un hook de media query que renderice sólo una— evitaría la petición sobrante, pero introduce riesgo de desajuste de hidratación y de un parpadeo de la variante incorrecta al abrir la ficha.

**Coste asumido:** el navegador descarga los dos ficheros cuando el artista tiene ambos (una imagen en `display:none` se descarga igualmente). Es aceptable para un modal que se abre bajo demanda, y sólo afecta a los artistas con las dos variantes. Los `sizes` se ajustan a lo que ocupa cada una para no pedir de más, y cuando no hay variante móvil sólo se renderiza un elemento.

### D9 — Un solo endpoint de subida parametrizado por columna

Las dos variantes comparten bucket/directorio (`authors/`) y convención de nombre (`author-<sufijo><ext>`), así que `getAuthorImageUrl` resuelve cualquiera de ellas sin saber de qué columna viene, y no hace falta tocar el cliente de imágenes.

La lógica de subida (validar, borrar el fichero anterior, escribir en S3 o disco, actualizar la fila) se extrae a `storeAuthorAvatar(req, res, column)`, invocada por `upload-avatar` y `upload-avatar-mobile`. Evita duplicar ~60 líneas. **El nombre de columna procede siempre de un literal en el punto de llamada, nunca del cuerpo de la petición**, de modo que la interpolación en el SQL no puede dirigirse a otra columna.

El borrado del fichero previo consulta y limpia **sólo la columna que se está escribiendo**, para que sustituir una variante no elimine la otra.

### D6 — Textos es-ES en `client/lib/constants.js`

El literal de "biografía no disponible" y la etiqueta de sección ("BIOGRAFÍA") se declaran como constantes en `client/lib/constants.js`, siguiendo el patrón ya usado por `EDITION_COPY`, en vez de incrustarse en el JSX.

## Risks / Trade-offs

- **[Regresión visual en las ocho vistas consumidoras]** → El rediseño afecta a galería, tienda, páginas de autor, detalles de producto, sorteos y eventos live. Mitigación: el contrato de props no cambia, y la verificación manual recorre al menos un punto de entrada de cada familia (galería, tienda, sorteo, live) además de escritorio y móvil.

- **[Imágenes de perfil de baja resolución se ven pixeladas al ampliarse]** → La foto pasa de 96 px a ocupar ~350 px de ancho. Mitigación: `sizes` ajustado a lo que ocupa cada variante para no descargar de más. Es una consecuencia asumida del requisito "imagen bastante más grande"; si alguna foto concreta queda pobre, la solución es subir un original mejor, no reducir la maqueta.

- **[Artistas sin imagen para móvil siguen expuestos al recorte agresivo]** → El fallback a `profile_img` por debajo de `md` reproduce exactamente el comportamiento anterior, recorte incluido. Es deliberado: preserva la compatibilidad y no altera a nadie sin intervención. Mitigación: subir la variante apaisada o marcar la casilla de ocultar.

- **[Carga de trabajo del operador]** → Cada artista pasa a necesitar dos ficheros preparados a mano. Es el precio de controlar el encuadre; el fallback evita que sea obligatorio.

- **[Los estilos `.author-bio` se filtran a otros contenidos]** → Todas las reglas van acotadas por la clase; no se estilan etiquetas desnudas. Riesgo bajo y contenido.

- **[`dvh` no soportado en motores antiguos]** → Se declara `vh` antes que `dvh` en la cascada, de modo que un navegador que no entienda `dvh` conserva el valor previo.

- **[Biografías con HTML heredado de otras fuentes]** → Puede existir contenido antiguo con `<ul>` plano sin `data-list`. Las reglas `:not([data-list])` cubren ese caso, de modo que ambos formatos conviven.

- **[No se corrige el origen del HTML]** → Quill seguirá emitiendo `<ol data-list="bullet">`. Se asume conscientemente: la capa de presentación absorbe la peculiaridad del editor y el contenido ya almacenado sigue siendo válido sin migración.

## Migration Plan

Dos columnas nuevas en `users`, añadidas con `safeAlter` al arrancar la API: `profile_img_mobile` (NULL) y `hide_profile_img_mobile` (0). Ambos valores por defecto reproducen el comportamiento previo, así que no hay backfill ni ventana de incompatibilidad. Reversión: revertir el commit; las columnas quedan huérfanas pero inertes.

El resto es frontend, sin migración de datos. Despliegue con el ciclo habitual de build del cliente. Reversión: revertir el commit — no hay estado persistido que dependa de este cambio.

## Open Questions

Ninguna. Las tres decisiones abiertas (alcance del componente, presencia de CTA y estrategia de corrección de listas) fueron resueltas por el usuario antes de redactar esta propuesta.
