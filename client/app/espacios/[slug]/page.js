import { fetchEvent, truncateText, SITE_URL } from '@/lib/serverApi'
import JsonLd from '@/components/JsonLd'
import EventDetail from './EventDetail'

const categoryLabels = {
  masterclass: 'Masterclass',
  charla: 'Charla',
  entrevista: 'Entrevista',
  ama: 'AMA',
  video: 'Vídeo',
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const event = await fetchEvent(slug)

  if (!event) {
    return { title: 'Evento no encontrado' }
  }

  const categoryLabel = categoryLabels[event.category] || event.category
  const dateStr = event.event_datetime
    ? new Date(event.event_datetime).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : ''
  const metaDescription = truncateText(
    event.description
      || `${categoryLabel} de arte${event.host_name ? ` con ${event.host_name}` : ''}. ${dateStr}.`,
    160,
  )
  const canonical = `/espacios/${event.slug}`

  return {
    title: event.title,
    description: metaDescription,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${event.title} | 140d Espacios`,
      description: metaDescription,
      type: 'website',
      ...(event.cover_image_url ? {
        images: [{ url: event.cover_image_url, alt: event.title }],
      } : {}),
      url: `${SITE_URL}${canonical}`,
    },
    twitter: {
      card: event.cover_image_url ? 'summary_large_image' : 'summary',
      title: `${event.title} | 140d Espacios`,
      description: metaDescription,
      ...(event.cover_image_url ? { images: [event.cover_image_url] } : {}),
    },
  }
}

export default async function EventDetailPage({ params }) {
  const { slug } = await params
  const event = await fetchEvent(slug)

  const eventSchema = event ? {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description || '',
    startDate: event.event_datetime,
    ...(event.event_datetime && event.duration_minutes ? {
      endDate: new Date(new Date(event.event_datetime).getTime() + event.duration_minutes * 60000).toISOString(),
    } : {}),
    eventStatus: event.status === 'cancelled'
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: {
      '@type': 'VirtualLocation',
      url: `${SITE_URL}/espacios/${event.slug}`,
    },
    organizer: {
      '@type': 'Organization',
      name: '140d',
      url: SITE_URL,
    },
    ...(event.host_name ? {
      performer: {
        '@type': 'Person',
        name: event.host_name,
      },
    } : {}),
    ...(event.cover_image_url ? { image: event.cover_image_url } : {}),
    offers: event.access_type === 'paid' ? {
      '@type': 'Offer',
      price: event.price,
      priceCurrency: event.currency || 'EUR',
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/espacios/${event.slug}`,
    } : {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/espacios/${event.slug}`,
    },
    inLanguage: 'es',
  } : null

  const breadcrumbSchema = event ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Espacios', item: `${SITE_URL}/espacios` },
      { '@type': 'ListItem', position: 3, name: event.title },
    ],
  } : null

  return (
    <>
      {eventSchema && <JsonLd data={eventSchema} />}
      {breadcrumbSchema && <JsonLd data={breadcrumbSchema} />}
      <EventDetail params={params} />
    </>
  )
}
