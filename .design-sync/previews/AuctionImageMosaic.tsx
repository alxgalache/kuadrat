import React from 'react'
import { AuctionImageMosaic } from 'kuadrat-client'

// Composite image for an auction lot: 1 image, 2 (offset), or a 4-up grid with
// a "+N" overflow tile. Images resolve through the stubbed helper to photos.
const p = (name: string, seed: string) => ({ name, thumbnail_basename: seed, product_type: 'art' })

const six = [p('Obra 1', 'mz1'), p('Obra 2', 'mz2'), p('Obra 3', 'mz3'), p('Obra 4', 'mz4'), p('Obra 5', 'mz5')]

export const ObraUnica = () => <AuctionImageMosaic products={[p('Marea baja', 'mzsolo')]} productCount={1} />
export const Coleccion = () => <AuctionImageMosaic products={six} productCount={6} />
