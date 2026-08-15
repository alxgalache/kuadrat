import { fetchAuthor, truncateText, SITE_URL } from '@/lib/serverApi'
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
    return { title: 'Autor no encontrado' }
  }

  const metaDescription = truncateText(
    author.bio || `Productos de ${author.full_name} en 140d. Descubre su colección de productos originales.`,
    160,
  )

  return {
    title: `Productos de ${author.full_name}`,
    description: metaDescription,
    alternates: {
      canonical: `/tienda/autor/${author.slug}`,
    },
    openGraph: {
      title: `Productos de ${author.full_name} | 140d`,
      description: metaDescription,
      url: `${SITE_URL}/tienda/autor/${author.slug}`,
    },
  }
}

export default function GalleryMasAuthorPage({ params }) {
  return <GalleryMasAuthorContent params={params} />
}
