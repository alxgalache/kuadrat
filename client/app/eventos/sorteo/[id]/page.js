import { fetchDraw, truncateText, SITE_URL, getArtImageUrl, getOthersImageUrl } from '@/lib/serverApi'
import JsonLd from '@/components/JsonLd'
import DrawDetail from './DrawDetail'

export async function generateMetadata({ params }) {
  const { id } = await params
  const draw = await fetchDraw(id)

  if (!draw) {
    return { title: 'Sorteo no encontrado' }
  }

  const dateRange = draw.start_datetime && draw.end_datetime
    ? `Del ${new Date(draw.start_datetime).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} al ${new Date(draw.end_datetime).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : ''
  const metaDescription = truncateText(
    draw.product_description
      || `Sorteo: ${draw.name}. ${dateRange}. Participa y gana en 140d.`,
    160,
  )
  const canonical = `/eventos/sorteo/${draw.id}`

  const imageUrl = draw.basename
    ? (draw.product_type === 'art' ? getArtImageUrl(draw.basename) : getOthersImageUrl(draw.basename))
    : null

  return {
    title: `${draw.name} | Sorteo`,
    description: metaDescription,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${draw.name} | Sorteo 140d`,
      description: metaDescription,
      url: `${SITE_URL}${canonical}`,
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
  }
}

export default async function SorteoDetailPage({ params }) {
  const { id } = await params
  const draw = await fetchDraw(id)

  const breadcrumbSchema = draw ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Eventos', item: `${SITE_URL}/eventos` },
      { '@type': 'ListItem', position: 3, name: draw.name },
    ],
  } : null

  return (
    <>
      {breadcrumbSchema && <JsonLd data={breadcrumbSchema} />}
      <DrawDetail params={params} />
    </>
  )
}
