import { notFound } from 'next/navigation'
import {
  fetchAuthor,
  fetchAuthorOtherProducts,
  getAuthorImageUrl,
  truncateText,
} from '@/lib/serverApi'
import { buildOpenGraph, buildTwitter, socialImageUrl } from '@/lib/metadata'
import JsonLd from '@/components/JsonLd'
import { buildPerson, buildItemList, buildBreadcrumb, stripHtml } from '@/lib/schema'
import GalleryMasAuthorContent from './GalleryMasAuthorContent'

// ISR — ver el comentario en `galeria/p/[id]/page.js`.
export const revalidate = 300

// `revalidate` solo no basta en un segmento dinámico: hace falta también
// `generateStaticParams`. Ver el comentario extenso en
// `client/app/galeria/p/[id]/page.js`.
export async function generateStaticParams() {
  return []
}

export const dynamicParams = true

export async function generateMetadata({ params }) {
  const { authorSlug } = await params
  const author = await fetchAuthor(authorSlug)

  if (!author) {
    return { title: 'Artista no encontrado', robots: { index: false } }
  }

  const plainBio = stripHtml(author.bio)
  const metaDescription = truncateText(
    plainBio ||
      `Productos y ediciones de ${author.full_name} en 140d. Compra directa al artista, ` +
        'con envío a toda España.',
    160,
  )
  const canonical = `/tienda/autor/${author.slug}`
  const imageUrl = getAuthorImageUrl(author.profile_img)

  return {
    title: `${author.full_name} — productos y ediciones`,
    description: metaDescription,
    alternates: { canonical },
    // El retrato se sirve por el optimizador de Next: el original medido en
    // producción pesaba 587 KB y **WhatsApp no pinta la vista previa por encima
    // de 500 KB**; por el optimizador son 44 KB. Ver `lib/metadata.js`.
    //
    // LO QUE ESTO **NO** ARREGLA, y es deliberado: LinkedIn exige 1200 px de
    // ancho para su tarjeta grande y este retrato mide 787. El optimizador
    // recorta al ancho del original y NUNCA amplía —comprobado: `w=828` y
    // `w=1080` devuelven exactamente los mismos bytes—, así que por aquí no
    // tiene solución. La única sería subir retratos más anchos. Se asume:
    // LinkedIn seguirá mostrando miniatura pequeña en las fichas de artista.
    openGraph: buildOpenGraph({
      type: 'profile',
      title: `${author.full_name} | 140d`,
      description: metaDescription,
      path: canonical,
      images: imageUrl ? [{ url: socialImageUrl(imageUrl), alt: author.full_name }] : [],
    }),
    // 'summary' (tarjeta pequeña) SÓLO cuando hay retrato, porque es vertical y
    // la tarjeta grande de X lo recortaría por el centro, decapitando a la
    // persona. Sin retrato se cae a la tarjeta del sitio, que es apaisada 1200x630
    // y ahí sí corresponde 'summary_large_image'. Mismo criterio condicional que
    // ya usaba `live/[slug]`.
    twitter: buildTwitter({
      card: imageUrl ? 'summary' : 'summary_large_image',
      title: `${author.full_name} | 140d`,
      description: metaDescription,
      images: imageUrl ? [socialImageUrl(imageUrl)] : [],
    }),
  }
}

export default async function GalleryMasAuthorPage({ params }) {
  const { authorSlug } = await params

  const [author, products] = await Promise.all([
    fetchAuthor(authorSlug),
    fetchAuthorOtherProducts(authorSlug),
  ])

  if (!author) notFound()

  // Solo la absoluta: la consumen el JSON-LD y los metadatos, que leen clientes
  // externos. Ya no se pinta ninguna imagen en esta página.
  const imageUrl = getAuthorImageUrl(author.profile_img)
  const canonical = `/tienda/autor/${author.slug}`

  // La canónica de la PERSONA vive en /galeria/autor/<slug>: es la misma
  // entidad vista desde otra sección, no dos artistas. `buildPerson` emite
  // siempre ese `@id`, así que los dos nodos se refieren al mismo sujeto y
  // ningún consumidor los cuenta por separado — pero `url` apunta aquí, que es
  // la página que se está sirviendo.
  const personSchema = buildPerson({ author, url: canonical, imageUrl })

  const productsSchema = buildItemList({
    name: `Productos de ${author.full_name}`,
    items: products.map((p) => ({
      url: `/tienda/p/${p.slug || p.id}`,
      name: p.name,
    })),
  })

  const breadcrumbSchema = buildBreadcrumb([
    { name: 'Inicio', url: '/' },
    { name: 'Tienda', url: '/tienda' },
    { name: author.full_name },
  ])

  return (
    <>
      <JsonLd data={personSchema} />
      <JsonLd data={productsSchema} />
      <JsonLd data={breadcrumbSchema} />
      {/* Encabezado accesible, invisible en pantalla.
          La ficha de artista NO tenía ningún <h1>: un defecto real de
          accesibilidad —un lector de pantalla no podía anunciar de quién era la
          obra— y de posicionamiento. `sr-only` es el mismo patrón que ya usa
          `/eventos/page.js` en este proyecto, así que no introduce una
          convención nueva.

          DÓNDE ESTÁ EL LÍMITE: un único encabezado que nombra la página es
          accesibilidad legítima. Meter aquí la biografía entera, o cualquier
          bloque de texto que el visitante no ve, sería cloaking — Google lo
          descuenta y puede penalizarlo. La biografía viaja por el canal
          previsto para eso: el nodo Person de datos estructurados, unas líneas
          más abajo. */}
      <h1 className="sr-only">{author.full_name}</h1>
      {/* Las mismas obras que alimentan el ItemList de arriba: no se pide
          nada nuevo a la API. Al sembrarlas, sus enlaces `<a href>` pasan a
          existir en el HTML servido, que es lo que permite a un rastreador
          sin JavaScript llegar desde el artista hasta cada obra. */}
      <GalleryMasAuthorContent params={params} initialProducts={products} />
    </>
  )
}
