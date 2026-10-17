// Imágenes de un evento: una para el listado de /live (`cover_image_url`) y
// otra para la ficha /live/<slug> (`detail_image_url`). Las dos son opcionales
// e independientes, porque la tarjeta del listado es una franja apaisada y la
// ficha un cuadrado: el admin puede poner la misma URL en las dos, dos
// distintas o solo una. Con una sola, cada vista usa la que haya, así que un
// evento anterior al segundo campo se sigue viendo igual en las dos.
//
// Es el único sitio que decide qué imagen pinta cada vista: ninguna superficie
// nueva lee las columnas directamente. Los emails aplican el mismo criterio en
// la API (`api/utils/eventCoverImage.js`).

/** Imagen de la tarjeta del listado, de los emails y de la vista previa social. */
export function eventListImageUrl(event) {
  return event?.cover_image_url || event?.detail_image_url || null
}

/** Imagen de la ficha del evento. */
export function eventDetailImageUrl(event) {
  return event?.detail_image_url || event?.cover_image_url || null
}
