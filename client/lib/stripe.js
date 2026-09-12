// OJO CON EL `/pure`: NO es un detalle de estilo, es lo único que impide que
// js.stripe.com se descargue en TODAS las páginas del sitio.
//
// El punto de entrada por defecto de @stripe/stripe-js inyecta el script él
// solo, sin condiciones, por el mero hecho de importarlo (v8.8.0,
// dist/index.mjs, literal):
//
//     // Execute our own script injection after a tick to give users time to
//     // do their own script injection.
//     Promise.resolve().then(function () { return getStripePromise(); })
//
// Y la cadena de importación llega a todas partes: ShoppingCartDrawer importa
// este módulo, Navbar importa ShoppingCartDrawer y Navbar vive en el layout
// raíz. Medido en producción sobre /galeria y /tienda: 1.091.743 bytes de
// JavaScript de terceros descargados, parseados y ejecutados en el hilo
// principal en la galería, la tienda, los eventos y las páginas legales —
// compitiendo con la hidratación, que es justo lo que retrasa la llamada a la
// API de la que cuelga la imagen que marca el LCP.
//
// `@stripe/stripe-js/pure` exporta el mismo `loadStripe` SIN ese bloque: el
// script se pide en la primera llamada y no antes.
import { loadStripe } from '@stripe/stripe-js/pure'

let stripePromise = null

export function getStripePromise() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (key) {
      stripePromise = loadStripe(key, {
        locale: 'es',
        developerTools: {
          assistant: {
            enabled: false
          }
        }
      })
    }
  }
  return stripePromise
}

/**
 * Adelanta la descarga de Stripe.js sin esperar a que haya nada que pagar.
 *
 * La contrapartida de `/pure` es que el script ya no está caliente cuando se
 * monta `<Elements>`; con esto se pide en cuanto el visitante abre la cesta o
 * un modal de pago, que son tres pasos antes del formulario, en lugar de en el
 * instante en que hay que pintarlo.
 *
 * No devuelve nada y se traga el fallo a propósito: es una optimización, y el
 * error real —si lo hay— lo volverá a dar `getStripePromise()` cuando de
 * verdad haga falta, con un sitio donde enseñárselo al usuario.
 */
export function prefetchStripe() {
  getStripePromise()?.catch(() => {})
}
