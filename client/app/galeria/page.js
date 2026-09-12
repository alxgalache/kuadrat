import { Suspense } from 'react'
import { fetchArtCatalog } from '@/lib/serverApi'
import { drawOrderSeed } from '@/lib/catalogOrderSeed'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'
import LegacyAuthorQueryRedirect from '@/components/LegacyAuthorQueryRedirect'
import GalleryContent from './GalleryContent'

// ISR. La rejilla se sirve ya construida en el HTML, y se reconstruye cada 5
// minutos. Antes la página era estática pura y el HTML no contenía ni una obra:
// medido en producción, la imagen que marca el LCP no podía ni empezar a
// descargarse hasta los 637 ms, porque dependía de hidratar primero y de que
// respondiera `/api/art` después (341 → 634 ms), con el HTML servido a 76 ms.
//
// `fetchArtCatalog` devuelve `[]` ante cualquier fallo: si la API no responde
// durante `docker build` esta ruta se hornea sin sembrar y el cliente la
// resuelve al montar, exactamente como antes. Un corte de red no puede romper
// un despliegue — mismo criterio que el `generateStaticParams` vacío de las
// fichas.
export const revalidate = 300

export default async function GalleryPage() {
  // La semilla se sortea AQUÍ, en el servidor, y viaja al cliente como prop.
  //
  // No contradice la regla de `lib/catalogOrderSeed.js` («no llamar a
  // drawOrderSeed durante el render»): esa regla protege de que servidor y
  // cliente sorteen valores distintos. Al viajar dentro del HTML, los dos usan
  // literalmente el mismo número, que es la misma solución que se aplicó al
  // vídeo de la portada.
  //
  // Consecuencia asumida: el entrelazado de artistas rota en cada revalidación
  // (5 min) en lugar de en cada visita. Sortearla en el cliente conservaría el
  // azar por visita, pero el visitante vería cómo se rebaraja el catálogo justo
  // después de pintarse y las cuatro imágenes precargadas se tirarían.
  const seed = drawOrderSeed()
  const initialProducts = await fetchArtCatalog(seed, DEFAULT_PAGE_SIZE)

  return (
    <>
      {/* El <h1> es el único de la página y va fuera de cualquier frontera de
          Suspense, para que exista también en el HTML servido. */}
      <h1 className="sr-only">Galería de Arte</h1>
      {/* Aislado en su propia frontera A PROPÓSITO: lee `useSearchParams()`, y
          cualquier cosa dentro de esa frontera desaparece del HTML
          prerrenderizado. Aquí no pinta nada, así que no se pierde nada. */}
      <Suspense fallback={null}>
        <LegacyAuthorQueryRedirect base="/galeria" />
      </Suspense>
      <GalleryContent initialProducts={initialProducts} initialSeed={seed} />
    </>
  )
}
