import { useState, useEffect } from 'react'
import { authorsAPI } from '@/lib/api'

export function useGalleryAuthors(category, authorSlug = null) {
  const [authors, setAuthors] = useState([])
  const [selectedAuthor, setSelectedAuthor] = useState(null)

  useEffect(() => {
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
