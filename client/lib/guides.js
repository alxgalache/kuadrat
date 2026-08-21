// Catálogo de guías de /guias.
//
// Fuente ÚNICA: de aquí salen las rutas, el índice, el sitemap y la sección de
// guías de /llms.txt. Añadir una guía es añadir una entrada aquí y crear su
// fichero de contenido en app/guias/<slug>/page.js; olvidar cualquiera de las
// dos cosas se nota de inmediato (la ruta da 404, o la guía existe y no la
// enlaza nadie), que es justo lo que no pasaba con el llms.txt estático.
//
// `publishedAt` alimenta `datePublished` del Article. Se pone a mano y sólo se
// cambia si la guía se reescribe de arriba abajo: una fecha que se moviera sola
// en cada despliegue haría que todas las guías parecieran recién publicadas
// siempre, que es exactamente la señal que un buscador aprende a ignorar.
//
// `summary` es la respuesta corta a la pregunta del título. Se usa como
// descripción de metadatos, como texto del índice y como resumen en llms.txt,
// así que tiene que sostenerse fuera de contexto: es la frase que un asistente
// puede citar tal cual.

export const GUIDES = [
  {
    slug: 'como-comprar-arte-original-online',
    publishedAt: '2026-08-21',
    title: 'Cómo comprar arte original online',
    question: '¿Cómo se compra una obra de arte original por internet?',
    summary:
      'Qué mirar antes de comprar una obra original por internet: autenticidad, ' +
      'estado, medidas, edición, envío y garantías.',
    keywords: [
      'comprar arte original online',
      'comprar cuadros por internet',
      'galería de arte online España',
    ],
  },
  {
    slug: 'que-es-una-edicion-limitada',
    publishedAt: '2026-08-21',
    title: 'Qué es una edición limitada',
    question: '¿Qué significa que una obra sea de edición limitada?',
    summary:
      'Qué es una edición limitada, en qué se diferencia de una pieza única y ' +
      'de una reproducción, y qué implica el número de ejemplares para su valor.',
    keywords: [
      'edición limitada arte',
      'obra numerada',
      'diferencia edición limitada y original',
    ],
  },
  {
    slug: 'como-se-autentica-una-obra-con-nfc',
    publishedAt: '2026-08-21',
    title: 'Cómo se autentica una obra con NFC',
    question: '¿Cómo se comprueba que una obra de arte es auténtica?',
    summary:
      'Cómo funciona el certificado de autenticidad con chip NFC: qué es, cómo ' +
      'se verifica con el móvil y por qué no se puede copiar.',
    keywords: [
      'certificado de autenticidad arte',
      'autenticar obra de arte',
      'NFC arte autenticidad',
    ],
  },
  {
    slug: 'como-vender-tu-obra-en-una-galeria-online',
    publishedAt: '2026-08-21',
    title: 'Cómo vender tu obra en una galería online',
    question: '¿Cómo puede un artista vender su obra en una galería online?',
    summary:
      'Qué necesita un artista para vender en una galería online: alta, ' +
      'preparación de la obra, precios, comisiones, envíos y cobros.',
    keywords: [
      'vender arte online',
      'galería para artistas emergentes',
      'cómo vender mis cuadros',
    ],
  },
]

export function getGuide(slug) {
  return GUIDES.find((g) => g.slug === slug) || null
}
