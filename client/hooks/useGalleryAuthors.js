import { useState, useEffect } from 'react'
import { authorsAPI } from '@/lib/api'

// `initialAuthors` es la lista que ya resolvió el componente de servidor. Con
// ella el filtro de autores viene completo en el HTML y aquí no se pide nada.
// Pedirla al montar tenía un coste visible además de la petición: en móvil el
// filtro (`AuthorMobileFilter`) se pintaba vacío y crecía al llegar los
// autores, empujando la rejilla hacia abajo. Era todo el CLS de /galeria
// (0,036) y /tienda (0,064). Si la siembra llega vacía —la API falló en el
// servidor—, se pide como antes.
export function useGalleryAuthors(category, authorSlug = null, initialAuthors = null) {
  const sembrados = Array.isArray(initialAuthors) && initialAuthors.length > 0
  const [authors, setAuthors] = useState(sembrados ? initialAuthors : [])
  const [selectedAuthor, setSelectedAuthor] = useState(null)

  useEffect(() => {
    if (sembrados) return
    loadAuthors()
  }, [category])

  useEffect(() => {
    if (authorSlug && authors.length > 0) {
      const author = authors.find(a => a.slug === authorSlug)
      setSelectedAuthor(author || null)
    } else {
      setSelectedAuthor(null)
    }
  }, [authorSlug, authors])

  const loadAuthors = async () => {
    try {
      const authorsData = await authorsAPI.getVisible(category)
      setAuthors(authorsData.authors)
    } catch (err) {
      console.error('Failed to load authors:', err)
    }
  }

  return { authors, selectedAuthor }
}
