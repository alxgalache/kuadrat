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

export async function fetchEvent(slug) {
  try {
    const res = await fetch(`${DATA_API_URL}/events/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.event || null
  } catch {
    return null
  }
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

const CDN_BASE_URL = process.env.CDN_BASE_URL || ''

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
