const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://140d.art'

// Regenerate sitemap every hour
export const revalidate = 3600

async function fetchAllPaginated(endpoint, key = 'products') {
  const items = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    try {
      const res = await fetch(`${API_URL}${endpoint}?page=${page}&limit=100`, {
        next: { revalidate: 3600 },
      })
      if (!res.ok) break
      const data = await res.json()
      items.push(...(data[key] || []))
      hasMore = data.hasMore === true
      page++
    } catch {
      break
    }
  }

  return items
}

async function fetchDateRange(endpoint, key) {
  try {
    const now = new Date()
    const from = new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0]
    const to = new Date(now.getFullYear() + 1, 11, 31).toISOString().split('T')[0]
    const res = await fetch(`${API_URL}${endpoint}?from=${from}&to=${to}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data[key] || []
  } catch {
    return []
  }
}

async function fetchJson(endpoint, key) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data[key] || []
  } catch {
    return []
  }
}

export default async function sitemap() {
  const staticPages = [
    { url: `${SITE_URL}`, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/galeria`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/tienda`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/eventos`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/live`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/contacto`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/preguntas-frecuentes`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/legal/terminos-y-condiciones`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/legal/politica-de-privacidad`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/legal/normas-eventos`, changeFrequency: 'yearly', priority: 0.2 },
  ]

  // Art products
  const artProducts = await fetchAllPaginated('/art', 'products')
  const artPages = artProducts.map((p) => ({
    url: `${SITE_URL}/galeria/p/${p.slug || p.id}`,
    lastModified: p.created_at ? new Date(p.created_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  // Others products
  const othersProducts = await fetchAllPaginated('/others', 'products')
  const othersPages = othersProducts.map((p) => ({
    url: `${SITE_URL}/tienda/p/${p.slug || p.id}`,
    lastModified: p.created_at ? new Date(p.created_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  // Authors (art)
  const artAuthors = await fetchJson('/users/authors?category=art', 'authors')
  const artAuthorPages = artAuthors.map((a) => ({
    url: `${SITE_URL}/galeria/autor/${a.slug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  // Authors (others)
  const otherAuthors = await fetchJson('/users/authors?category=other', 'authors')
  const otherAuthorPages = otherAuthors.map((a) => ({
    url: `${SITE_URL}/tienda/autor/${a.slug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  // Events
  const events = await fetchDateRange('/events', 'events')
  const eventPages = events.map((e) => ({
    url: `${SITE_URL}/live/${e.slug}`,
    lastModified: e.event_datetime ? new Date(e.event_datetime) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  // Auctions
  const auctions = await fetchDateRange('/auctions', 'auctions')
  const auctionPages = auctions.map((a) => ({
    url: `${SITE_URL}/eventos/subasta/${a.id}`,
    lastModified: a.start_datetime ? new Date(a.start_datetime) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [
    ...staticPages,
    ...artPages,
    ...othersPages,
    ...artAuthorPages,
    ...otherAuthorPages,
    ...eventPages,
    ...auctionPages,
  ]
}
