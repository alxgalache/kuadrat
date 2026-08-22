// /tienda no tenía layout propio, así que heredaba el título por defecto de la
// raíz: la sección entera se presentaba a los buscadores como «140d - Galería de
// Arte Online | Compra Arte Original», igual que la portada. /galeria sí tenía
// el suyo desde el principio; esto es la mitad que faltaba del renombrado de
// rutas (spec `navigation-naming`, /galeria/mas → /tienda).
import { buildOpenGraph, buildTwitter } from '@/lib/metadata'

const OG_DESCRIPTION =
  'Productos y ediciones creados por los artistas de 140d: obra gráfica, ' +
  'complementos y piezas exclusivas. Compra directa al artista.'

export const metadata = {
  title: 'Tienda de los artistas',
  description:
    'Productos y ediciones creados por los artistas de 140d: obra gráfica, ' +
    'complementos y piezas exclusivas. Compra directa al artista, con envío a toda España.',
  alternates: {
    canonical: '/tienda',
  },
  // `url` sola no bastaba: al declarar `openGraph` se perdían `siteName`,
  // `locale`, `type` y la imagen. Ver `lib/metadata.js`.
  openGraph: buildOpenGraph({
    title: 'Tienda de los artistas | 140d',
    description: OG_DESCRIPTION,
    path: '/tienda',
  }),
  twitter: buildTwitter({
    title: 'Tienda de los artistas | 140d',
    description: OG_DESCRIPTION,
  }),
}

export default function TiendaLayout({ children }) {
  return children
}
