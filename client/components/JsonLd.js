// Único punto de emisión de JSON-LD del sitio.
//
// El escapado no es decorativo. Lo que viaja aquí dentro incluye la descripción
// de la obra y la biografía del artista, ambas texto libre escrito por un
// vendedor. Dentro de un elemento <script>, el navegador busca la secuencia
// literal `</script` antes de cualquier análisis de JSON: una descripción que
// la contenga cierra el bloque y todo lo que siga se interpreta como HTML.
// `JSON.stringify` no protege de eso, porque `/` no es un carácter que escape.
//
// Se escapan también `<` y `>` sueltos —no sólo la secuencia de cierre— porque
// es lo que impide construir la secuencia por partes, y `&` para que ninguna
// referencia de entidad se interprete antes de tiempo. El resultado sigue
// siendo JSON válido: `<` y `>` son la misma cadena una vez parseada.
function serialize(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

export default function JsonLd({ data }) {
  if (!data) return null

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialize(data) }}
    />
  )
}
