import Image from 'next/image'
import { SafeAuthorBio } from '@/components/SafeHTML'

// Cabecera de la ficha de artista. Componente de SERVIDOR: sin 'use client',
// sin estado, sin efectos. Su contenido viaja en el HTML.
//
// Por qué existe: hasta ahora la ficha de artista no decía en ningún sitio de
// quién era la obra que estabas viendo —salvo el resaltado en la barra lateral—
// y la biografía sólo existía dentro de un modal, es decir, sólo para quien
// ejecuta JavaScript y además hace clic. Un rastreador nunca la veía; un
// visitante, sólo si la buscaba.
//
// No duplica nada del grid: el grid muestra las obras, esto muestra al artista.

export default function ArtistProfileHeader({ author, imageUrl, worksCount }) {
  if (!author) return null

  const bio = (author.bio || '').trim()

  return (
    <header className="mx-auto max-w-7xl px-6 pt-12 lg:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        {imageUrl && (
          <Image
            src={imageUrl}
            alt={author.full_name || 'Artista'}
            width={128}
            height={128}
            className="h-24 w-24 flex-none rounded-full object-cover sm:h-32 sm:w-32"
          />
        )}

        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            {author.full_name}
          </h1>

          {/* Sólo se renderiza lo que existe: nada de etiquetas vacías ni
              guiones de relleno cuando el artista no ha rellenado el campo. */}
          {(author.location || worksCount > 0) && (
            <p className="mt-2 text-sm text-gray-500">
              {[
                author.location,
                worksCount > 0
                  ? `${worksCount} ${worksCount === 1 ? 'obra publicada' : 'obras publicadas'}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          {/* La biografía viene del editor enriquecido del panel, así que es
              HTML, no texto. Pintarla como texto plano dejaba los `<p>` a la
              vista del visitante. `SafeAuthorBio` la sanea con la misma
              configuración que el resto del sitio y, desde que el sanitizador
              es isomórfico, funciona también aquí, en el servidor. */}
          {bio && (
            <SafeAuthorBio
              html={bio}
              className="mt-4 max-w-3xl text-base text-gray-600 [&_p]:mt-4 [&_p:first-child]:mt-0"
            />
          )}
        </div>
      </div>
    </header>
  )
}
