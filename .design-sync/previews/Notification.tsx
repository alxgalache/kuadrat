import React from 'react'
import { Notification } from 'kuadrat-client'

// Toast stack (success / info / error). Notifications come from context
// (stubbed with samples for the design-sync bundle). The wrapper's transform
// creates a containing block so the fixed, bottom-aligned toasts anchor inside
// the card.
export const Toasts = () => (
  <div style={{ position: 'relative', height: 460, width: '100%', transform: 'translateZ(0)' }}>
    <Notification />
  </div>
)
