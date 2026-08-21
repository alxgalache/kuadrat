// /eventos aloja subastas Y sorteos (ver eventos/subasta/[id] y
// eventos/sorteo/[id]), pero se anunciaba como «Subastas de Arte»: resto del
// renombrado de rutas (spec `navigation-naming`, /subastas → /eventos). Los
// sorteos existen desde entonces y no aparecían en el título ni en la
// descripción de la única página que los lista.
export const metadata = {
  title: 'Subastas y sorteos de arte',
  description:
    'Participa en subastas de arte en directo y en sorteos de obra original de ' +
    'artistas emergentes. Puja en tiempo real o participa en el sorteo: en 140d, ' +
    'en los sorteos solo se cobra a quien resulta ganador.',
  alternates: {
    canonical: '/eventos',
  },
  openGraph: {
    title: 'Subastas y sorteos de arte | 140d',
    description:
      'Subastas de arte en directo y sorteos de obra original de artistas emergentes.',
    url: '/eventos',
  },
}

export default function EventosLayout({ children }) {
  return children
}
