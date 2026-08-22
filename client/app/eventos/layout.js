// /eventos aloja subastas Y sorteos (ver eventos/subasta/[id] y
// eventos/sorteo/[id]), pero se anunciaba como «Subastas de Arte»: resto del
// renombrado de rutas (spec `navigation-naming`, /subastas → /eventos). Los
// sorteos existen desde entonces y no aparecían en el título ni en la
// descripción de la única página que los lista.
import { buildOpenGraph, buildTwitter } from '@/lib/metadata'

const OG_DESCRIPTION =
  'Subastas de arte en directo y sorteos de obra original de artistas emergentes.'

export const metadata = {
  title: 'Subastas y sorteos de arte',
  // 157 caracteres. La anterior medía 203 y Google cortaba justamente la
  // condición que la hacía útil —que en los sorteos sólo se cobra al ganador—,
  // dejando la frase a medias.
  description:
    'Subastas de arte en directo y sorteos de obra original de artistas ' +
    'emergentes. Puja en tiempo real o participa: en los sorteos solo se cobra al ganador.',
  alternates: {
    canonical: '/eventos',
  },
  openGraph: buildOpenGraph({
    title: 'Subastas y sorteos de arte | 140d',
    description: OG_DESCRIPTION,
    path: '/eventos',
  }),
  twitter: buildTwitter({
    title: 'Subastas y sorteos de arte | 140d',
    description: OG_DESCRIPTION,
  }),
}

export default function EventosLayout({ children }) {
  return children
}
