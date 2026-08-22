import { buildOpenGraph, buildTwitter } from '@/lib/metadata'

const OG_DESCRIPTION =
  'Asiste a eventos de arte en directo: masterclasses, charlas, entrevistas y más. ' +
  'Conecta con artistas desde cualquier lugar.'

export const metadata = {
  title: 'Espacios - Eventos de Arte en Directo',
  description: 'Asiste a eventos de arte en directo: masterclasses, charlas, entrevistas y más. Conecta con artistas desde cualquier lugar. Eventos culturales online en 140d.',
  alternates: {
    canonical: '/live',
  },
  openGraph: buildOpenGraph({
    title: 'Espacios - Eventos de Arte | 140d',
    description: OG_DESCRIPTION,
    path: '/live',
  }),
  twitter: buildTwitter({
    title: 'Espacios - Eventos de Arte | 140d',
    description: OG_DESCRIPTION,
  }),
}

export default function EspaciosLayout({ children }) {
  return children
}
