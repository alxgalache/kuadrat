import { fetchOthersProduct, getOthersImageUrl, stripHtml, truncateText, SITE_URL } from '@/lib/serverApi'
import JsonLd from '@/components/JsonLd'
import OthersProductDetail from './OthersProductDetail'

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
    return { title: 'Producto no encontrado' }
  }

  const plainDescription = stripHtml(product.description)
  const metaDescription = truncateText(
    `${product.name} por ${product.seller_full_name || 'artista'}. ${plainDescription}`,
    160,
  )
  const thumbBasename = product.thumbnail_basename || product.images?.[0]?.basename || null
  const imageUrl = thumbBasename ? getOthersImageUrl(thumbBasename) : null
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
      type: 'website',
      ...(imageUrl ? { images: [{ url: imageUrl, alt: product.name }] } : {}),
      url: `${SITE_URL}${canonical}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} | 140d`,
      description: metaDescription,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  }
}

export default async function OthersProductDetailPage({ params }) {
  const { id } = await params
  const product = await fetchOthersProduct(id)
  const thumbBasename = product?.thumbnail_basename || product?.images?.[0]?.basename || null
  const schemaImageUrl = thumbBasename ? getOthersImageUrl(thumbBasename) : null

  const productSchema = product ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: stripHtml(product.description),
    ...(schemaImageUrl ? { image: schemaImageUrl } : {}),
    brand: {
      '@type': 'Person',
      name: product.seller_full_name || '140d',
    },
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'EUR',
      availability: product.is_sold
        ? 'https://schema.org/SoldOut'
        : 'https://schema.org/InStock',
      url: `${SITE_URL}/tienda/p/${product.slug || product.id}`,
      seller: {
        '@type': 'Organization',
        name: '140d',
      },
    },
  } : null

  const breadcrumbSchema = product ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Tienda', item: `${SITE_URL}/tienda` },
      { '@type': 'ListItem', position: 3, name: product.name },
    ],
  } : null

  return (
    <>
      {productSchema && <JsonLd data={productSchema} />}
      {breadcrumbSchema && <JsonLd data={breadcrumbSchema} />}
      <OthersProductDetail params={params} />
    </>
  )
}
