import React from 'react'
import { StatusBadge } from 'kuadrat-client'

// Each named export is one card cell (rendered with no props). StatusBadge maps
// a Certificate-of-Authenticity status to a colored pill; `type="event"` selects
// the verification-event dictionary, otherwise the tag-status dictionary.

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
)

export const EstadosCertificado = () => (
  <Row>
    <StatusBadge type="tag" value="active" />
    <StatusBadge type="tag" value="revoked" />
    <StatusBadge type="tag" value="lost" />
    <StatusBadge type="tag" value="damaged" />
  </Row>
)

export const EventosVerificacion = () => (
  <Row>
    <StatusBadge type="event" value="ok" />
    <StatusBadge type="event" value="invalid_cmac" />
    <StatusBadge type="event" value="replay" />
    <StatusBadge type="event" value="unknown_tag" />
    <StatusBadge type="event" value="malformed" />
  </Row>
)
