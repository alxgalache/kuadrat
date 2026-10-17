---
paths:
  - "client/lib/eventImages.js"
  - "api/utils/eventCoverImage.js"
  - "api/tests/{eventDetailImage,eventCoverImage}.test.js"
  - "client/app/live/**"
  - "client/app/admin/espacios/**"
---

## Imágenes de un evento: la del listado y la de la ficha

Un evento tiene dos URLs de imagen, las dos opcionales e independientes, que el admin rellena en el formulario de creación y en el de edición. Pueden ser la misma URL, dos distintas o una sola.

- **`events.cover_image_url`, imagen del listado.** Se pinta en la tarjeta de `/live` como una franja apaisada a la derecha (2/5 del ancho, con degradado desde la izquierda, oculta en móvil). El nombre de la columna se conserva porque es la que ya existía.
- **`events.detail_image_url`, imagen de la ficha.** Se pinta en la ficha `/live/<slug>`, en un cuadrado (`aspect-square`).

Hay dos porque las dos vistas tienen proporciones distintas, y una sola imagen siempre quedaba mal recortada en una de las dos.

* **Si una está vacía, se usa la otra, en las dos direcciones.** Por eso no hubo relleno al añadir la columna: los eventos anteriores se siguen viendo igual en las dos vistas. Lo decide un solo módulo por lado, y ninguna superficie nueva lee las columnas directamente:
  * en el cliente, `eventListImageUrl` y `eventDetailImageUrl` (`client/lib/eventImages.js`);
  * en la API, `eventCoverImageUrl` (`api/utils/eventCoverImage.js`), con el criterio de `eventListImageUrl`.
* **Las demás superficies usan la del listado:**
  * los emails (el anuncio y el recordatorio de 48 h);
  * la vista previa social, con una sola `og:image` (`.claude/rules/frontend/og-image.md`). Es la apaisada, la más cercana al 1,91:1.

  Solo los datos estructurados de la ficha (JSON-LD `Event`) llevan las dos, sin repetir, porque Google pide varias proporciones para los resultados enriquecidos.
* **El camino de escritura cruza cuatro sitios**, como los flags de host: los dos esquemas Zod, el `INSERT` de `eventService.createEvent` y los `allowedFields` de `updateEvent`. Si falta uno, el formulario guarda, la API responde 200 y no se almacena nada. `api/tests/eventDetailImage.test.js` lo comprueba y, si falla, dice qué sitio falta. `listScheduledEvents` también selecciona la columna, porque el recordatorio la necesita para su respaldo.
* **Punto ciego conocido:** `client/` no tiene runner de tests. Los formularios y las dos vistas se verifican a mano.
