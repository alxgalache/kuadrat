import { buildOpenGraph, buildTwitter } from '@/lib/metadata'

const OG_DESCRIPTION =
  'Solicita tu registro como artista en 140d. Publica y vende tus obras de arte en nuestra galería online.'

export const metadata = {
  title: 'Contacto - Publica tu Arte',
  description: 'Solicita tu registro como artista en 140d. Publica y vende tus obras de arte en nuestra galería online. Abierto a artistas emergentes y consagrados.',
  alternates: {
    canonical: '/contacto',
  },
  openGraph: buildOpenGraph({
    title: 'Publica tu Arte | 140d',
    description: OG_DESCRIPTION,
    path: '/contacto',
  }),
  twitter: buildTwitter({
    title: 'Publica tu Arte | 140d',
    description: OG_DESCRIPTION,
  }),
}

export default function ContactoLayout({ children }) {
  return children
}
