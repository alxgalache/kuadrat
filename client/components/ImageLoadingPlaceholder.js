/**
 * Indicador de carga sobre el hueco de una imagen.
 *
 * Se pinta DENTRO de la caja que ya estaba reservada y POR DEBAJO del `<Image>`
 * —basta con declararlo antes en el DOM: ambos están posicionados y el último
 * gana—, así que no altera ninguna dimensión y la imagen lo tapa en cuanto se
 * pinta. Va `aria-hidden`: el `<Image>` de encima ya tiene su `alt`, y anunciar
 * «cargando» veinticuatro veces en una rejilla es ruido, no accesibilidad.
 *
 * Los estilos y la animación viven en `client/app/globals.css`. El movimiento
 * reducido se atiende allí, en CSS.
 *
 * `onDark` aclara el trazo para el visor de imagen completa, que no tiene fondo
 * gris sino el telón negro del diálogo.
 */
export default function ImageLoadingPlaceholder({ show, onDark = false }) {
  if (!show) return null

  return (
    <span className={`image-loader${onDark ? ' image-loader--on-dark' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" focusable="false">
        <circle cx="20" cy="20" r="17" />
      </svg>
    </span>
  )
}
