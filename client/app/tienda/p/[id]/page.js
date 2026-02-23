import { fetchOthersProduct, getOthersImageUrl, stripHtml, truncateText, SITE_URL } from '@/lib/serverApi'
import JsonLd from '@/components/JsonLd'
import OthersProductDetail from './OthersProductDetail'

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
  const imageUrl = getOthersImageUrl(product.basename)
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
      images: [{ url: imageUrl, alt: product.name }],
      url: `${SITE_URL}${canonical}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} | 140d`,
      description: metaDescription,
      images: [imageUrl],
    },
  }
}

export default async function OthersProductDetailPage({ params }) {
  const { id } = await params
  const product = await fetchOthersProduct(id)

  const productSchema = product ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: stripHtml(product.description),
    image: getOthersImageUrl(product.basename),
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
      { '@type': 'ListItem', position: 2, name: 'Galería', item: `${SITE_URL}/galeria` },
      { '@type': 'ListItem', position: 3, name: 'Tienda', item: `${SITE_URL}/tienda` },
      { '@type': 'ListItem', position: 4, name: product.name },
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
