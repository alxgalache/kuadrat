import { fetchAuthor, truncateText, SITE_URL } from '@/lib/serverApi'
import GalleryAuthorContent from './GalleryAuthorContent'

export async function generateMetadata({ params }) {
  const { authorSlug } = await params
  const author = await fetchAuthor(authorSlug)

  if (!author) {
    return { title: 'Autor no encontrado' }
  }

  const metaDescription = truncateText(
    author.bio || `Obras de arte de ${author.full_name} en 140d. Descubre su colección de obras originales.`,
    160,
  )

  return {
    title: `Obras de ${author.full_name}`,
    description: metaDescription,
    alternates: {
      canonical: `/galeria/autor/${author.slug}`,
    },
    openGraph: {
      title: `Obras de ${author.full_name} | 140d`,
      description: metaDescription,
      url: `${SITE_URL}/galeria/autor/${author.slug}`,
    },
  }
}

export default function GalleryAuthorPage({ params }) {
  return <GalleryAuthorContent params={params} />
}
