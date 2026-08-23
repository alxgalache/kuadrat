import { notFound } from 'next/navigation'
import {
  fetchAuthor,
  fetchAuthorOtherProducts,
  getAuthorImageUrl,
  getAuthorSocialImage,
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
  const { url: socialImage, landscape } = getAuthorSocialImage(author)
  const socialImageOptimized = socialImageUrl(socialImage)

  return {
    title: `${author.full_name} — productos y ediciones`,
    description: metaDescription,
    alternates: { canonical },
    // La imagen social es la variante APAISADA del artista
    // (`profile_img_mobile`), no el retrato vertical: ver `getAuthorSocialImage`
    // en `lib/serverApi.js` para el porqué de la inversión. Cae al retrato
    // cuando el artista no tiene la segunda, que es el comportamiento anterior.
    //
    // Se sirve por el optimizador de Next: el retrato original medido en
    // producción pesaba 587 KB y **WhatsApp no pinta la vista previa por encima
    // de 500 KB**. Ver `lib/metadata.js`.
    openGraph: buildOpenGraph({
      type: 'profile',
      title: `${author.full_name} | 140d`,
      description: metaDescription,
      path: canonical,
      images: socialImageOptimized
        ? [{ url: socialImageOptimized, alt: author.full_name }]
        : [],
    }),
    // El tipo de tarjeta de X se deriva de la imagen que haya salido:
    // 'summary_large_image' con la apaisada, que es lo que esa tarjeta pide;
    // 'summary' (tarjeta pequeña) cuando se cae al retrato vertical, porque la
    // grande lo recortaría por el centro decapitando a la persona. Sin ninguna
    // imagen se hereda la tarjeta del sitio, apaisada 1200x630, y ahí vuelve a
    // corresponder la grande. Mismo criterio condicional que ya usaba
    // `live/[slug]`.
    twitter: buildTwitter({
      card: socialImageOptimized && !landscape ? 'summary' : 'summary_large_image',
      title: `${author.full_name} | 140d`,
      description: metaDescription,
      images: socialImageOptimized ? [socialImageOptimized] : [],
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

  // Solo la absoluta: la consume el JSON-LD, que leen clientes externos. Ya no
  // se pinta ninguna imagen en esta página.
  //
  // Aquí SÍ es el retrato principal, y no la variante apaisada que usan las
  // vistas previas sociales: `image` de un nodo Person de schema.org identifica
  // a la persona ante un buscador, sin recorte a una proporción fija de por
  // medio, así que la imagen que el artista declaró como principal es la que
  // corresponde. La inversión de `getAuthorSocialImage` existe por la
  // proporción de la tarjeta, que aquí no interviene.
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
