import React from 'react'
import { ProductGrid } from 'kuadrat-client'

// The gallery/shop grid. `getImageUrl` is supplied by the host page; here it
// maps a basename to a placeholder photo so the grid looks like a real gallery.
// Rendered full-width (cfg.overrides cardMode: column).

const img = (seed: string) => 'https://picsum.photos/seed/' + encodeURIComponent(seed) + '/600/600'

const products = [
  { id: 1, name: 'Marea baja', slug: 'marea-baja', price: 480, seller_full_name: 'Lucía Fernández', thumbnail_basename: 'kuadrat-art-1' },
  { id: 2, name: 'Composición en azul', slug: 'composicion-azul', price: 1250, seller_full_name: 'Marco Ruiz', thumbnail_basename: 'kuadrat-art-2' },
  { id: 3, name: 'Retrato anónimo', slug: 'retrato-anonimo', price: 320, seller_full_name: 'Ana Soler', thumbnail_basename: 'kuadrat-art-3' },
  { id: 4, name: 'Paisaje urbano', slug: 'paisaje-urbano', price: 760, seller_full_name: 'Diego Marín', thumbnail_basename: 'kuadrat-art-4' },
]

export const Galeria = () => (
  <ProductGrid products={products} getImageUrl={img} baseRoute="/galeria" isFading={false} />
)
