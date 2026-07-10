import React from 'react'
import { Breadcrumbs } from 'kuadrat-client'

// Breadcrumb trail. The leading home link is always rendered; `items` follow.
export const Navegacion = () => (
  <Breadcrumbs
    items={[
      { name: 'Galería', href: '/galeria' },
      { name: 'Lucía Fernández', href: '/galeria/autor/lucia-fernandez' },
      { name: 'Marea baja' },
    ]}
  />
)
