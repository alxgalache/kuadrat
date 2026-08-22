import { notFound } from 'next/navigation'
import { fetchEvent, fetchEventPayload, truncateText, SITE_URL } from '@/lib/serverApi'
import { buildOpenGraph, buildTwitter, socialImageUrl } from '@/lib/metadata'
import JsonLd from '@/components/JsonLd'
import EventDetail from './EventDetail'

const categoryLabels = {
  masterclass: 'Masterclass',
  charla: 'Charla',
  entrevista: 'Entrevista',
  ama: 'AMA',
  video: 'Vídeo',
}

// `events.event_datetime` se guarda como hora local sin marcador de zona
// («2026-08-21T19:52»), que es tal cual la que muestra la página.
//
// El `endDate` se calculaba con `.toISOString()`, y eso mezclaba dos marcos
// temporales en el mismo nodo: `startDate` iba en local ingenuo y `endDate` en
// UTC absoluto. Un consumidor que leyera los dos —Google, por ejemplo, para el
// resultado enriquecido de evento— deduciría una duración desplazada por el
// desfase horario del servidor: con Europe/Madrid en agosto, dos horas de más.
//
// Se calcula y se emite en el MISMO marco que `startDate`: se interpreta y se
// vuelve a formatear con los mismos captadores locales, así que la ida y la
// vuelta se cancelan y el resultado no depende de la zona del contenedor.
function finalEnLocal(inicio, minutos) {
  if (!inicio || !minutos) return null
  const d = new Date(inicio)
  if (Number.isNaN(d.getTime())) return null
  d.setMinutes(d.getMinutes() + minutos)
  const dd = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}` +
    `T${dd(d.getHours())}:${dd(d.getMinutes())}`
  )
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const event = await fetchEvent(slug)

  if (!event) {
    return { title: 'Evento no encontrado', robots: { index: false } }
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
  const canonical = `/live/${event.slug}`

  return {
    title: event.title,
    description: metaDescription,
    alternates: {
      canonical,
    },
    // `cover_image_url` es una columna TEXT libre y puede traer una URL de
    // cualquier host. `socialImageUrl` sólo pasa por el optimizador los hosts
    // que están en `images.remotePatterns`; con cualquier otro devolvería 400 y
    // el evento se quedaría sin imagen, así que ahí deja la URL intacta.
    openGraph: buildOpenGraph({
      title: `${event.title} | 140d Live`,
      description: metaDescription,
      path: canonical,
      images: event.cover_image_url
        ? [{ url: socialImageUrl(event.cover_image_url), alt: event.title }]
        : [],
    }),
    // La condición anterior (`summary` sin portada) dejaba la tarjeta pequeña
    // Y sin imagen alguna. Ahora sin portada se cae a la del sitio, apaisada
    // 1200x630, así que la tarjeta grande es correcta en ambos casos.
    twitter: buildTwitter({
      title: `${event.title} | 140d Live`,
      description: metaDescription,
      images: event.cover_image_url ? [socialImageUrl(event.cover_image_url)] : [],
    }),
  }
}

export default async function EventDetailPage({ params }) {
  const { slug } = await params
  const payload = await fetchEventPayload(slug)
  const event = payload?.event || null

  // 404 real en lugar de un 200 con «Evento no encontrado» pintado por el
  // cliente.
  if (!event) notFound()

  const eventSchema = event ? {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description || '',
    startDate: event.event_datetime,
    ...(finalEnLocal(event.event_datetime, event.duration_minutes)
      ? { endDate: finalEnLocal(event.event_datetime, event.duration_minutes) }
      : {}),
    eventStatus: event.status === 'cancelled'
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: {
      '@type': 'VirtualLocation',
      url: `${SITE_URL}/live/${event.slug}`,
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
      url: `${SITE_URL}/live/${event.slug}`,
    } : {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/live/${event.slug}`,
    },
    inLanguage: 'es',
  } : null

  const breadcrumbSchema = event ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Live', item: `${SITE_URL}/live` },
      { '@type': 'ListItem', position: 3, name: event.title },
    ],
  } : null

  return (
    <>
      {eventSchema && <JsonLd data={eventSchema} />}
      {breadcrumbSchema && <JsonLd data={breadcrumbSchema} />}
      <EventDetail
        params={params}
        initialEvent={event}
        initialAttendeeCount={payload?.attendeeCount ?? 0}
      />
    </>
  )
}
