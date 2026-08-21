import { notFound } from 'next/navigation'
import { fetchOthersProduct, getOthersImageUrl, truncateText, SITE_URL } from '@/lib/serverApi'
import JsonLd from '@/components/JsonLd'
import { buildProduct, buildBreadcrumb, stripHtml } from '@/lib/schema'
import { PAYMENT_ENABLED } from '@/lib/constants'
import OthersProductDetail from './OthersProductDetail'

// Todas las imágenes del producto, no sólo la miniatura: schema.org admite
// varias y cada una es una oportunidad más en la búsqueda de imágenes.
function productImageUrls(product) {
  const basenames = (product.images || []).map((i) => i?.basename).filter(Boolean)
  if (basenames.length > 0) return basenames.map(getOthersImageUrl)
  const single = product.thumbnail_basename
  return single ? [getOthersImageUrl(single)] : []
}

// ISR — misma razón que en `galeria/p/[id]`: sin este export el segmento
// dinámico se renderiza en cada petición. Ver el comentario allí.
export const revalidate = 300

// `revalidate` solo no basta en un segmento dinámico: hace falta también
// `generateStaticParams`. Ver el comentario extenso en
// `client/app/galeria/p/[id]/page.js`.
export async function generateStaticParams() {
  return []
}

export const dynamicParams = true

export async function generateMetadata({ params }) {
  const { id } = await params
  const product = await fetchOthersProduct(id)

  if (!product) {
    return { title: 'Producto no encontrado', robots: { index: false } }
  }

  const plainDescription = stripHtml(product.description)
  const metaDescription = truncateText(
    `${product.name} por ${product.seller_full_name || 'artista'}. ${plainDescription}`,
    160,
  )
  const images = productImageUrls(product)
  const canonical = `/tienda/p/${product.slug || product.id}`

  return {
    title: product.name,
    description: metaDescription,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${product.name} | 140d`,
      description: metaDescription,
      // NO 'product': Next valida `openGraph.type` contra la lista de tipos que
      // soporta (website, article, book, profile, music.*, video.*) y lanza
      // «Invalid OpenGraph type» en tiempo de render — un 500, no un aviso.
      // La naturaleza de producto ya la expresa el JSON-LD, que es lo que leen
      // buscadores y motores generativos.
      type: 'website',
      ...(images.length > 0 ? { images: images.map((url) => ({ url, alt: product.name })) } : {}),
      url: `${SITE_URL}${canonical}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} | 140d`,
      description: metaDescription,
      ...(images.length > 0 ? { images: [images[0]] } : {}),
    },
  }
}

export default async function OthersProductDetailPage({ params }) {
  const { id } = await params

  // Misma llamada que generateMetadata; Next deduplica los fetch idénticos
  // dentro de un render, así que no se añade ningún viaje a la API.
  const product = await fetchOthersProduct(id)

  // 404 real, en lugar de un 200 con «No se pudo cargar el producto» dentro.
  if (!product) notFound()

  const canonical = `/tienda/p/${product.slug || product.id}`

  const productSchema = buildProduct({
    product,
    url: canonical,
    imageUrls: productImageUrls(product),
    purchasable: PAYMENT_ENABLED,
  })

  const breadcrumbSchema = buildBreadcrumb([
    { name: 'Inicio', url: '/' },
    { name: 'Tienda', url: '/tienda' },
    // Sin el artista: la miga VISIBLE de esta ficha no lo muestra, y los datos
    // estructurados no pueden declarar un recorrido que el visitante no ve.
    { name: product.name },
  ])

  return (
    <>
      <JsonLd data={productSchema} />
      <JsonLd data={breadcrumbSchema} />
      <OthersProductDetail params={params} initialProduct={product} />
    </>
  )
}
