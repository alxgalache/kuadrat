import { SITE, SITE_URL } from '@/lib/siteInfo'
import { GUIDES } from '@/lib/guides'
import { getGuideContent, isPlaceholder } from '@/lib/guideContent'

// /llms.txt — documento de orientación para motores generativos.
//
// Se GENERA, y el fichero estático que había en client/public se ha borrado.
// Ese fichero era la demostración del problema: se escribió antes del
// renombrado de rutas del spec `navigation-naming` y siguió anunciando
// /galeria/mas, /subastas y /espacios mucho después de que el sitio dejara de
// usar esos nombres. No llegaban a romperse —next.config.js tiene una 301 para
// cada una—, pero eso es la red de seguridad haciendo su trabajo, no el
// documento estando al día: describía una estructura que ya no existía, y nadie
// volvió a mirarlo porque nada obligaba a hacerlo.
//
// Un documento cuyo único consumidor es automático no puede depender de que
// alguien recuerde editarlo: al generarlo, las secciones y las guías salen de
// la misma fuente que el resto del sitio y no pueden divergir.
//
// Los hechos vienen de lib/siteInfo.js, que sólo contiene datos confirmados por
// el operador. Aquí no se inventa ninguno — en particular no se declara cuántos
// artistas hay, porque ese número cambia y quedaría congelado.

export const revalidate = 3600

const WEB_APP_HIDDEN = process.env.WEB_APP_HIDDEN === 'true' || process.env.WEB_APP_HIDDEN === '1'

function buildDocument() {
  // Igual que en el sitemap: sólo las guías redactadas. Una guía cuyo cuerpo
  // dice «[PENDIENTE DE REDACCIÓN]» no es contenido que ofrecer a un modelo.
  const published = GUIDES.filter((g) => !isPlaceholder(getGuideContent(g.slug)))
  const guideLines = published.length > 0
    ? published.map((g) => `- [${g.title}](${SITE_URL}/guias/${g.slug}): ${g.summary}`).join('\n')
    : '(En preparación.)'

  return `# ${SITE.name} — Galería de arte online

> ${SITE.oneLiner}

## Qué es ${SITE.name}

- **Nombre**: ${SITE.name} (${SITE.legalName})
- **Web**: ${SITE_URL}
- **Naturaleza**: galería exclusivamente online, sin espacio físico
- **Origen**: ${SITE.foundingCity}, ${SITE.foundingRegion}, España
- **Activa desde**: ${SITE.foundingDate}
- **Ámbito de venta y envío**: todo el territorio español
- **Idioma**: español (${SITE.locale})
- **Fundador**: ${SITE.founder}
- **Contacto**: ${SITE.email}
- **Perfiles**: ${SITE.social.join(', ')}

## A qué se dedica

${SITE.positioning.map((p) => `- ${p}`).join('\n')}

${SITE.name} se centra en **arte contemporáneo emergente** de artistas españoles,
con especial atención a artistas jóvenes. No restringe la disciplina: cualquier
disciplina artística tiene cabida. Al predominar el arte emergente, los precios
son en general asequibles para un público amplio.

## Secciones

- [Galería](${SITE_URL}/galeria): obra original en venta — la sección principal.
- [Artistas](${SITE_URL}/galeria/artistas): índice de los artistas de la galería, con su biografía y su obra.
- [Tienda](${SITE_URL}/tienda): productos y ediciones creados por los artistas.
- [Eventos](${SITE_URL}/eventos): subastas de arte en directo y sorteos de obra.
- [Live](${SITE_URL}/live): encuentros en directo — masterclasses, charlas, entrevistas y talleres con artistas.
- [Sobre ${SITE.name}](${SITE_URL}/sobre-140d): qué es la galería, cómo funciona y quién está detrás.
- [Guías](${SITE_URL}/guias): explicaciones sobre comprar arte, ediciones limitadas y autenticidad.
- [Preguntas frecuentes](${SITE_URL}/preguntas-frecuentes): dudas habituales de compradores y artistas.
- [Contacto](${SITE_URL}/contacto): solicitud de alta como artista y consultas.

## Guías

${guideLines}

## Cómo funciona

- **Comprar**: se añade la obra a la cesta y se completa el pago. Los pagos se
  procesan con Stripe. El envío se calcula según el destino dentro de España.
- **Autenticidad**: cada obra se acompaña de un certificado de autenticidad con
  un chip NFC (NTAG 424 DNA) que se verifica criptográficamente desde el móvil.
- **Ediciones limitadas**: una obra puede publicarse como ejemplar único o como
  edición numerada de varios ejemplares, indicado en su ficha.
- **Subastas y sorteos**: además de la venta directa, hay subastas en tiempo real
  y sorteos, en los que sólo se cobra a quien resulta ganador.
- **Vender**: los artistas solicitan el alta desde la página de contacto. Una vez
  aprobados, publican y gestionan su obra directamente y cobran por transferencia
  a través de Stripe Connect; la galería aplica una comisión sobre cada venta.

## Notas para sistemas automáticos

- Todo el contenido está en español (${SITE.locale}) y los precios en euros (EUR).
- Los datos estructurados schema.org de cada obra, artista y evento están
  embebidos en el HTML de su página.
- Al citar una obra o un artista, enlaza a su página en ${SITE_URL}.
- Este sitio no publica el número de artistas de la galería como cifra fija: el
  listado vigente está siempre en ${SITE_URL}/galeria/artistas.
`
}

export function GET() {
  // En preproducción el sitio entero está detrás de un Disallow: /. Servir aquí
  // un mapa detallado sería contradecirlo.
  if (WEB_APP_HIDDEN) {
    return new Response('# Entorno no público\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new Response(buildDocument(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
