import Image from 'next/image'
import Link from 'next/link'
import {
  fetchAuthors,
  fetchAuthorArtProducts,
  getAuthorImageUrl,
  getAuthorImageDisplayUrl,
  SITE_URL,
} from '@/lib/serverApi'
import JsonLd from '@/components/JsonLd'
import { buildItemList, buildBreadcrumb, buildPerson } from '@/lib/schema'

// Índice público de artistas.
//
// Hasta ahora NO existía ninguna página que los listara: a la ficha de un
// artista sólo se llegaba filtrando el listado por una query string, así que
// eran páginas huérfanas —sin un solo enlace interno estable que apuntara a
// ellas— y un rastreador sólo las descubría por el sitemap.
//
// Componente de servidor puro: sin estado, sin efectos, todo el contenido en el
// HTML.
//
// DISEÑO: retrato en proporción 3:4 y cuatro por fila en escritorio, que es
// exactamente la retícula de `ProductGrid` (`grid-cols-2 … lg:grid-cols-4`).
// También comparte su vocabulario visual: `rounded-md`, `bg-gray-200` de fondo
// mientras carga, y atenuado por opacidad al pasar el puntero, limitado a
// `hover:hover` porque en táctil ese estado se queda pegado tras el toque. La
// idea es que la página no parezca de otro sitio: el visitante ya conoce esta
// rejilla del listado de obras.
//
// `sizes` va atado al número de columnas: con cuatro por fila cada retrato
// ocupa ~25vw. Si se cambia la retícula y se olvida este valor, el navegador
// sigue eligiendo del srcset una variante mayor de la que necesita.
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

export default async function ArtistasPage() {
  // `category=art` limita a los artistas con al menos una obra publicada y
  // aprobada: un artista dado de alta pero sin obra visible daría una ficha
  // vacía, y enlazarla desde aquí sería crear una página sin contenido.
  const authors = (await fetchAuthors('art')).filter((a) => a.slug)

  // El recuento de obras se pide por artista, en paralelo. Con el catálogo
  // actual son cuatro peticiones que la caché de datos de 300 s absorbe; si la
  // nómina creciera mucho, este es el punto a revisar.
  const counts = await Promise.all(
    authors.map((a) => fetchAuthorArtProducts(a.slug).then((w) => w.length).catch(() => 0)),
  )

  const listSchema = buildItemList({
    name: 'Artistas de 140d',
    items: authors.map((a) => ({ url: `/galeria/autor/${a.slug}`, name: a.full_name })),
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
      {/* Un nodo Person por artista, con su biografía completa. Es lo que
          permite a un motor generativo responder «¿quién expone en 140d?»
          citando a cada uno con su enlace, en lugar de resumir una lista de
          nombres sueltos. La biografía viaja aquí, no en la tarjeta: la tarjeta
          es para mirar, esto es para leerlo una máquina. */}
      {authors.map((a) => (
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
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-gray-900 sm:text-4xl">
            Artistas
          </h1>
          <p className="mt-4 text-base text-gray-600">
            Arte contemporáneo emergente hecho en España. Cada artista publica y
            gestiona su obra directamente: compras sabiendo quién hay detrás de
            cada pieza.
          </p>
        </div>

        {authors.length === 0 ? (
          <p className="mt-16 text-base text-gray-600">
            Todavía no hay artistas con obra publicada. Vuelve pronto.
          </p>
        ) : (
          <ul
            role="list"
            className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:mt-16 sm:gap-x-8 sm:gap-y-14 lg:grid-cols-4"
          >
            {authors.map((author, i) => {
              const imageUrl = getAuthorImageDisplayUrl(author.profile_img)
              const works = counts[i]

              return (
                <li key={author.slug}>
                  <Link href={`/galeria/autor/${author.slug}`} className="group block">
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-gray-200">
                      {imageUrl && (
                        <Image
                          src={imageUrl}
                          alt={author.full_name}
                          fill
                          sizes="(min-width: 1024px) 25vw, 50vw"
                          className="object-cover transition-opacity duration-200 [@media(hover:hover)]:group-hover:opacity-75"
                        />
                      )}
                    </div>

                    <h2 className="mt-4 text-base font-medium text-gray-900 underline-offset-4 [@media(hover:hover)]:group-hover:underline">
                      {author.full_name}
                    </h2>

                    {/* Ubicación y nº de obras en una sola línea, separadas por
                        un punto medio: el mismo recurso que usa la ficha de
                        pedido y el pie. Se omite lo que no exista, sin dejar
                        separadores sueltos. */}
                    {(author.location || works > 0) && (
                      <p className="mt-1 text-sm text-gray-500">
                        {[
                          author.location,
                          works > 0
                            ? `${works} ${works === 1 ? 'obra' : 'obras'}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
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
