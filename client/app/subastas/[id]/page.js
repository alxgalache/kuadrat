import { fetchAuction, truncateText, SITE_URL } from '@/lib/serverApi'
import JsonLd from '@/components/JsonLd'
import AuctionDetail from './AuctionDetail'

export async function generateMetadata({ params }) {
  const { id } = await params
  const auction = await fetchAuction(id)

  if (!auction) {
    return { title: 'Subasta no encontrada' }
  }

  const dateRange = auction.start_datetime && auction.end_datetime
    ? `Del ${new Date(auction.start_datetime).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} al ${new Date(auction.end_datetime).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : ''
  const metaDescription = truncateText(
    auction.description
      || `Subasta de arte online: ${auction.name}. ${dateRange}. Participa y puja por obras únicas en 140d.`,
    160,
  )
  const canonical = `/subastas/${auction.id}`

  return {
    title: auction.name,
    description: metaDescription,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${auction.name} | Subastas 140d`,
      description: metaDescription,
      url: `${SITE_URL}${canonical}`,
    },
  }
}

export default async function SubastaDetailPage({ params }) {
  const { id } = await params
  const auction = await fetchAuction(id)

  const breadcrumbSchema = auction ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Subastas', item: `${SITE_URL}/subastas` },
      { '@type': 'ListItem', position: 3, name: auction.name },
    ],
  } : null

  return (
    <>
      {breadcrumbSchema && <JsonLd data={breadcrumbSchema} />}
      <AuctionDetail params={params} />
    </>
  )
}
