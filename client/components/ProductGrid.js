'use client'

import { useState, useMemo, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { PlusIcon } from '@heroicons/react/20/solid'
import { authorsAPI } from '@/lib/api'
import useImageLoaded from '@/hooks/useImageLoaded'
import ImageLoadingPlaceholder from '@/components/ImageLoadingPlaceholder'
import { DEFAULT_PAGE_SIZE, AUTHOR_FILTER_LOADING_COPY } from '@/lib/constants'

// Cuántas imágenes de la rejilla se marcan como prioritarias.
//
// Cuatro, que es exactamente una fila en escritorio (`lg:grid-cols-4`) y dos en
// móvil (`grid-cols-2`): lo que cabe sobre la línea de flotación. `priority`
// no es «cargar más rápido», es «adelantar ESTAS a costa del resto»: añade un
// <link rel="preload"> y pone fetchpriority="high", así que marcar de más
// reparte el ancho de banda entre imágenes que nadie está mirando y retrasa
// justo la que mide el LCP. Next avisa cuando se abusa.
//
// Por qué hacía falta: desde que la ficha de artista sirve su rejilla ya
// renderizada, la primera imagen es el elemento que marca el LCP y llegaba con
// `loading="lazy"`. En /galeria y /tienda la rejilla la sigue pintando el
// navegador —`useSearchParams()` las saca a cliente al prerenderizar—, así que
// allí esto no añade un preload al HTML, pero tampoco estorba.
const IMAGENES_PRIORITARIAS = 4

function ProductGridItem({ product, getImageUrl, baseRoute, onProductOpen, onAuthorClick, priority = false }) {
  const [displayedBasename, setDisplayedBasename] = useState(null)
  const mainBasename = displayedBasename ?? product.thumbnail_basename ?? product.images?.[0]?.basename ?? null
  const detailHref = `${baseRoute}/p/${product.slug}`
  const variationThumbs = product.variation_thumbnails ?? []
  const showVariationsRow = variationThumbs.length >= 2

  // El nombre solo es interactivo si la página ha pasado un manejador Y el
  // producto trae el slug del vendedor, que es la clave con la que se resuelve
  // la ficha del autor. Sin él no hay nada que abrir y un botón muerto es peor
  // que un texto plano.
  const authorClickable = Boolean(onAuthorClick && product.seller_slug)

  // La clave es el basename, no el producto: cambiar de variación cambia la
  // imagen y hay que volver a evaluar si está descargada.
  const loader = useImageLoaded(mainBasename)

  // Marca la instantánea de scroll antes de navegar al detalle. El hook ignora
  // los clics que abren en pestaña nueva.
  const handleOpen = (e) => onProductOpen?.(product.id, e)

  return (
    <li className="inline-flex w-full flex-col text-center" data-product-id={product.id}>
      <div className="group relative">
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-gray-200">
          {/* Antes del <Link> a propósito: el indicador tiene que quedar por
              debajo de la imagen, y entre dos elementos posicionados manda el
              orden del DOM. */}
          <ImageLoadingPlaceholder show={loader.showLoader} />
          {/* `relative` para que la imagen con `fill` se posicione contra el propio
              enlace. Funcionaba igual sin él —se posicionaba contra el div de
              fuera, que mide lo mismo— pero next/image avisaba en desarrollo de
              que su padre directo era `static`. */}
          <Link href={detailHref} aria-label={product.name} className="relative block size-full" onClick={handleOpen}>
            {mainBasename && (
              <Image
                ref={loader.ref}
                alt={product.name}
                src={getImageUrl(mainBasename)}
                fill
                className="object-cover [@media(hover:hover)]:group-hover:opacity-75"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                priority={priority}
                onLoad={loader.onLoad}
                onError={loader.onError}
              />
            )}
          </Link>
          {showVariationsRow && (
            <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5">
              <span className="rounded-full bg-white/80 p-1.5" aria-hidden="true">
                <PlusIcon className="size-4 text-gray-700" />
              </span>
              {variationThumbs.map((thumb) => (
                <button
                  key={thumb.id}
                  type="button"
                  title={thumb.key}
                  aria-label={`Mostrar variación ${thumb.key}`}
                  onClick={(e) => { e.stopPropagation(); setDisplayedBasename(thumb.basename) }}
                  className="size-8 overflow-hidden rounded-sm ring-1 ring-white/80 transition-transform hover:scale-110 focus:outline-2 focus:outline-offset-1 focus:outline-black"
                >
                  <Image
                    src={getImageUrl(thumb.basename)}
                    alt={thumb.key}
                    width={32}
                    height={32}
                    sizes="32px"
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-6">
          {/* El subrayado se limita a `hover:hover`: en táctil el estado hover
              queda "pegado" tras el tap y el nombre se quedaría subrayado sin
              que nada lo esté señalando, igual que en la imagen de arriba. */}
          <p className="text-sm text-gray-500">
            {authorClickable ? (
              <button
                type="button"
                onClick={() => onAuthorClick(product)}
                className="rounded-sm underline-offset-2 [@media(hover:hover)]:hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                {product.seller_full_name}
              </button>
            ) : (
              product.seller_full_name
            )}
          </p>
          <h3 className="mt-1 font-semibold text-gray-900">
            <Link href={detailHref} onClick={handleOpen}>{product.name}</Link>
          </h3>
          <p className="mt-1 text-gray-900">€{product.price.toFixed(2)}</p>
        </div>
      </div>
    </li>
  )
}

// Anchuras de las barras de texto del esqueleto: autor, título y precio. Las del
// destino no se conocen hasta que llega, así que salen de un patrón fijo que se
// recorre por índice. Nunca al azar en el render: cualquier re-render durante la
// espera volvería a sortear y las barras temblarían. Cinco patrones con dos y
// con cuatro columnas: dos celdas apiladas nunca repiten el mismo.
const ANCHOS_ESQUELETO = [
  ['w-1/2', 'w-3/4', 'w-1/3'],
  ['w-2/5', 'w-3/5', 'w-1/4'],
  ['w-3/5', 'w-4/5', 'w-1/3'],
  ['w-1/2', 'w-2/3', 'w-1/4'],
  ['w-2/5', 'w-3/4', 'w-1/3'],
]

/**
 * Celda en espera de la navegación del filtro de autor.
 *
 * Mismo `<li>` y mismo bloque que `ProductGridItem`, así que la caja coincide:
 * el cuadrado tiene el tamaño y el redondeo del hueco de la imagen, y el bloque
 * de texto conserva el `mt-6` y una caja por línea con la altura de la línea
 * real (`text-sm` → 20 px para el autor, `text-base` → 24 px para el título y el
 * precio, con sus `mt-1`). Dentro de cada caja, una barra centrada más baja que
 * la línea. Coincide con la celda cuyos textos caben en una línea. Un nombre o
 * un título que salta de línea hace la celda real más alta (a 1024 px, con
 * celdas de 148 px, pasa con los largos), y eso no se puede saber antes de que
 * llegue el destino.
 */
function ProductGridItemSkeleton({ index }) {
  const [autor, titulo, precio] = ANCHOS_ESQUELETO[index % ANCHOS_ESQUELETO.length]

  return (
    <li className="inline-flex w-full flex-col text-center" aria-hidden="true">
      <div className="relative">
        <div className="skeleton aspect-square w-full rounded-md" />
        <div className="mt-6">
          <div className="flex h-5 items-center justify-center">
            <div className={`skeleton h-3 rounded ${autor}`} />
          </div>
          <div className="mt-1 flex h-6 items-center justify-center">
            <div className={`skeleton h-3.5 rounded ${titulo}`} />
          </div>
          <div className="mt-1 flex h-6 items-center justify-center">
            <div className={`skeleton h-3.5 rounded ${precio}`} />
          </div>
        </div>
      </div>
    </li>
  )
}

/**
 * Rejilla de productos.
 *
 * `authors` y `onViewAuthorBio` son opcionales y van juntos: sin ellos el
 * nombre del artista se pinta como texto plano (es lo que hace, por ejemplo,
 * cualquier consumidor que no tenga a mano el listado de autores).
 *
 * La resolución del autor mira primero el listado que ya tiene la página —el
 * mismo que alimenta los badges de filtro, así que el modal abre sin esperar a
 * la red— y solo cae en `authorsAPI.getBySlug` si el autor todavía no está: el
 * listado y los productos se cargan en peticiones independientes y durante ese
 * hueco un clic no puede quedarse sin respuesta.
 *
 * `pending` sustituye las celdas por `DEFAULT_PAGE_SIZE` celdas de esqueleto
 * DENTRO del mismo `<ul>`, mientras dura la navegación del filtro de autor (ver
 * `useAuthorFilterNavigation`): las columnas, las separaciones y los márgenes
 * son los de la rejilla real porque son los mismos nodos. Doce es el máximo que
 * puede pintar la primera página de cualquier destino. `variant` (`art` u
 * `other`) elige el texto del anuncio para lectores de pantalla.
 */
export default function ProductGrid({
  products,
  isFading,
  getImageUrl,
  baseRoute,
  onProductOpen,
  authors,
  onViewAuthorBio,
  pending = false,
  variant = 'art',
}) {
  const authorsBySlug = useMemo(() => {
    const map = new Map()
    for (const author of authors ?? []) map.set(author.slug, author)
    return map
  }, [authors])

  const handleAuthorClick = useCallback(async (product) => {
    const known = authorsBySlug.get(product.seller_slug)
    if (known) {
      onViewAuthorBio(known)
      return
    }

    try {
      const data = await authorsAPI.getBySlug(product.seller_slug)
      if (data?.author) onViewAuthorBio(data.author)
    } catch (err) {
      console.error('Failed to load author:', err)
    }
  }, [authorsBySlug, onViewAuthorBio])

  return (
    <div className="relative">
      {/* Siempre montada y vacía fuera de la espera: una región viva que nace
          con el texto ya puesto no la anuncian todos los lectores. Un único
          anuncio para toda la rejilla, no uno por celda. */}
      <p role="status" className="sr-only">
        {pending ? (AUTHOR_FILTER_LOADING_COPY[variant] ?? AUTHOR_FILTER_LOADING_COPY.art) : ''}
      </p>
      <div
        className="relative w-full transition-opacity duration-300"
        style={{ opacity: isFading ? 0 : 1 }}
      >
        <ul
          role="list"
          className="px-6 grid grid-cols-2 gap-4 sm:px-6 sm:gap-8 lg:px-0 lg:grid-cols-4"
        >
          {pending
            ? Array.from({ length: DEFAULT_PAGE_SIZE }, (_, i) => (
                <ProductGridItemSkeleton key={i} index={i} />
              ))
            : products.map((product, i) => (
                <ProductGridItem
                  key={product.id}
                  product={product}
                  getImageUrl={getImageUrl}
                  baseRoute={baseRoute}
                  onProductOpen={onProductOpen}
                  onAuthorClick={onViewAuthorBio ? handleAuthorClick : null}
                  priority={i < IMAGENES_PRIORITARIAS}
                />
              ))}
        </ul>
      </div>
    </div>
  )
}
