// `noindex` deliberado: resultado de pago. Está también en el
// Disallow de robots.txt, pero robots.txt sólo impide el rastreo — una URL
// enlazada desde fuera puede aparecer listada igualmente. Esta etiqueta es la
// que impide la indexación.
export const metadata = {
  title: 'Confirmación de pedido',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function OrderConfirmationLayout({ children }) {
  return children
}
