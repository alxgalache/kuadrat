import React from 'react'
import { CoaSuccess } from 'kuadrat-client'

// Full-page result shown when a Certificate of Authenticity (NTAG 424 DNA tap)
// verifies. Rendered in a single, tall card (see cfg.overrides). The artwork
// image resolves through the stubbed image helper to a placeholder photo.

const art = {
  basename: 'coa-marea-baja',
  name: 'Marea baja',
  artistName: 'Lucía Fernández',
  description:
    '<p>Óleo sobre lienzo que retrata la calma de la costa atlántica al amanecer. <strong>Pieza única</strong> firmada y fechada por la artista.</p><ul><li>Edición única, no reproducible</li><li>Certificado con etiqueta NFC NTAG 424 DNA</li></ul>',
  type: 'Óleo sobre lienzo',
  dimensions: '80 × 100 cm',
}

export const Verificado = () => <CoaSuccess art={art} counter={3} />
