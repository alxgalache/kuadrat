'use client'

// La descripción de la obra en el certificado, saneada por el MISMO
// sanitizador que el resto del sitio.
//
// Este componente importaba `dompurify` a secas y llamaba a `sanitize()` en el
// cuerpo del render. En Node el paquete base exporta una FACTORÍA que necesita
// una ventana: `DOMPurify.sanitize` sencillamente no existe ahí, y la llamada
// reventaba con `sanitize is not a function` — un 500 en `/coa`, es decir, un
// certificado que no se puede verificar con el móvil delante del comprador.
//
// `'use client'` no evitaba nada: el primer render de un componente cliente
// ocurre TAMBIÉN en el servidor. Lo que lo tapaba era otra cosa —el render en
// blanco de `TestAccessGate`, que dejaba sin ejecutar en el servidor todo el
// árbol bajo el layout raíz (2dff522)—. Al arreglarlo, `SafeHTML` recibió el
// cambio a `isomorphic-dompurify` (562bc98) y este fichero se quedó atrás; el
// fallo esperaba a la primera obra CON descripción cuyo certificado se leyera
// en producción.
//
// De ahí que ahora delegue en `SafeHTML` en lugar de repetir la llamada: dos
// sanitizadores es lo que permitió que uno se arreglara y el otro no.

import SafeHTML from '@/components/SafeHTML'

// Constante de módulo obligatoria, no estética: `SafeHTML` memoiza sobre
// `[html, config]`, y un objeto literal aquí se recrearía en cada render
// dejando el memo sin efecto nunca. Mismo motivo que `AUTHOR_BIO_CONFIG`.
//
// La política de etiquetas es la que ya tenía el certificado: texto con
// énfasis, listas y enlaces, nada más.
const COA_DESCRIPTION_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
}

export default function CoaDescription({ html }) {
  return (
    <SafeHTML
      html={html}
      config={COA_DESCRIPTION_CONFIG}
      className="text-sm text-gray-600 leading-relaxed [&_p]:mb-3 [&_p:last-child]:mb-0
                 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4
                 [&_li]:mb-1 [&_strong]:font-semibold [&_em]:italic"
    />
  )
}
