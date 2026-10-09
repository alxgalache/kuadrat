import { fetchArtProductFresh, fetchOthersProductFresh } from '@/lib/serverApi'
import { parseContentId } from '@/lib/metaPixel'
import {
  isProductOnSale,
  isArtPurchasable,
  isVariantPurchasable,
  MAX_CART_QUANTITY,
} from '@/lib/cartItems'
import { META_CHECKOUT_COPY } from '@/lib/constants'
import CestaFromMeta from './CestaFromMeta'

/**
 * URL de compra de la tienda de Instagram y Facebook.
 *
 * Desde septiembre de 2025 toda compra en una tienda de Meta termina en la web
 * del vendedor, y sin URL de compra la tienda no se muestra. Meta envía aquí al
 * comprador con lo que eligió: `?products=art_57%3A1%2Cother_4_v12%3A2`, los
 * identificadores del catálogo (`GET /api/feeds/meta-catalog.xml`), que son los
 * del píxel. Meta pide vaciar la cesta, añadir los productos y enseñar precio y
 * subtotal.
 *
 * Los productos se resuelven AQUÍ, en el servidor y sin caché de datos: el
 * resumen viaja en el HTML (lo ve igual quien valida la URL desde Commerce
 * Manager) y la disponibilidad es la de este momento, no la de la ficha
 * cacheada. Leer `searchParams` hace la ruta dinámica, así que Next responde
 * `no-store` y nginx no la guarda. La cesta la toca `CestaFromMeta`.
 *
 * `coupon` se ignora: 140d no tiene códigos de descuento.
 */

export const metadata = {
  title: META_CHECKOUT_COPY.metaTitle,
  // Una página por combinación de productos, sin contenido propio. No va en el
  // Disallow de robots.txt para no impedir que el validador de Meta la lea.
  robots: { index: false, follow: false, nocache: true },
}

// Cada línea es una lectura a la API: un enlace con cientos de productos no
// puede convertirse en cientos de peticiones. Una cesta de Instagram real
// tiene unas pocas.
const MAX_LINES = 20

/**
 * `products` → `[{ id, ref, quantity }]`, sumando los identificadores
 * repetidos y descartando lo mal formado. `ref` es lo que da `parseContentId`.
 */
function parseProducts(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || value === '') return []

  const lines = new Map()
  for (const part of value.split(',')) {
    const sep = part.lastIndexOf(':')
    if (sep <= 0) continue
    const id = part.slice(0, sep).trim()
    const quantityText = part.slice(sep + 1).trim()
    if (!/^\d+$/.test(quantityText) || Number(quantityText) < 1) continue
    const ref = parseContentId(id)
    if (!ref) continue

    const previous = lines.get(id)
    if (!previous && lines.size >= MAX_LINES) continue
    lines.set(id, { id, ref, quantity: (previous?.quantity || 0) + Number(quantityText) })
  }
  return [...lines.values()]
}

const productHref = (kind, product) => `/${kind === 'art' ? 'galeria' : 'tienda'}/p/${product.slug}`

/**
 * Cada línea con su estado:
 *  - 'buyable': se añade a la cesta, con la cantidad ya ajustada.
 *  - 'not-buyable': a la venta, pero no por la cesta (modo cotización o pagos
 *    desactivados); se enlaza su ficha.
 *  - 'unavailable': vendido, en subasta o sorteo, sin stock o ya no publicado.
 */
async function resolveLines(requested) {
  const artIds = [...new Set(requested.filter((l) => l.ref.productType === 'art').map((l) => l.ref.productId))]
  const otherIds = [...new Set(requested.filter((l) => l.ref.productType === 'other').map((l) => l.ref.productId))]
  const [arts, others] = await Promise.all([
    Promise.all(artIds.map(fetchArtProductFresh)),
    Promise.all(otherIds.map(fetchOthersProductFresh)),
  ])
  const artById = new Map(artIds.map((id, i) => [id, arts[i]]))
  const otherById = new Map(otherIds.map((id, i) => [id, others[i]]))

  return requested.map(({ id, ref, quantity }) => {
    if (ref.productType === 'art') {
      const product = artById.get(ref.productId)
      if (!product) return { key: id, kind: 'art', status: 'unavailable', product: null }
      const href = productHref('art', product)
      if (!isProductOnSale(product)) return { key: id, kind: 'art', status: 'unavailable', product, href }
      if (!isArtPurchasable(product)) return { key: id, kind: 'art', status: 'not-buyable', product, href }
      return { key: id, kind: 'art', status: 'buyable', product, quantity: 1, href }
    }

    const product = otherById.get(ref.productId)
    if (!product) return { key: id, kind: 'other', status: 'unavailable', product: null }
    const href = productHref('other', product)
    const variant = (product.variations || []).find((v) => v.id === ref.variantId) || null
    if (!variant || !isProductOnSale(product) || Number(variant.stock) <= 0) {
      return { key: id, kind: 'other', status: 'unavailable', product, variant, href }
    }
    if (!isVariantPurchasable(product, variant)) {
      return { key: id, kind: 'other', status: 'not-buyable', product, variant, href }
    }
    const capped = Math.min(quantity, Number(variant.stock), MAX_CART_QUANTITY)
    return { key: id, kind: 'other', status: 'buyable', product, variant, quantity: capped, href }
  })
}

export default async function CestaPage({ searchParams }) {
  const { products } = await searchParams
  const lines = await resolveLines(parseProducts(products))
  return <CestaFromMeta lines={lines} />
}
