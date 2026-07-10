import React from 'react'
import { ProductImageCarousel } from 'kuadrat-client'

// Square image carousel with prev/next controls (shown when >1 image). Images
// resolve through the stubbed helper to placeholder photos.
const images = [{ basename: 'car-1' }, { basename: 'car-2' }, { basename: 'car-3' }]

export const Carrusel = () => <ProductImageCarousel images={images} imageType="art" name="Marea baja" />
