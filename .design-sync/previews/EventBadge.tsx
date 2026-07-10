import React from 'react'
import { EventBadge } from 'kuadrat-client'

// Overlay badge for auction vs draw, positioned over a product image.
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: 'relative', width: 240, height: 240, borderRadius: 8, overflow: 'hidden', background: '#d1d5db' }}>
    {children}
  </div>
)

export const Subasta = () => (
  <Frame>
    <EventBadge type="auction" />
  </Frame>
)

export const Sorteo = () => (
  <Frame>
    <EventBadge type="draw" />
  </Frame>
)
