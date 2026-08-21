// Constructores de datos estructurados schema.org.
//
// Fuente única: ninguna página compone literales JSON-LD por su cuenta. Antes,
// el mismo `BreadcrumbList` estaba escrito a mano en cinco ficheros con
// variaciones pequeñas, y la regla de «omite la propiedad si el valor está
// vacío» se repetía como `...(x ? {k: v} : {})` en cada sitio.
//
// Esa regla es la que más silenciosamente se rompe y la que más cara sale: una
// propiedad PRESENTE con valor vacío es peor que ausente. Los validadores la
// marcan como error, y un consumidor —incluido un modelo— la lee como un hecho:
// un `artMedium: ""` afirma que se conoce la técnica y que es la cadena vacía.
// Por eso `compact()` es la última operación de todos los constructores.

import { SITE, SITE_URL } from './siteInfo'

// Elimina claves cuyo valor es null, undefined, cadena vacía (o sólo espacios),
// array vacío u objeto vacío. Recursivo, porque los nodos anidados
// (`QuantitativeValue`, `Offer`, `Person`) tienen el mismo problema.
export function compact(value) {
  if (Array.isArray(value)) {
    const arr = value.map(compact).filter((v) => v !== undefined)
    return arr.length > 0 ? arr : undefined
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      const c = compact(v)
      if (c !== undefined) out[k] = c
    }
    // Un nodo que sólo conserva `@type` no aporta nada: es una afirmación vacía.
    const meaningful = Object.keys(out).filter((k) => k !== '@type' && k !== '@context')
    return meaningful.length > 0 ? out : undefined
  }

  if (typeof value === 'string') {
    const t = value.trim()
    return t === '' ? undefined : t
  }

  if (value === null || value === undefined) return undefined
  if (typeof value === 'number' && Number.isNaN(value)) return undefined

  return value
}

export function absoluteUrl(path) {
  if (!path) return undefined
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

export function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── Parseo de dimensiones ───────────────────────────────────────────────────
//
// `art.dimensions` es TEXT libre: lo escribe el artista y no hay validación de
// formato que garantice una forma concreta. El parser reconoce `alto x ancho`
// y `alto x ancho x fondo`, con `x`, `×` o `*`, coma o punto decimal, y unidad
// opcional.
//
// Ante CUALQUIER otra cosa devuelve null y el constructor omite `width` y
// `height` por completo. NO se adivina una medida: publicar una dimensión
// inventada sobre una obra que está en venta es peor que no publicar ninguna, y
// es el mismo criterio que la calculadora de envíos aplica a las medidas del
// paquete. Un hueco es visible; una sustitución silenciosa no.
const DIMENSION_RE =
  /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×*]\s*(\d+(?:[.,]\d+)?))?\s*(?:cm|cms|centímetros)?\s*$/i

export function parseDimensions(raw) {
  if (!raw || typeof raw !== 'string') return null

  const m = raw.match(DIMENSION_RE)
  if (!m) return null

  const num = (s) => (s === undefined ? undefined : Number.parseFloat(s.replace(',', '.')))
  const height = num(m[1])
  const width = num(m[2])
  const depth = num(m[3])

  if (!Number.isFinite(height) || !Number.isFinite(width)) return null
  if (height <= 0 || width <= 0) return null

  return { height, width, depth: Number.isFinite(depth) && depth > 0 ? depth : undefined }
}

function quantitativeCm(value) {
  if (value === undefined) return undefined
  return { '@type': 'QuantitativeValue', value, unitCode: 'CMT', unitText: 'cm' }
}

// ── Entidad ─────────────────────────────────────────────────────────────────

// `@id` estable para que el resto de nodos puedan referirse a la organización
// en lugar de repetirla. Es lo que permite a un consumidor entender que el
// vendedor de todas las obras es la misma entidad.
export const ORGANIZATION_ID = `${SITE_URL}/#organization`
export const WEBSITE_ID = `${SITE_URL}/#website`

export function buildOrganization() {
  return compact({
    '@context': 'https://schema.org',
    // ArtGallery describe mejor lo que es que un Organization genérico, y
    // OnlineStore describe lo que hace. El array es válido y evita elegir.
    '@type': ['OnlineStore', 'ArtGallery'],
    '@id': ORGANIZATION_ID,
    name: SITE.name,
    alternateName: SITE.legalName,
    url: SITE.url,
    logo: absoluteUrl('/brand/140d.png'),
    image: absoluteUrl('/brand/og-image.jpg'),
    description: SITE.oneLiner,
    sameAs: SITE.social,
    foundingDate: SITE.foundingDate,
    foundingLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: SITE.foundingCity,
        addressRegion: SITE.foundingRegion,
        addressCountry: SITE.country,
      },
    },
    founder: { '@type': 'Person', name: SITE.founder },
    // Dónde se vende HOY. No se declara Europa: prometer un envío que todavía
    // no existe es la clase de dato que un asistente repite a un comprador.
    areaServed: { '@type': 'Country', name: 'España' },
    knowsAbout: SITE.knowsAbout,
    // SIN `inLanguage`. schema.org la define sobre CreativeWork y sobre Event,
    // no sobre Organization — y ArtGallery y OnlineStore son subtipos de
    // Organization. El validador lo señalaba en TODAS las páginas, porque este
    // nodo va en el layout raíz.
    //
    // No se pierde nada al quitarla: el idioma ya se declara donde sí
    // corresponde — en `<html lang="es">`, en `WebSite.inLanguage`, en cada
    // nodo CreativeWork (VisualArtwork, Article, FAQPage, AboutPage) y, para el
    // canal de contacto, en `availableLanguage` de aquí debajo, que sí es una
    // propiedad válida de ContactPoint.
    contactPoint: {
      '@type': 'ContactPoint',
      email: SITE.email,
      contactType: 'customer service',
      availableLanguage: ['Spanish', 'es'],
      areaServed: SITE.areaServed,
    },
    // Deliberadamente ausentes: número de artistas u obras (cambia y quedaría
    // congelado), dirección postal y NIF (no confirmados), rango de precios
    // («amplio» no es un valor que schema.org pueda expresar sin inventarlo).
  })
}

export function buildWebSite() {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE.name,
    url: SITE.url,
    inLanguage: SITE.language,
    description: SITE.oneLiner,
    publisher: { '@id': ORGANIZATION_ID },
  })
}

// ── Migas ───────────────────────────────────────────────────────────────────

// `trail` es [{ name, url? }]. El último elemento va sin `url`: es la página
// actual. Debe coincidir exactamente con la miga que el visitante ve.
export function buildBreadcrumb(trail) {
  const items = (trail || []).filter((t) => t && t.name)
  if (items.length === 0) return null

  return compact({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: t.url ? absoluteUrl(t.url) : undefined,
    })),
  })
}

// ── Listas ──────────────────────────────────────────────────────────────────

export function buildItemList({ items, name }) {
  const entries = (items || []).filter((i) => i && i.url)
  if (entries.length === 0) return null

  return compact({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: entries.length,
    itemListElement: entries.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(it.url),
      name: it.name,
    })),
  })
}

// ── Personas ────────────────────────────────────────────────────────────────

export function artistId(slug) {
  return `${SITE_URL}/galeria/autor/${slug}#person`
}

// NUNCA incluye la dirección de correo del artista: es su correo de cuenta, no
// un canal de contacto público. Quien quiera escribirle usa el formulario de
// consulta de la obra.
export function buildPerson({ author, url, imageUrl, includeContext = true }) {
  if (!author) return null

  return compact({
    ...(includeContext ? { '@context': 'https://schema.org' } : {}),
    '@type': 'Person',
    '@id': author.slug ? artistId(author.slug) : undefined,
    name: author.full_name,
    url: absoluteUrl(url),
    description: stripHtml(author.bio),
    image: imageUrl,
    address: author.location
      ? { '@type': 'PostalAddress', addressLocality: author.location }
      : undefined,
    // El artista expone su obra a través de la galería; no es empleado suyo.
    // `memberOf` lo dice sin afirmar una relación laboral que no existe.
    memberOf: { '@id': ORGANIZATION_ID },
  })
}

// ── Ofertas ─────────────────────────────────────────────────────────────────

export const AVAILABILITY = {
  IN_STOCK: 'https://schema.org/InStock',
  SOLD_OUT: 'https://schema.org/SoldOut',
  PRE_ORDER: 'https://schema.org/PreOrder',
}

// `is_sold` en este proyecto significa «edición agotada», no «pieza vendida».
//
// Con la tienda en modo cotización el escaparate no ofrece comprar nada, así
// que `InStock` sería falso: no hay transacción posible en ese momento.
//
// Nunca se publica cuántos ejemplares quedan. El producto ha decidido no
// mostrárselo al comprador (EDITION_COPY en lib/constants.js); el JSON-LD no
// puede filtrar lo que la interfaz oculta a propósito.
export function availabilityFor({ isSold, purchasable = true }) {
  if (isSold) return AVAILABILITY.SOLD_OUT
  if (!purchasable) return AVAILABILITY.PRE_ORDER
  return AVAILABILITY.IN_STOCK
}

export function buildOffer({ price, url, isSold, purchasable = true }) {
  const numeric = Number.parseFloat(price)
  if (!Number.isFinite(numeric)) return undefined

  return {
    '@type': 'Offer',
    price: numeric,
    priceCurrency: 'EUR',
    availability: availabilityFor({ isSold, purchasable }),
    url: absoluteUrl(url),
    seller: { '@id': ORGANIZATION_ID },
  }
}

// ── Obra de arte ────────────────────────────────────────────────────────────

// VisualArtwork en lugar de Product: es lo que describe a una obra y lo que
// permite responder «¿qué obras en acrílico de 60x80 hay?». Los campos salen de
// columnas que el modelo ya guardaba y que no llegaban a ninguna parte.
//
// `outside_dimensions` y `outside_weight` NO se publican jamás: describen la
// caja de envío, no la obra. Confundirlas pondría el tamaño del embalaje como
// tamaño del cuadro.
export function buildVisualArtwork({ product, url, imageUrls, purchasable = true }) {
  if (!product) return null

  const dims = parseDimensions(product.dimensions)
  const editionSize = Number.parseInt(product.edition_size, 10)

  return compact({
    '@context': 'https://schema.org',
    '@type': 'VisualArtwork',
    name: product.name,
    description: stripHtml(product.description),
    image: imageUrls && imageUrls.length > 0 ? imageUrls : undefined,
    url: absoluteUrl(url),
    creator: product.seller_full_name
      ? compact({
          '@type': 'Person',
          '@id': product.seller_slug ? artistId(product.seller_slug) : undefined,
          name: product.seller_full_name,
          url: product.seller_slug
            ? absoluteUrl(`/galeria/autor/${product.seller_slug}`)
            : undefined,
        })
      : undefined,
    artMedium: product.type,
    artform: 'Arte contemporáneo',
    width: quantitativeCm(dims?.width),
    height: quantitativeCm(dims?.height),
    depth: quantitativeCm(dims?.depth),
    dateCreated: product.created_at ? String(product.created_at).slice(0, 10) : undefined,
    // Sólo tiene sentido declararlo cuando de verdad es una edición.
    artEdition:
      Number.isFinite(editionSize) && editionSize > 1
        ? `Edición limitada de ${editionSize} ejemplares`
        : undefined,
    inLanguage: SITE.language,
    offers: buildOffer({
      price: product.price,
      url,
      isSold: !!product.is_sold,
      purchasable,
    }),
  })
}

// ── Producto de tienda ──────────────────────────────────────────────────────

// Aquí `Product` sí es el tipo correcto: son artículos y ediciones, no obra
// única.
export function buildProduct({ product, url, imageUrls, purchasable = true }) {
  if (!product) return null

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: stripHtml(product.description),
    image: imageUrls && imageUrls.length > 0 ? imageUrls : undefined,
    url: absoluteUrl(url),
    brand: product.seller_full_name
      ? { '@type': 'Person', name: product.seller_full_name }
      : undefined,
    category: 'Arte y coleccionismo',
    offers: buildOffer({
      price: product.price,
      url,
      isSold: !!product.is_sold,
      purchasable,
    }),
  })
}

// ── Preguntas y artículos ───────────────────────────────────────────────────

export function buildFaqPage(entries) {
  const list = (entries || []).filter((e) => e && e.question && e.answer)
  if (list.length === 0) return null

  return compact({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: SITE.language,
    mainEntity: list.map((e) => ({
      '@type': 'Question',
      name: e.question,
      acceptedAnswer: { '@type': 'Answer', text: e.answer },
    })),
  })
}

export function buildArticle({ headline, description, url, datePublished, dateModified }) {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    url: absoluteUrl(url),
    inLanguage: SITE.language,
    datePublished,
    dateModified: dateModified || datePublished,
    author: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
    isPartOf: { '@id': WEBSITE_ID },
  })
}

export function buildAboutPage({ url, description }) {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: `Sobre ${SITE.name}`,
    url: absoluteUrl(url),
    description,
    inLanguage: SITE.language,
    mainEntity: { '@id': ORGANIZATION_ID },
    isPartOf: { '@id': WEBSITE_ID },
  })
}
