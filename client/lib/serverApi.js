// Server-side API fetching utility for generateMetadata and sitemap.
// This file should ONLY be imported in server components and route handlers.

// Dos URLs distintas a propósito, y no son intercambiables:
//
// - API_URL es la que ve el navegador. Es la que tiene que viajar dentro del
//   HTML (imágenes de Open Graph, JSON-LD): un scraper de Twitter o WhatsApp no
//   puede resolver un hostname de la red interna de Docker.
// - DATA_API_URL es la que usa este módulo para *pedir* los datos durante el
//   render. Al salir por la red interna se ahorra el viaje al balanceador y,
//   sobre todo, deja de consumir el rate limit por IP de la API: esas peticiones
//   no llevan la IP del visitante sino la del propio servidor, así que todos los
//   renders caían en una única cubeta de 1000 peticiones / 30 min. Con la caché
//   de datos de 300 s el margen era amplio, pero una avalancha con caché fría
//   la habría agotado y las fichas habrían empezado a mostrar «Obra no
//   encontrada» — un fallo silencioso y difícil de atribuir.
//
// Si INTERNAL_API_URL no está definida se cae a la pública, que es el
// comportamiento anterior.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
const DATA_API_URL = process.env.INTERNAL_API_URL || API_URL
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://140d.art'

export { API_URL, SITE_URL }

export async function fetchArtProduct(idOrSlug) {
  try {
    const res = await fetch(`${DATA_API_URL}/art/${encodeURIComponent(idOrSlug)}`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.product || null
  } catch {
    return null
  }
}

export async function fetchOthersProduct(idOrSlug) {
  try {
    const res = await fetch(`${DATA_API_URL}/others/${encodeURIComponent(idOrSlug)}`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.product || null
  } catch {
    return null
  }
}

// Payload completo de `/events/:slug`: además del evento trae `attendeeCount` y
// `serverNow`. `fetchEvent` se queda con el evento, que es lo que necesitan los
// metadatos; quien necesite el resto usa esta.
//
// Llamar a las dos en el mismo render NO duplica peticiones: Next deduplica los
// fetch idénticos dentro de un render.
export async function fetchEventPayload(slug) {
  try {
    const res = await fetch(`${DATA_API_URL}/events/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchEvent(slug) {
  const data = await fetchEventPayload(slug)
  return data?.event || null
}

export async function fetchAuction(id) {
  try {
    const res = await fetch(`${DATA_API_URL}/auctions/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.auction || null
  } catch {
    return null
  }
}

export async function fetchDraw(id) {
  try {
    const res = await fetch(`${DATA_API_URL}/draws/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.draw || null
  } catch {
    return null
  }
}

export async function fetchAuthor(slug) {
  try {
    const res = await fetch(`${DATA_API_URL}/users/authors/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.author || null
  } catch {
    return null
  }
}

// Listado de autores visibles. `category` filtra a los que tienen al menos una
// obra ('art') o un producto ('other') publicado; sin categoría devuelve todos.
// Lo usan el índice de artistas y el sitemap.
export async function fetchAuthors(category = null) {
  try {
    const qs = category ? `?category=${encodeURIComponent(category)}` : ''
    const res = await fetch(`${DATA_API_URL}/users/authors${qs}`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.authors || []
  } catch {
    return []
  }
}

// Obras de un autor, para la ficha de artista.
//
// El límite alto es deliberado: esto alimenta el ItemList de datos
// estructurados, que describe la obra del artista al completo, no una página de
// resultados. El grid visible sigue paginando por su cuenta.
export async function fetchAuthorArtProducts(authorSlug, limit = 100) {
  try {
    const res = await fetch(
      `${DATA_API_URL}/art?author_slug=${encodeURIComponent(authorSlug)}&page=1&limit=${limit}`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.products || []
  } catch {
    return []
  }
}

export async function fetchAuthorOtherProducts(authorSlug, limit = 100) {
  try {
    const res = await fetch(
      `${DATA_API_URL}/others?author_slug=${encodeURIComponent(authorSlug)}&page=1&limit=${limit}`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.products || []
  } catch {
    return []
  }
}

const CDN_BASE_URL = process.env.CDN_BASE_URL || ''

// En desarrollo el optimizador de imágenes de Next descarga el original desde
// el PROPIO servidor Next, y ahí `localhost:3001` no resuelve: dentro de Docker
// la API es `api:3001`. Por eso las imágenes se piden por una ruta del mismo
// origen, `/img-proxy/…`, que `next.config.js` reescribe a INTERNAL_API_URL.
// Es el mismo mecanismo que ya usaba `lib/api.js` en el cliente.
const DEV_IMAGE_PROXY = process.env.NODE_ENV === 'development' && !CDN_BASE_URL

// Imagen de perfil del artista. Vive en un prefijo distinto al de los productos
// (`authors/`) y la sube el panel de administración.
//
// Hay DOS funciones y no una porque los dos usos necesitan cosas incompatibles,
// y mezclarlos fue justo el error:
//
//   · getAuthorImageUrl        → SIEMPRE absoluta. Va dentro del HTML, en las
//     imágenes de Open Graph y en el JSON-LD, y la lee un cliente externo
//     (el rastreador de X, WhatsApp, un buscador). Una ruta relativa o un
//     `/img-proxy/` no significan nada fuera de este servidor.
//   · getAuthorImageDisplayUrl → la que se le pasa a `next/image`. En
//     desarrollo tiene que ser la del proxy del mismo origen; en producción
//     coincide con la absoluta.
//
// Usar la absoluta para pintar reventaba en desarrollo con «hostname localhost
// is not configured under images», porque `localhost` no está en los
// remotePatterns de next.config.js —y no debe estarlo: la solución correcta es
// el proxy, no abrir el optimizador a un host arbitrario—.
export function getAuthorImageUrl(basename) {
  if (!basename) return null
  return CDN_BASE_URL
    ? `${CDN_BASE_URL}/authors/${encodeURIComponent(basename)}`
    : `${API_URL}/users/authors/images/${encodeURIComponent(basename)}`
}

export function getAuthorImageDisplayUrl(basename) {
  if (!basename) return null
  return DEV_IMAGE_PROXY
    ? `/img-proxy/users/authors/images/${encodeURIComponent(basename)}`
    : getAuthorImageUrl(basename)
}

// Imagen del artista para las VISTAS PREVIAS SOCIALES (Open Graph y Twitter
// Card). Prefiere `profile_img_mobile` y sólo cae a `profile_img` cuando el
// artista no tiene la segunda.
//
// La inversión respecto al resto de la aplicación es deliberada y es el motivo
// entero de que esta función exista. Las dos imágenes se subieron para el modal
// de artista, cuyas dos maquetas tienen proporciones opuestas: la columna de
// escritorio es alta y estrecha —`profile_img`, vertical— y la banda de móvil
// es ancha y baja —`profile_img_mobile`, apaisada—. Una tarjeta social es lo
// segundo, no lo primero: Open Graph pide 1,91:1 y la tarjeta grande de X pide
// 16:9. Medido sobre un artista real en producción, las dos variantes son
// 787 × 1180 y 2097 × 1180 de la MISMA fotografía; la vertical la recortaba
// cada plataforma por su cuenta y con criterios distintos.
//
// Y arregla de paso el techo que el comentario de `galeria/autor/[authorSlug]`
// daba por asumido: LinkedIn exige 1200 px de ancho para su tarjeta grande, el
// optimizador de Next nunca amplía, y la vertical mide 787. La apaisada sale a
// 1920 × 1080 por el optimizador (36 KB). Para los artistas que tengan las dos,
// la tarjeta grande de LinkedIn deja de ser inalcanzable.
//
// `landscape` viaja de vuelta porque la ruta lo necesita para elegir el tipo de
// tarjeta de X: 'summary_large_image' cuando hay apaisada, y el 'summary'
// pequeño de siempre cuando se cae al retrato vertical, que la tarjeta grande
// recortaría por el centro decapitando a la persona.
//
// `hide_profile_img_mobile` NO se consulta a propósito: ese indicador dice «no
// pintes ninguna imagen en pantallas pequeñas dentro del modal», que es una
// decisión de maqueta sobre el sitio propio, no un juicio sobre el fichero. Un
// artista que lo activa es además, casi por definición, uno que no ha subido
// variante apaisada, así que aquí ya cae al retrato por la vía normal.
export function getAuthorSocialImage(author) {
  if (!author) return { url: null, landscape: false }
  const basename = author.profile_img_mobile || author.profile_img
  if (!basename) return { url: null, landscape: false }
  return {
    url: getAuthorImageUrl(basename),
    landscape: Boolean(author.profile_img_mobile),
  }
}


export function getArtImageUrl(basename) {
  return CDN_BASE_URL
    ? `${CDN_BASE_URL}/art/${encodeURIComponent(basename)}`
    : `${API_URL}/art/images/${encodeURIComponent(basename)}`
}

export function getOthersImageUrl(basename) {
  return CDN_BASE_URL
    ? `${CDN_BASE_URL}/others/${encodeURIComponent(basename)}`
    : `${API_URL}/others/images/${encodeURIComponent(basename)}`
}

export function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').trim()
}

// Corta por la última palabra completa, no por el carácter exacto. Cortando a
// medias salían descripciones como «…para convertirse en un es…» en el
// resultado de búsqueda y en la vista previa de WhatsApp: el lector ve una
// palabra rota, que es la señal de un texto generado sin cuidado.
//
// El límite inferior (60 % del máximo) cubre el caso patológico de un texto sin
// espacios en su tramo final —una URL larga, por ejemplo—: ahí es preferible
// cortar por el carácter que devolver un fragmento demasiado corto.
//
// Elipsis tipográfica «…» (un carácter) en vez de tres puntos: cuenta como uno
// frente al límite de Google y es lo correcto en es-ES.
export function truncateText(text, maxLength = 155) {
  if (!text || text.length <= maxLength) return text || ''
  const cut = text.substring(0, maxLength - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const base = lastSpace > maxLength * 0.6 ? cut.substring(0, lastSpace) : cut
  return base.replace(/[\s,;:.\-—]+$/, '') + '…'
}
