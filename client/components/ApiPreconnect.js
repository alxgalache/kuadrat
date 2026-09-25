import { preconnect } from 'react-dom'

// `preconnect` hacia la API, SOLO para las rutas que la consultan durante la
// carga: `/eventos` y `/live` con sus fichas (desde sus layouts) y las dos
// fichas de artista (desde su página). Medido cargando cada ruta pública. No
// va en el layout raíz a propósito: la portada, los listados y las fichas de
// obra ya no piden nada a la API al cargar, y un `preconnect` global les abriría una
// conexión TLS inútil en plena ventana crítica —Lighthouse lo marca, además,
// como no usado—.
//
// `crossOrigin: 'anonymous'` no es opcional. `lib/api.js` llama a `fetch` con el
// modo de credenciales por defecto (`same-origin`), así que sus peticiones a
// otro origen van sin credenciales y el navegador las sirve desde el grupo de
// conexiones anónimas. Un `preconnect` sin `crossorigin` abriría una conexión
// del otro grupo que ninguna de ellas usaría.
//
// Componente de servidor: `preconnect` de React emite el <link> en el <head>
// del HTML servido. No pinta nada.
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').origin

export default function ApiPreconnect() {
  preconnect(API_ORIGIN, { crossOrigin: 'anonymous' })
  return null
}
