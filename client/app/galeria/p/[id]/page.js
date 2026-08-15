import { fetchArtProduct, getArtImageUrl, stripHtml, truncateText, SITE_URL } from '@/lib/serverApi'
import JsonLd from '@/components/JsonLd'
import ArtProductDetail from './ArtProductDetail'

// ISR. Sin este export, un segmento dinámico sin `generateStaticParams` se
// renderiza entero en cada petición y sale con `Cache-Control: no-store` — que
// era justo el caso de la ruta que más tráfico recibe desde buscadores y redes.
// Medido en producción: ~25 req/s sanas contra las ~50 req/s del listado, que sí
// estaba precacheado. Con `revalidate` el render se sirve desde el cacheHandler
// y sólo se recalcula una vez cada 5 min por obra.
//
// El valor coincide con el `next.revalidate` que ya usaban los fetch de
// `serverApi.js`: la página no puede quedar más fresca que sus propios datos,
// así que un número menor sólo gastaría CPU sin ganar frescura.
export const revalidate = 300

// `revalidate` por sí solo NO basta en un segmento dinámico: sin
// `generateStaticParams` Next lo marca como `ƒ (Dynamic)` y lo renderiza entero
// en cada petición — comprobado en la tabla de rutas de `next build`.
//
// Devolver la lista vacía es deliberado, en lugar de pedir el catálogo a la API
// aquí. Prerenderizar en build obligaría a que la API esté levantada y
// respondiendo durante `docker build`, convirtiendo un fallo de red en un
// despliegue roto; y el beneficio sería sólo ahorrarse el primer render de cada
// obra. Con la lista vacía, `dynamicParams` hace que cada URL se renderice la
// primera vez que alguien la pide y se cachee a partir de ahí.
export async function generateStaticParams() {
  return []
}

export const dynamicParams = true

export async function generateMetadata({ params }) {
  const { id } = await params
  const product = await fetchArtProduct(id)

  if (!product) {
    return { title: 'Obra no encontrada' }
  }

  const plainDescription = stripHtml(product.description)
  const metaDescription = truncateText(
    `${product.name} por ${product.seller_full_name || 'artista'}. ${plainDescription}`,
    160,
  )
  const thumbBasename = product.thumbnail_basename || product.images?.[0]?.basename || null
  const imageUrl = thumbBasename ? getArtImageUrl(thumbBasename) : null
  const canonical = `/galeria/p/${product.slug || product.id}`

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

export default async function ArtProductDetailPage({ params }) {
  const { id } = await params
  const product = await fetchArtProduct(id)
  const thumbBasename = product?.thumbnail_basename || product?.images?.[0]?.basename || null
  const schemaImageUrl = thumbBasename ? getArtImageUrl(thumbBasename) : null

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
      url: `${SITE_URL}/galeria/p/${product.slug || product.id}`,
      seller: {
        '@type': 'Organization',
        name: '140d',
      },
    },
    category: 'Arte',
    ...(product.type ? { material: product.type } : {}),
  } : null

  const breadcrumbSchema = product ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Galería', item: `${SITE_URL}/galeria` },
      { '@type': 'ListItem', position: 3, name: product.name },
    ],
  } : null

  return (
    <>
      {productSchema && <JsonLd data={productSchema} />}
      {breadcrumbSchema && <JsonLd data={breadcrumbSchema} />}
      <ArtProductDetail params={params} />
    </>
  )
}
