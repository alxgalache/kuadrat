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
    <div className="overflow-hidden rounded-2xl aspect-[1/1] max-h-[100vh] w-auto">
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
