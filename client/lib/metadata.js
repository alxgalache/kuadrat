// Constructor único de los metadatos sociales (Open Graph y Twitter Card).
//
// EL PORQUÉ, que no es evidente y costó 17 rutas: en Next.js los campos de
// metadatos que son OBJETOS —`openGraph`, `twitter`— **no se fusionan con el
// layout padre: se sustituyen enteros**. Está en el resolvedor del propio
// framework (`next/dist/lib/metadata/resolve-metadata.js`):
//
//     case 'openGraph': {
//         newResolvedMetadata.openGraph = convertUrlsToStrings(await resolveOpenGraph(...))
//         break;   //  ^^^ asignación, no merge
//     }
//
// Consecuencia: bastaba con que una ruta declarase `openGraph: { title,
// description }` para PERDER el `siteName`, el `locale`, la `url`, el `type` y
// la imagen por defecto que la raíz declaraba. Y se perdían en silencio: la
// página sigue renderizando, el `<head>` sigue teniendo etiquetas, y sólo un
// validador externo o alguien compartiendo el enlace lo nota. Auditadas en
// producción, `/galeria`, `/tienda` y `/live` se compartían **sin ninguna
// imagen**.
//
// La prueba cruzada estaba en el mismo HTML: en `/galeria` sí aparecían los
// `twitter:*` de la raíz, porque `/galeria` no declaraba `twitter`. Mismo
// mecanismo, resultado opuesto.
//
// Por eso esto es UNA función y no 17 literales corregidos a mano: un literal
// repetido diecisiete veces vuelve a divergir en cuanto se añade la ruta
// dieciocho, y el síntoma —una imagen que no sale al compartir— no se parece
// en nada a la causa. Mismo criterio que `zoneResolver.js` con las zonas de
// envío.
//
// El contrato que esto hace cumplir es el de la capacidad `seo-metadata-coverage`:
// «Every indexable route SHALL declare Open Graph title, description, URL and
// type, and a Twitter card» y «WHEN a route has no image of its own THEN it
// SHALL inherit the site's default social image».

// SITE_URL desde `siteInfo` y no desde `serverApi`: este módulo lo importan
// también los layouts, y `siteInfo` es datos puros —sin cliente de API detrás—
// además de ser la fuente única de los hechos publicados sobre la galería.
import { SITE_URL } from './siteInfo'

export const SITE_NAME = '140d'
export const OG_LOCALE = 'es_ES'

// La tarjeta genérica del sitio. Es el `og:image` de toda ruta que no tenga una
// imagen propia — nunca se deja vacío, porque una publicación sin imagen pierde
// una fracción grande de las visitas frente a una con ella.
export const DEFAULT_OG_IMAGE = {
  url: `${SITE_URL}/brand/og-image.jpg`,
  width: 1200,
  height: 630,
  alt: '140d - Galería de Arte Online',
}

// Los originales del CDN pesan demasiado para compartirse: la obra medida en
// producción ocupaba 2.075.712 B y **WhatsApp descarta la vista previa por
// encima de 500 KB**, así que el enlace salía sin miniatura. Se sirven por el
// optimizador de imágenes de Next, que ya usa todo el escaparate.
//
// Tres detalles medidos contra producción, ninguno de ellos obvio:
//
//   · w=1920 NO amplía: el optimizador recorta al ancho del original. La obra
//     sale a sus 1704 px nativos (218.643 B) y el retrato del artista a sus
//     787 px (44.406 B). Por eso este ancho y no 1200: `w=1200` devuelve **400**
//     —no está en `deviceSizes`— y `w=1080` habría arreglado WhatsApp
//     ROMPIENDO LinkedIn en las fichas de obra, que hoy cumplen su mínimo de
//     1200 px. Con 1920 no hace falta tocar `next.config.js` ni gastar una
//     variante más de CPU en cada imagen del sitio.
//   · q=75 es el único valor admitido (Next 16 restringe `q` a su lista
//     `qualities`, cuyo valor por defecto es `[75]`); `q=65` responde 400.
//   · Con `Accept: */*` —lo que envía un scraper— el optimizador devuelve
//     **JPEG**, no WebP. Los navegadores, que sí anuncian WebP, lo siguen
//     recibiendo. Es decir: el formato universal para quien lo necesita, sin
//     penalizar a nadie.
const SOCIAL_IMAGE_WIDTH = 1920
const SOCIAL_IMAGE_QUALITY = 75

// El optimizador SÓLO acepta los hosts de `images.remotePatterns`; con
// cualquier otro responde 400 y la imagen social desaparecería del todo. Dos
// casos reales lo exigen: `events.cover_image_url` es una columna TEXT libre que
// puede contener una URL arbitraria, y en desarrollo las imágenes se sirven por
// `localhost:3001`, que no está —ni debe estar— en los remotePatterns. Ante un
// host desconocido se devuelve la URL tal cual: pesada, pero funcional.
const OPTIMIZABLE_HOSTS = new Set(['cdn.140d.art', 'api.140d.art', 'api.pre.140d.art'])

export function socialImageUrl(url) {
  if (!url) return null
  let hostname
  try {
    hostname = new URL(url).hostname
  } catch {
    return url
  }
  if (!OPTIMIZABLE_HOSTS.has(hostname)) return url
  return `${SITE_URL}/_next/image?url=${encodeURIComponent(url)}&w=${SOCIAL_IMAGE_WIDTH}&q=${SOCIAL_IMAGE_QUALITY}`
}

function absoluteUrl(path) {
  if (!path) return SITE_URL
  if (path.startsWith('http')) return path
  return `${SITE_URL}${path}`
}

/**
 * Bloque `openGraph` COMPLETO. Siempre lleva `type`, `locale`, `siteName`,
 * `url`, título, descripción e imagen — nunca un subconjunto, porque un
 * subconjunto es exactamente lo que borra al padre.
 *
 * `type` se deja en 'website' salvo que la ruta diga otra cosa. NO admite
 * 'product': Next valida `openGraph.type` contra su lista cerrada (website,
 * article, book, profile, music.*, video.*) y lanza «Invalid OpenGraph type» en
 * tiempo de render, que es un 500 y no un aviso. La naturaleza de producto la
 * expresa el JSON-LD, que es lo que leen buscadores y motores generativos.
 */
export function buildOpenGraph({ title, description, path, type = 'website', images }) {
  return {
    type,
    locale: OG_LOCALE,
    siteName: SITE_NAME,
    url: absoluteUrl(path),
    title,
    description,
    images: images && images.length > 0 ? images : [DEFAULT_OG_IMAGE],
  }
}

/**
 * Bloque `twitter` COMPLETO, por el mismo motivo que el anterior. Sin él, una
 * ruta que declaraba `openGraph` pero no `twitter` heredaba el `twitter` de la
 * raíz ENTERO, y acababa anunciando en la misma página `og:title` propio y
 * `twitter:title` «140d - Galería de arte online». Verificado en producción en
 * `/galeria`, `/tienda` y `/live`.
 *
 * `card` por defecto es 'summary_large_image' porque la tarjeta del sitio y las
 * fichas de obra son apaisadas. Las fichas de artista pasan 'summary' cuando
 * usan el retrato, que es vertical: en una tarjeta grande X lo recortaría por el
 * centro y decapitaría a la persona.
 */
export function buildTwitter({ title, description, images, card = 'summary_large_image' }) {
  return {
    card,
    title,
    description,
    images: images && images.length > 0 ? images : [DEFAULT_OG_IMAGE.url],
  }
}
