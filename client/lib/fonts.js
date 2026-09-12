import localFont from 'next/font/local'

// Inter, AUTOALOJADA. Sustituye al `@import url('https://fonts.googleapis.com/…')`
// que abría globals.css, que era la peor forma posible de cargar una fuente:
//
//   globals.css (bloquea el render)
//        └── fonts.googleapis.com/css2   ← el escáner de precarga NO lo ve;
//             └── fonts.gstatic.com/…woff2  hay que descargar y parsear el CSS
//                                            para descubrirlo siquiera
//
// Tres saltos serializados y dos orígenes externos, cada uno con su DNS, su TCP
// y su TLS, en la ruta crítica de todas las páginas. Medido en producción sobre
// /tienda: googleapis a 102 ms y gstatic a 111 ms, con el HTML servido a 84 ms.
// Ahora el .woff2 sale del mismo origen, con un <link rel="preload"> que emite
// `next/font` y con la caché inmutable de nginx.
//
// SÓLO EL SUBCONJUNTO `latin`, y es una decisión con datos detrás:
//   · Es exactamente el fichero que producción ya servía: 48.256 bytes,
//     comprobado byte a byte contra la respuesta de gstatic.
//   · Inter en Google Fonts es una fuente VARIABLE: los nueve pesos que pedía
//     el @import (100…900) apuntaban los nueve a esta misma URL. 63 reglas
//     @font-face, 22 KB de CSS, un fichero.
//   · Se analizaron las 495 cadenas del catálogo real en producción (autores,
//     obra y tienda): CERO caracteres fuera de este subconjunto.
//
// Si algún día entra un nombre con Ł, Ş o Č, ese carácter —y sólo ese— se
// pintará con la tipografía de reserva. Para cubrirlo: descargar el .woff2 de
// `latin-ext` de Google (85.068 bytes), añadir un segundo `localFont` con
// `preload: false` y su `unicode-range` en `declarations`, y encadenarlo en
// `tailwind.config.js`. No se hace ahora porque sería precargar o declarar
// 85 KB para un caso que hoy no existe.
export const inter = localFont({
  src: '../assets/fonts/Inter-latin.woff2',

  // Rango del eje `wght` de la fuente variable: cubre de una vez los nueve
  // pesos que antes se declaraban por separado.
  weight: '100 900',
  style: 'normal',
  display: 'swap',

  // Se consume desde `tailwind.config.js` (fontFamily.sans) y desde globals.css.
  variable: '--font-inter',

  // La fuente del cuerpo de todas las páginas: se precarga siempre.
  preload: true,

  // Genera una cara de reserva a partir de Arial con `ascent-override`,
  // `descent-override` y `size-adjust` calculados de las métricas reales de
  // Inter, de modo que el texto no se desplace al cambiar de la reserva a la
  // definitiva. El CSS de Google Fonts NO traía nada de esto.
  adjustFontFallback: 'Arial',

  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
})
