// Cómo se le muestran al comprador las dimensiones de una obra.
//
// `art.dimensions` es TEXT libre escrito por el artista: normalmente
// `alto x ancho x fondo` en centímetros, pero sin ninguna validación que
// garantice esa forma. De esas medidas al comprador se le enseñan sólo las DOS
// primeras —alto y ancho, las que describen la obra colgada en la pared—; el
// fondo es un dato de embalaje que no aporta nada en una ficha ni en un
// certificado, y en obra plana suele ser el grosor del bastidor.
//
// Fuente única a propósito. La regla vivía escrita a mano en la ficha de
// galería y no en la página `/coa`, que llevaba desde su primer commit pintando
// el campo en crudo — la tercera medida no reapareció en el certificado, es que
// nunca se había ido de ahí. Dos plantillas para el mismo dato son dos verdades
// que divergen en silencio.
//
// Ante un texto que NO encaja en el patrón se devuelve tal cual, sin unidad:
// reformatear lo que no se ha entendido es sustituir una medida por otra sin
// que se note. Mismo criterio que `parseDimensions()` en `schema.js`, que ante
// la duda omite la propiedad en lugar de adivinarla.

// La unidad puede venir escrita en el propio campo («8x13x1 cm»). Se recorta
// antes de separar, o quedaría pegada a la última medida y saldría duplicada.
const UNIT_SUFFIX = /\s*(?:cm|cms|centímetros)\.?\s*$/i

// Los datos actuales usan la `x` ASCII. Se aceptan también `×` (U+00D7) y `*`
// porque no cuesta nada y son lo que teclea quien copia de un procesador de
// textos.
const SEPARATOR = /[x×*]/i

const NUMERIC = /^\d+(?:[.,]\d+)?$/

export function formatArtDimensions(raw) {
  if (!raw || typeof raw !== 'string') return null

  const text = raw.trim()
  if (text === '') return null

  const shown = text
    .replace(UNIT_SUFFIX, '')
    .split(SEPARATOR)
    .map((part) => part.trim())
    .slice(0, 2)

  if (shown.length < 2 || !shown.every((part) => NUMERIC.test(part))) return text

  return `${shown.join(' x ')} cm`
}
