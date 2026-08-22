import { notFound } from 'next/navigation'
import { fetchArtProduct, getArtImageUrl, truncateText } from '@/lib/serverApi'
import { buildOpenGraph, buildTwitter, socialImageUrl } from '@/lib/metadata'
import JsonLd from '@/components/JsonLd'
import { buildVisualArtwork, buildBreadcrumb, stripHtml } from '@/lib/schema'
import { PAYMENT_ENABLED, ART_BUY_AVAILABLE } from '@/lib/constants'
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

// Todas las imágenes de la obra, no sólo la miniatura: alimentan el `image` de
// los datos estructurados, donde schema.org admite varias y donde cada una es
// una oportunidad más en la búsqueda de imágenes.
function productImageUrls(product) {
  const basenames = (product.images || []).map((i) => i?.basename).filter(Boolean)
  if (basenames.length > 0) return basenames.map(getArtImageUrl)
  const single = product.thumbnail_basename
  return single ? [getArtImageUrl(single)] : []
}

// Si el escaparate no permite comprar, la oferta no puede declarar `InStock`:
// no hay transacción posible en ese momento, sólo una solicitud de cotización.
const PURCHASABLE = PAYMENT_ENABLED && ART_BUY_AVAILABLE

export async function generateMetadata({ params }) {
  const { id } = await params
  const product = await fetchArtProduct(id)

  if (!product) {
    return { title: 'Obra no encontrada', robots: { index: false } }
  }

  const plainDescription = stripHtml(product.description)
  const metaDescription = truncateText(
    `${product.name}, de ${product.seller_full_name || 'artista'}. ${plainDescription}`,
    160,
  )
  const images = productImageUrls(product)
  const canonical = `/galeria/p/${product.slug || product.id}`

  return {
    title: product.name,
    description: metaDescription,
    alternates: {
      canonical,
    },
    // `socialImageUrl` sirve la obra por el optimizador de Next. El original de
    // una obra medida en producción pesaba 2 MB y **WhatsApp descarta la vista
    // previa por encima de 500 KB**: el enlace de la ficha —la página que más
    // se comparte— salía sin miniatura. Por el optimizador son 214 KB, a la
    // resolución nativa y en JPEG. Ver `lib/metadata.js`.
    //
    // Sin `og:image:width`/`height`: el optimizador recorta al ancho del
    // original y no guardamos las dimensiones de cada obra, así que declararlas
    // sería inventárselas. Sólo ahorran una pasada al scraper.
    openGraph: buildOpenGraph({
      title: `${product.name} | 140d`,
      description: metaDescription,
      path: canonical,
      images: images.map((url) => ({ url: socialImageUrl(url), alt: product.name })),
    }),
    twitter: buildTwitter({
      title: `${product.name} | 140d`,
      description: metaDescription,
      images: images.length > 0 ? [socialImageUrl(images[0])] : [],
    }),
  }
}

export default async function ArtProductDetailPage({ params }) {
  const { id } = await params

  // Misma llamada que hace `generateMetadata`. Next deduplica los fetch
  // idénticos dentro de un render, así que no se añade ningún viaje a la API:
  // al contrario, se quita el que hacía el navegador al montar.
  const product = await fetchArtProduct(id)

  // 404 real. Antes se renderizaba el componente cliente igualmente y acababa
  // mostrando «No se pudo cargar la obra» con estado HTTP 200 — para un
  // buscador, una página válida y vacía.
  //
  // OJO al desplegar: esta ruta pasa de responder 200 a responder 404 para
  // obras inexistentes o retiradas. Cualquier panel que cuente 404 lo verá.
  if (!product) notFound()

  const canonical = `/galeria/p/${product.slug || product.id}`

  const artworkSchema = buildVisualArtwork({
    product,
    url: canonical,
    imageUrls: productImageUrls(product),
    purchasable: PURCHASABLE,
  })

  const breadcrumbSchema = buildBreadcrumb([
    { name: 'Inicio', url: '/' },
    { name: 'Galería', url: '/galeria' },
    // Sin el artista: la miga VISIBLE de esta ficha no lo muestra, y los datos
    // estructurados no pueden declarar un recorrido que el visitante no ve.
    { name: product.name },
  ])

  return (
    <>
      <JsonLd data={artworkSchema} />
      <JsonLd data={breadcrumbSchema} />
      <ArtProductDetail params={params} initialProduct={product} />
    </>
  )
}
