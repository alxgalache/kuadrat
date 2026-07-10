import React from 'react'
import { AuctionGridItem } from 'kuadrat-client'

// Auction card for the listing grid: image mosaic + "Subasta" badge, author,
// title and current/start price (single lot) or item count (collection).
const single = {
  id: 1,
  name: 'Marea baja',
  product_count: 1,
  product_previews: [
    { seller_name: 'Lucía Fernández', name: 'Marea baja', current_price: 1200, start_price: 800, thumbnail_basename: 'agi-1', product_type: 'art' },
  ],
  sellers_summary: [{ sellerId: 1 }],
}

const collection = {
  id: 2,
  name: 'Colección de primavera',
  product_count: 6,
  product_previews: [
    { seller_name: 'Varios artistas', name: 'O1', thumbnail_basename: 'agi-a', product_type: 'art' },
    { name: 'O2', thumbnail_basename: 'agi-b', product_type: 'art' },
    { name: 'O3', thumbnail_basename: 'agi-c', product_type: 'art' },
    { name: 'O4', thumbnail_basename: 'agi-d', product_type: 'art' },
  ],
  sellers_summary: [{ sellerId: 1 }, { sellerId: 2 }],
}

export const ObraUnica = () => (
  <ul style={{ width: 280 }}>
    <AuctionGridItem auction={single} />
  </ul>
)

export const Coleccion = () => (
  <ul style={{ width: 280 }}>
    <AuctionGridItem auction={collection} />
  </ul>
)
