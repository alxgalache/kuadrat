import React from 'react'
import { AuctionBadge } from 'kuadrat-client'

// Overlay badge that sits on a product image (absolutely positioned), so the
// preview places it inside a relative image-sized frame.
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: 'relative', width: 240, height: 240, borderRadius: 8, overflow: 'hidden', background: '#d1d5db' }}>
    {children}
  </div>
)

export const SobreLaObra = () => (
  <Frame>
    <AuctionBadge />
  </Frame>
)
