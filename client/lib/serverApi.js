// Server-side API fetching utility for generateMetadata and sitemap.
// This file should ONLY be imported in server components and route handlers.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://140d.art'

export { API_URL, SITE_URL }

export async function fetchArtProduct(idOrSlug) {
  try {
    const res = await fetch(`${API_URL}/art/${encodeURIComponent(idOrSlug)}`, {
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
    const res = await fetch(`${API_URL}/others/${encodeURIComponent(idOrSlug)}`, {
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
    const res = await fetch(`${API_URL}/events/${encodeURIComponent(slug)}`, {
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
    const res = await fetch(`${API_URL}/auctions/${encodeURIComponent(id)}`, {
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
    const res = await fetch(`${API_URL}/draws/${encodeURIComponent(id)}`, {
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
    const res = await fetch(`${API_URL}/users/authors/${encodeURIComponent(slug)}`, {
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
