import React from 'react'
import { BannerNotification } from 'kuadrat-client'

// Bottom-fixed banner. Its content comes from context (stubbed with a sample
// banner for the design-sync bundle). The wrapper's transform creates a
// containing block so the fixed banner anchors inside the card, not the page.
export const Aviso = () => (
  <div style={{ position: 'relative', height: 110, width: '100%', transform: 'translateZ(0)' }}>
    <BannerNotification />
  </div>
)
