'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Atiende el `?author=<slug>` heredado de `/galeria` y `/tienda` llevándolo a
 * su URL canónica, `<base>/autor/<slug>`.
 *
 * POR QUÉ EXISTE COMO COMPONENTE APARTE, que es lo único no obvio de este
 * fichero: `useSearchParams()` obliga a Next a sacar a cliente, durante el
 * prerenderizado, TODO lo que cuelgue de la frontera de Suspense que lo
 * envuelve. Mientras la rejilla compartía componente con esta lectura, lo que
 * se horneaba en el HTML no era la rejilla sino el fallback de esa frontera —
 * el propio comentario que había en `page.js` lo documentaba— y ningún dato
 * sembrado desde el servidor podía llegar al HTML.
 *
 * Aislado aquí y envuelto en su propia `<Suspense fallback={null}>`, el coste
 * se paga sólo sobre este componente, que no pinta nada, y la rejilla se
 * prerrenderiza con normalidad.
 *
 * Ya no lo genera ningún enlace de la aplicación —el filtro navega a
 * `/galeria/autor/<slug>` desde hace tiempo—, así que esto cubre marcadores y
 * enlaces externos antiguos. `replace` y no `push`: la URL vieja no debe
 * quedarse en el historial, y para un buscador el destino es la canónica.
 */
export default function LegacyAuthorQueryRedirect({ base }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const authorSlug = searchParams.get('author')

  useEffect(() => {
    if (authorSlug) router.replace(`${base}/autor/${encodeURIComponent(authorSlug)}`)
  }, [authorSlug, base, router])

  return null
}
