import Image from 'next/image'

// Dimensiones INTRÍNSECAS de public/brand/140d.svg: 494,243 × 135,467 mm, que
// el navegador resuelve a 1868 × 512 px (naturalWidth/naturalHeight) con una
// proporción de 3,6484.
//
// Es lo que `next/image` espera en width/height —el tamaño real del recurso, no
// el tamaño al que se pinta— y no es decorativo: hasta que el SVG carga, el
// navegador reserva la caja con la proporción de ESOS DOS ATRIBUTOS. Los nueve
// sitios que antes pintaban el logo declaraban tres proporciones distintas
// (5,00 en la navbar y las páginas legales, 3,75 en el diálogo móvil, 4,00 en
// la home y /autores) y ninguna era la buena, así que el logo se encogía de 120
// a 87,56 px al cargar y arrastraba consigo la fila entera de la navbar.
// Medido: era el único layout shift de /galeria.
//
// El tamaño al que se pinta lo decide `className` (h-6 w-auto, h-8 w-auto…);
// `w-auto` es obligatorio en quien use este componente.
const LOGO_INTRINSIC_WIDTH = 1868
const LOGO_INTRINSIC_HEIGHT = 512

/**
 * El logotipo de 140d. Única fuente de la ruta, las dimensiones y el texto
 * alternativo.
 *
 * @param {string} className  Tamaño y colocación. Debe incluir `w-auto`.
 * @param {boolean} priority  `true` sólo si el logo está sobre la línea de
 *   flotación en el primer render. Emite loading="eager", fetchPriority="high"
 *   y un <link rel="preload">; en un logo que sólo aparece al abrir un menú
 *   sería precargar algo que puede no verse nunca.
 * @param {string} alt
 */
export default function BrandLogo({ className, priority = false, alt = '140d Galería de Arte' }) {
  return (
    <Image
      alt={alt}
      src="/brand/140d.svg"
      width={LOGO_INTRINSIC_WIDTH}
      height={LOGO_INTRINSIC_HEIGHT}
      className={className}
      priority={priority}
    />
  )
}
