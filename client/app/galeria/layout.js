import { buildOpenGraph, buildTwitter } from '@/lib/metadata'

const DESCRIPTION =
  'Obras de arte originales: pintura, ilustración, fotografía y arte digital ' +
  'de artistas emergentes y consagrados. Compra arte único directamente del artista.'

export const metadata = {
  title: 'Galería de Arte',
  // 155 caracteres. La anterior medía 175 y Google le cortaba «directamente del
  // artista», que es justo la parte que distingue a esta galería de un
  // intermediario.
  description: DESCRIPTION,
  alternates: {
    canonical: '/galeria',
  },
  // Por `buildOpenGraph`, no por un literal: declarar aquí sólo `title` y
  // `description` borraba el `siteName`, el `locale`, la `url`, el `type` y la
  // imagen del sitio, y el listado se compartía sin ninguna imagen.
  openGraph: buildOpenGraph({
    title: 'Galería de Arte | 140d',
    description: 'Obras de arte originales de artistas emergentes y consagrados: pintura, ilustración, fotografía y arte digital.',
    path: '/galeria',
  }),
  twitter: buildTwitter({
    title: 'Galería de Arte | 140d',
    description: 'Obras de arte originales de artistas emergentes y consagrados: pintura, ilustración, fotografía y arte digital.',
  }),
}

export default function GaleriaLayout({ children }) {
  return children
}
