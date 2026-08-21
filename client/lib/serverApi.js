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

export function truncateText(text, maxLength = 155) {
  if (!text || text.length <= maxLength) return text || ''
  return text.substring(0, maxLength - 3) + '...'
}
