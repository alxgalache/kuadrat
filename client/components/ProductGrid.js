'use client'

import { useState, useMemo, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { PlusIcon } from '@heroicons/react/20/solid'
import { authorsAPI } from '@/lib/api'

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

  // Marca la instantánea de scroll antes de navegar al detalle. El hook ignora
  // los clics que abren en pestaña nueva.
  const handleOpen = (e) => onProductOpen?.(product.id, e)

  return (
    <li className="inline-flex w-full flex-col text-center" data-product-id={product.id}>
      <div className="group relative">
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-gray-200">
          <Link href={detailHref} aria-label={product.name} className="block size-full" onClick={handleOpen}>
            {mainBasename && (
              <Image
                alt={product.name}
                src={getImageUrl(mainBasename)}
                fill
                className="object-cover [@media(hover:hover)]:group-hover:opacity-75"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                priority={priority}
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
 */
export default function ProductGrid({
  products,
  isFading,
  getImageUrl,
  baseRoute,
  onProductOpen,
  authors,
  onViewAuthorBio,
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
      <div
        className="relative w-full transition-opacity duration-300"
        style={{ opacity: isFading ? 0 : 1 }}
      >
        <ul
          role="list"
          className="px-6 grid grid-cols-2 gap-4 sm:px-6 sm:gap-8 lg:px-0 lg:grid-cols-4"
        >
          {products.map((product, i) => (
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
