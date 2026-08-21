import { GUIDES } from '@/lib/guides'
import { getGuideContent, isPlaceholder } from '@/lib/guideContent'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/serverApi'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
const DATA_API_URL = process.env.INTERNAL_API_URL || API_URL
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://140d.art'

// Regenerate sitemap every hour
export const revalidate = 3600

// Tope de páginas por origen. Sin él, `hasMore` siempre verdadero —un fallo de
// paginación en la API, o un `limit` que el backend ignora— convierte la
// generación del sitemap en un bucle infinito que se lleva por delante el
// render. 100 páginas × 100 elementos = 10 000 URLs por origen, muy por encima
// del catálogo previsible y muy por debajo de lo que tarda en doler.
const MAX_PAGES = 100

async function fetchAllPaginated(endpoint, key = 'products') {
  const items = []
  let page = 1
  let hasMore = true

  while (hasMore && page <= MAX_PAGES) {
    try {
      const res = await fetch(`${DATA_API_URL}${endpoint}?page=${page}&limit=100`, {
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
    const res = await fetch(`${DATA_API_URL}${endpoint}?from=${from}&to=${to}`, {
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
    const res = await fetch(`${DATA_API_URL}${endpoint}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data[key] || []
  } catch {
    return []
  }
}

// Las imágenes de producto se declaran en la entrada del sitemap. Para una
// galería la búsqueda de imágenes es un canal de descubrimiento de primer
// orden, y es el único sitio donde se puede asociar explícitamente una imagen
// con la página que la contiene.
//
// Devuelve undefined —no un array vacío— cuando no hay imágenes: Next serializa
// `images: []` como una clave presente y sin contenido.
function imageUrls(product, toUrl) {
  const basenames = (product.images || [])
    .map((img) => img?.basename)
    .filter(Boolean)

  if (basenames.length === 0) {
    const single = product.thumbnail_basename
    return single ? [toUrl(single)] : undefined
  }

  return basenames.map(toUrl)
}

function safeDate(value) {
  if (!value) return new Date()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

export default async function sitemap() {
  const staticPages = [
    { url: `${SITE_URL}`, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/galeria`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/galeria/artistas`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/tienda`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/eventos`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/live`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/sobre-140d`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/guias`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/contacto`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/preguntas-frecuentes`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    // Las cuatro páginas legales publicadas. `aviso-legal` y
    // `politica-de-cookies` faltaban aunque existen desde hace tiempo.
    { url: `${SITE_URL}/legal/aviso-legal`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/legal/terminos-y-condiciones`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/legal/politica-de-privacidad`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/legal/politica-de-cookies`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/legal/normas-eventos`, changeFrequency: 'yearly', priority: 0.2 },
  ]

  // Sólo las guías redactadas. Las que siguen con texto de marcador se sirven
  // como `noindex` (ver app/guias/[slug]/page.js), y anunciar en el sitemap una
  // URL que pide no ser indexada es pedir dos cosas contrarias a la vez.
  const guidePages = GUIDES.filter((g) => !isPlaceholder(getGuideContent(g.slug))).map((g) => ({
    url: `${SITE_URL}/guias/${g.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  // Todos los orígenes en paralelo. Cada helper ya devuelve [] ante un fallo,
  // así que un origen caído resta sus URLs pero no impide que salgan las demás
  // ni que el sitemap conserve, como mínimo, las rutas estáticas.
  const [artProducts, othersProducts, artAuthors, otherAuthors, events, auctions, draws] =
    await Promise.all([
      fetchAllPaginated('/art', 'products'),
      fetchAllPaginated('/others', 'products'),
      fetchJson('/users/authors?category=art', 'authors'),
      fetchJson('/users/authors?category=other', 'authors'),
      fetchDateRange('/events', 'events'),
      fetchDateRange('/auctions', 'auctions'),
      // /api/draws exige `from` y `to`: sin ellos responde 400, no una lista vacía.
      fetchDateRange('/draws', 'draws'),
    ])

  const artPages = artProducts.map((p) => ({
    url: `${SITE_URL}/galeria/p/${p.slug || p.id}`,
    lastModified: safeDate(p.created_at),
    changeFrequency: 'weekly',
    priority: 0.7,
    images: imageUrls(p, getArtImageUrl),
  }))

  const othersPages = othersProducts.map((p) => ({
    url: `${SITE_URL}/tienda/p/${p.slug || p.id}`,
    lastModified: safeDate(p.created_at),
    changeFrequency: 'weekly',
    priority: 0.7,
    images: imageUrls(p, getOthersImageUrl),
  }))

  const artAuthorPages = artAuthors
    .filter((a) => a.slug)
    .map((a) => ({
      url: `${SITE_URL}/galeria/autor/${a.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    }))

  const otherAuthorPages = otherAuthors
    .filter((a) => a.slug)
    .map((a) => ({
      url: `${SITE_URL}/tienda/autor/${a.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    }))

  const eventPages = events
    .filter((e) => e.slug)
    .map((e) => ({
      url: `${SITE_URL}/live/${e.slug}`,
      lastModified: safeDate(e.event_datetime),
      changeFrequency: 'weekly',
      priority: 0.7,
    }))

  const auctionPages = auctions.map((a) => ({
    url: `${SITE_URL}/eventos/subasta/${a.id}`,
    lastModified: safeDate(a.start_datetime),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  // Los sorteos faltaban por completo, aunque /api/draws existe y
  // /eventos/sorteo/[id] es una ruta pública con su propia ficha y sus datos
  // estructurados.
  const drawPages = draws.map((d) => ({
    url: `${SITE_URL}/eventos/sorteo/${d.id}`,
    lastModified: safeDate(d.start_datetime || d.created_at),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  // Última red: si dos orígenes distintos produjeran la misma URL, el sitemap
  // la declararía dos veces.
  const all = [
    ...staticPages,
    ...guidePages,
    ...artPages,
    ...othersPages,
    ...artAuthorPages,
    ...otherAuthorPages,
    ...eventPages,
    ...auctionPages,
    ...drawPages,
  ]

  const seen = new Set()
  return all.filter((entry) => {
    if (seen.has(entry.url)) return false
    seen.add(entry.url)
    return true
  })
}
