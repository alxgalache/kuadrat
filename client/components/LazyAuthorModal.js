'use client'

import { useOnDemandComponent } from '@/hooks/useOnDemandComponent'

// La biografía del artista se descarga la primera vez que alguien la abre. Hasta
// ahora viajaba en el JavaScript inicial de cada listado, ficha y evento, y con
// ella DOMPurify (vía `SafeHTML`), aunque la inmensa mayoría de las visitas no
// abre ninguna. Mismas props que `AuthorModal`; es un envoltorio y nada más, para
// que los consumidores sólo cambien el import.
const loadAuthorModal = () => import('@/components/AuthorModal')

export default function LazyAuthorModal({ open, onClose, ...props }) {
  const { Component: AuthorModal, open: shown } = useOnDemandComponent(loadAuthorModal, open, onClose)
  if (!AuthorModal) return null
  return <AuthorModal {...props} open={shown} onClose={onClose} />
}
