import Link from 'next/link'

// Enlaces dentro del texto de las guías, con sintaxis tipo Markdown:
//
//     [texto del enlace](/ruta)
//
// Por qué así y no HTML: los párrafos de `guideContent.js` se escriben a mano,
// y aceptar HTML obligaría a sanearlo (una dependencia y una superficie de
// ataque) o a confiar en que nadie se equivoque. Con esta sintaxis el texto
// sigue siendo texto: aquí se construyen elementos de React, nunca se inyecta
// HTML, así que no hay `dangerouslySetInnerHTML` por medio.
//
// Los mismos párrafos alimentan el `FAQPage` de datos estructurados, donde un
// `[texto](/ruta)` en crudo sería basura servida a los buscadores. Por eso hay
// DOS funciones y las dos tienen que usarse: `renderInlineLinks` para pintar y
// `stripInlineLinks` para el JSON-LD.

// La expresión se construye dentro de cada función a propósito: una constante
// de módulo con la bandera `g` conserva `lastIndex` entre llamadas, y la
// segunda invocación empezaría a buscar por donde acabó la primera — un fallo
// intermitente que depende del orden en que se rendericen los párrafos.
function linkPattern() {
  return /\[([^\]]+)\]\(([^)\s]+)\)/g
}

// Lista blanca de destinos. No es paranoia gratuita: sin ella, un `javascript:`
// escrito por error (o copiado de cualquier sitio) se convertiría en un enlace
// ejecutable. Se admiten rutas internas, https y mailto; nada más.
function isSafeHref(href) {
  return href.startsWith('/') || href.startsWith('https://') || href.startsWith('mailto:')
}

const LINK_CLASS = 'font-medium text-gray-900 underline'

/**
 * Convierte el texto en nodos de React, transformando `[texto](destino)` en
 * enlaces. Devuelve la cadena tal cual si no hay ninguno.
 *
 * Un destino no permitido, o una sintaxis mal escrita, se dejan como texto
 * visible en lugar de descartarse en silencio: así el fallo se ve al revisar la
 * página, que es cuando se puede corregir.
 */
export function renderInlineLinks(text) {
  if (typeof text !== 'string' || text === '') return text

  const re = linkPattern()
  const nodes = []
  let last = 0
  let key = 0
  let m

  while ((m = re.exec(text)) !== null) {
    const [full, label, href] = m

    if (m.index > last) nodes.push(text.slice(last, m.index))

    if (!isSafeHref(href)) {
      nodes.push(full)
    } else if (href.startsWith('/')) {
      // Ruta interna: `next/link` para que la navegación no recargue la página
      // y para que el prefetch funcione.
      nodes.push(
        <Link key={key++} href={href} className={LINK_CLASS}>
          {label}
        </Link>,
      )
    } else {
      nodes.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          {label}
        </a>,
      )
    }

    last = m.index + full.length
  }

  if (nodes.length === 0) return text
  if (last < text.length) nodes.push(text.slice(last))

  return nodes
}

/**
 * Deja sólo el texto del enlace, descartando el destino. Es la versión que va a
 * los datos estructurados y a cualquier sitio que necesite texto plano.
 */
export function stripInlineLinks(text) {
  if (typeof text !== 'string') return ''
  return text.replace(linkPattern(), '$1')
}
