'use client'

import AuthGuard from '@/components/AuthGuard'
import SellerWallet from '@/components/seller/SellerWallet'

/**
 * `/seller/monedero` — el único hogar del saldo, el botón de cobro y el aviso
 * de Stripe Connect (seller-kind-artist-speaker).
 *
 * Sin `requireSellerKind`: los DOS tipos de vendedor llegan aquí. Un Ponente
 * cobra por sus eventos de pago, que `eventCreditScheduler` acredita en la
 * bolsa `standard_vat`, y esta pantalla es su única vía para verlo y pedir el
 * pago — antes vivía dentro de `/orders`, un menú que ya no se le ofrece.
 */
export default function SellerWalletPage() {
  return (
    <AuthGuard requireRole="seller">
      <SellerWallet />
    </AuthGuard>
  )
}
