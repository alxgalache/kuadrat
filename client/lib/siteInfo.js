// Identidad de 140d: la fuente única de los hechos que se publican sobre la
// galería. La usan el JSON-LD de la raíz, /llms.txt, la página de entidad y las
// guías.
//
// Todo lo que hay aquí está CONFIRMADO por el operador (21/08/2026). La regla,
// y es la que da valor al fichero: si un dato no está en esta lista, no se
// publica. Un motor generativo trata lo que lee como autoritativo, así que un
// año de fundación aproximado o un número de artistas «de memoria» no es una
// imprecisión — es una afirmación falsa servida en el formato que más peso
// tiene.
//
// Ver openspec/changes/seo-geo-optimization/design.md § «Datos confirmados».

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://140d.art'

export const SITE = {
  name: '140d',
  legalName: '140d Galería de Arte',
  url: SITE_URL,
  email: 'info@140d.art',
  locale: 'es-ES',
  language: 'es',

  // Origen y ámbito. `foundingLocation` es de dónde nace; `areaServed` es dónde
  // se vende HOY. No se anuncia la expansión europea como disponible: prometer
  // un envío que no existe es la clase de dato que un asistente repite a un
  // comprador y que acaba en una incidencia.
  foundingDate: '2026',
  foundingCity: 'Salamanca',
  foundingRegion: 'Castilla y León',
  country: 'ES',
  areaServed: 'ES',

  founder: 'Alejandro Galache',

  social: [
    'https://www.facebook.com/140dart',
    'https://www.instagram.com/140dart',
    'https://x.com/140dart',
  ],

  // Frase autocontenida: tiene que poder extraerse sola y seguir respondiendo
  // «¿qué es 140d?» sin el contexto de alrededor. Es el formato que citan los
  // motores de respuesta.
  oneLiner:
    '140d es una galería de arte online española, con sede en Salamanca y activa desde 2026, ' +
    'especializada en arte contemporáneo emergente: vende obra original de artistas jóvenes ' +
    'españoles y organiza encuentros en directo que acercan al público el proceso de creación.',

  // Los dos ejes, en orden de prioridad. El segundo es el que diferencia a 140d
  // de un catálogo con carrito y el que da sentido a /live y /eventos.
  positioning: [
    'Venta directa de obra original de artistas contemporáneos emergentes y jóvenes en España.',
    'Difusión y participación: streams, charlas, directos, talleres y cursos que hacen al público ' +
      'partícipe del proceso creativo y le permiten acompañar al artista.',
  ],

  knowsAbout: [
    'Arte contemporáneo',
    'Arte emergente',
    'Artistas jóvenes',
    'Compra de arte original',
    'Ediciones limitadas',
    'Certificados de autenticidad',
    'Subastas de arte online',
    'Eventos culturales en directo',
  ],
}

// El número de artistas NO vive aquí a propósito. Hoy son cuatro y se prevén
// entre 20 y 30: escrito a mano envejece en semanas y, además, describe a la
// baja una galería en crecimiento. El índice de artistas los enumera desde la
// base de datos, que es la única forma de ese dato que no puede quedar obsoleta.
