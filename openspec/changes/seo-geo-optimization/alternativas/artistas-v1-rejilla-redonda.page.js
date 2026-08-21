import Image from 'next/image'
import Link from 'next/link'
import {
  fetchAuthors,
  getAuthorImageUrl,
  getAuthorImageDisplayUrl,
  SITE_URL,
} from '@/lib/serverApi'
import JsonLd from '@/components/JsonLd'
import { buildItemList, buildBreadcrumb, buildPerson, stripHtml } from '@/lib/schema'

// Índice público de artistas.
//
// Hasta ahora NO existía ninguna página que los listara: a la ficha de un
// artista sólo se llegaba filtrando el listado por una query string, así que
// eran páginas huérfanas —sin un solo enlace interno estable que apuntara a
// ellas— y un rastreador sólo las descubría por el sitemap.
//
// Componente de servidor puro: sin estado, sin efectos, todo el contenido en el
// HTML.
export const revalidate = 300

export const metadata = {
  title: 'Artistas',
  description:
    'Los artistas de 140d: arte contemporáneo emergente español. Conoce su ' +
    'trayectoria y descubre su obra original disponible, con envío a toda España.',
  alternates: { canonical: '/galeria/artistas' },
  openGraph: {
    title: 'Artistas | 140d',
    description:
      'Los artistas de 140d: arte contemporáneo emergente español. Conoce su trayectoria y su obra.',
    url: `${SITE_URL}/galeria/artistas`,
  },
}

function excerpt(bio, max = 220) {
  const plain = stripHtml(bio)
  if (!plain) return ''
  if (plain.length <= max) return plain
  return `${plain.slice(0, max - 1).trimEnd()}…`
}

export default async function ArtistasPage() {
  // `category=art` limita a los artistas con al menos una obra publicada y
  // aprobada: un artista dado de alta pero sin obra visible daría una ficha
  // vacía, y enlazarla desde aquí sería crear una página sin contenido.
  const authors = await fetchAuthors('art')

  const listSchema = buildItemList({
    name: 'Artistas de 140d',
    items: authors
      .filter((a) => a.slug)
      .map((a) => ({ url: `/galeria/autor/${a.slug}`, name: a.full_name })),
  })

  const breadcrumbSchema = buildBreadcrumb([
    { name: 'Inicio', url: '/' },
    { name: 'Galería', url: '/galeria' },
    { name: 'Artistas' },
  ])

  return (
    <div className="bg-white">
      <JsonLd data={listSchema} />
      <JsonLd data={breadcrumbSchema} />
      {/* Un nodo Person por artista, con su biografía. Es lo que permite a un
          motor generativo responder «¿quién expone en 140d?» citando a cada uno
          con su enlace, en lugar de resumir una lista de nombres sueltos. */}
      {authors
        .filter((a) => a.slug)
        .map((a) => (
          <JsonLd
            key={a.slug}
            data={buildPerson({
              author: a,
              url: `/galeria/autor/${a.slug}`,
              imageUrl: getAuthorImageUrl(a.profile_img),
            })}
          />
        ))}

      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          Artistas
        </h1>
        <p className="mt-4 max-w-3xl text-base text-gray-600">
          140d reúne a artistas contemporáneos emergentes que trabajan en España.
          No ponemos límites de disciplina: cada uno publica y gestiona su obra
          directamente, y tú compras sabiendo quién hay detrás de cada pieza.
        </p>

        {authors.length === 0 ? (
          <p className="mt-12 text-base text-gray-600">
            Todavía no hay artistas con obra publicada. Vuelve pronto.
          </p>
        ) : (
          <ul role="list" className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {authors
              .filter((a) => a.slug)
              .map((author) => {
                // La de VISUALIZACIÓN, no la absoluta: en desarrollo el
                // optimizador de Next no puede descargar de `localhost:3001`.
                // La absoluta se sigue usando arriba, en el JSON-LD.
                const imageUrl = getAuthorImageDisplayUrl(author.profile_img)
                const bio = excerpt(author.bio)

                return (
                  <li key={author.slug}>
                    <Link
                      href={`/galeria/autor/${author.slug}`}
                      className="group block"
                    >
                      {imageUrl && (
                        <Image
                          src={imageUrl}
                          alt={author.full_name}
                          width={320}
                          height={320}
                          className="mb-4 h-40 w-40 rounded-full object-cover"
                        />
                      )}
                      <h2 className="text-lg font-semibold text-gray-900 group-hover:text-gray-600">
                        {author.full_name}
                      </h2>
                      {author.location && (
                        <p className="mt-1 text-sm text-gray-500">{author.location}</p>
                      )}
                      {bio && <p className="mt-2 text-sm text-gray-600">{bio}</p>}
                      <span className="mt-3 inline-block text-sm font-medium text-gray-900">
                        Ver su obra <span aria-hidden="true">→</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
          </ul>
        )}
      </div>
    </div>
  )
}
