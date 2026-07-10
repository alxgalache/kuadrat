import React from 'react'
import { DrawGridItem } from 'kuadrat-client'

// Draw (raffle) card for the listing grid: image + "Sorteo" badge, author,
// title and ticket price.
const draw = {
  id: 1,
  name: 'Sorteo solidario',
  price: 25,
  product_preview: { basename: 'dgi-1', product_type: 'art', name: 'Obra sorteada', seller_name: 'Ana Soler' },
}

export const Sorteo = () => (
  <ul style={{ width: 280 }}>
    <DrawGridItem draw={draw} />
  </ul>
)
