import React from 'react'
import { CoaDescription } from 'kuadrat-client'

// Sanitized rich-text block (DOMPurify) used inside the certificate page.
export const Descripcion = () => (
  <div style={{ maxWidth: 520 }}>
    <CoaDescription html="<p>Óleo sobre lienzo que retrata la calma de la costa atlántica al amanecer. <strong>Pieza única</strong> firmada y fechada por la artista.</p><ul><li>Edición única, no reproducible</li><li>Incluye certificado con etiqueta NFC NTAG 424 DNA</li></ul>" />
  </div>
)
