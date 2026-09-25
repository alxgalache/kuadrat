/**
 * Vídeo decorativo de la portada.
 *
 * Componente de servidor y sin estado a propósito. Antes elegía el vídeo con
 * `Math.random()` dentro de un inicializador de `useState`, lo cual funcionaba
 * solo porque el árbol no se renderizaba en el servidor: desde que la portada
 * se sirve renderizada, servidor y cliente sortearían vídeos distintos y React
 * encontraría un `src` que no coincide — una discrepancia de hidratación que
 * además NO se corrige sola, porque React no reescribe los atributos que no
 * cuadran.
 *
 * El sorteo vive ahora en `app/page.js`, que es quien ya trae la lista. La
 * portada es estática con revalidación, así que el vídeo es el mismo para todos
 * los visitantes hasta la siguiente revalidación (una hora) en lugar de cambiar
 * en cada carga. Para un elemento decorativo es un intercambio razonable: a
 * cambio el vídeo viaja en el HTML inicial en vez de aparecer al hidratar.
 */
export default function StoryVideo({ video }) {
  if (!video) return null

  return (
    // `w-full max-w-[720px]` y no `w-auto`. Dentro del `flex justify-center`
    // de la portada, `w-auto` tomaba el ancho del tamaño INTRÍNSECO del
    // <video>, que es 300 × 150 hasta que llegan sus metadatos y 720 × 720
    // después (las historias son `sq720`): el recuadro nacía estrecho, crecía
    // y se recolocaba — un CLS de 0,04. Con el ancho fijado por la columna y
    // topado en 720 el resultado final es el mismo en todos los anchos, pero
    // existe desde el primer pintado.
    <div className="overflow-hidden rounded-2xl aspect-[1/1] max-h-[100vh] w-full max-w-[720px]">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="h-full w-full object-cover pointer-events-none"
        src={video.url}
      />
    </div>
  )
}
