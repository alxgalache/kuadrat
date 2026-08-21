// /tienda no tenía layout propio, así que heredaba el título por defecto de la
// raíz: la sección entera se presentaba a los buscadores como «140d - Galería de
// Arte Online | Compra Arte Original», igual que la portada. /galeria sí tenía
// el suyo desde el principio; esto es la mitad que faltaba del renombrado de
// rutas (spec `navigation-naming`, /galeria/mas → /tienda).
export const metadata = {
  title: 'Tienda de los artistas',
  description:
    'Productos y ediciones creados por los artistas de 140d: obra gráfica, ' +
    'complementos y piezas exclusivas. Compra directa al artista, con envío a toda España.',
  alternates: {
    canonical: '/tienda',
  },
  openGraph: {
    title: 'Tienda de los artistas | 140d',
    description:
      'Productos y ediciones creados por los artistas de 140d: obra gráfica, ' +
      'complementos y piezas exclusivas. Compra directa al artista.',
    url: '/tienda',
  },
}

export default function TiendaLayout({ children }) {
  return children
}
