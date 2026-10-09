'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useCart } from '@/contexts/CartContext'
import ShippingSelectionModal from '@/components/ShippingSelectionModal'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import { artCartItem, otherCartItem, needsShippingOnAdd } from '@/lib/cartItems'
import { META_CHECKOUT_COPY as COPY } from '@/lib/constants'

/**
 * La cesta que llega desde Instagram o Facebook. `page.js` ya resolvió cada
 * línea en el servidor; aquí se sustituye la cesta por las comprables y se
 * lleva al cajón de compra de siempre.
 *
 * - Se espera a `isInitialized`. Los efectos del hijo se ejecutan antes que los
 *   del proveedor: vaciar la cesta antes de que `CartContext` lea
 *   `localStorage` dejaría que la cesta guardada pisara la nueva al cargarse.
 * - Si no hay nada comprable, la cesta no se toca: Meta pide vaciarla para
 *   poner lo elegido, no para dejar al comprador sin nada.
 * - Lo que exige elegir envío al añadirlo (la obra, que no usa Sendcloud) se
 *   añade al elegirlo, con la misma ventana y la misma reutilización por
 *   artista que la ficha. El resto entra al momento y calcula el envío en el
 *   cajón.
 */

const cartItemFor = (line, shipping = null) =>
  line.kind === 'art'
    ? artCartItem(line.product, shipping)
    : otherCartItem(line.product, line.variant, line.quantity, shipping)

const imageUrlFor = (line) => {
  const { basename } = cartItemFor(line)
  if (!basename) return null
  return line.kind === 'art' ? getArtImageUrl(basename) : getOthersImageUrl(basename)
}

const toCents = (amount) => Math.round(Number(amount) * 100)
// El mismo formato de precio que el cajón de compra.
const formatCents = (cents) => `€${(cents / 100).toFixed(2)}`

export default function CestaFromMeta({ lines }) {
  const {
    isInitialized,
    clearCart,
    addToCart,
    isInCart,
    getCartItem,
    getSellerArtShipping,
    getSellerOthersShipping,
  } = useCart()

  const buyable = useMemo(() => lines.filter((line) => line.status === 'buyable'), [lines])
  const notBuyable = useMemo(() => lines.filter((line) => line.status === 'not-buyable'), [lines])
  const unavailable = useMemo(() => lines.filter((line) => line.status === 'unavailable'), [lines])

  const [prepared, setPrepared] = useState(false)
  const preparedRef = useRef(false)
  const [reusedKeys, setReusedKeys] = useState(() => new Set())
  const [modalLine, setModalLine] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    // Una sola vez por visita: StrictMode ejecuta el efecto dos veces, y la
    // cantidad de una variante se sumaría.
    if (!isInitialized || preparedRef.current) return
    preparedRef.current = true
    if (buyable.length > 0) {
      clearCart()
      for (const line of buyable) {
        if (!needsShippingOnAdd(line.kind)) addToCart(cartItemFor(line))
      }
    }
    setPrepared(true)
  }, [isInitialized, buyable, clearCart, addToCart])

  const lineInCart = (line) =>
    isInCart(line.product.id, line.kind, line.kind === 'other' ? line.variant.id : null)

  const sellerShipping = (line) =>
    line.kind === 'art' ? getSellerArtShipping(line.product.seller_id) : getSellerOthersShipping(line.product.seller_id)

  const chooseShipping = (line) => {
    const existing = sellerShipping(line)
    if (existing) {
      addToCart(cartItemFor(line, existing))
      setReusedKeys((prev) => new Set(prev).add(line.key))
      return
    }
    setModalLine(line)
    setModalOpen(true)
  }

  const handleShippingSelected = (shipping) => {
    const line = modalLine
    if (!line) return
    addToCart(cartItemFor(line, shipping))

    // Las demás del mismo artista y tipo que esperan envío toman el mismo,
    // como en la ficha.
    const sameSeller = buyable.filter(
      (other) =>
        other.key !== line.key &&
        other.kind === line.kind &&
        needsShippingOnAdd(other.kind) &&
        other.product.seller_id === line.product.seller_id &&
        !lineInCart(other)
    )
    for (const other of sameSeller) addToCart(cartItemFor(other, shipping))
    if (sameSeller.length > 0) {
      setReusedKeys((prev) => {
        const next = new Set(prev)
        for (const other of sameSeller) next.add(other.key)
        return next
      })
    }
  }

  const allInCart = prepared && buyable.length > 0 && buyable.every(lineInCart)
  const subtotalCents = buyable.reduce((sum, line) => sum + toCents(line.product.price) * line.quantity, 0)
  const nothingToBuy = buyable.length === 0

  const openCheckout = () => {
    window.dispatchEvent(new CustomEvent('open-cart-drawer'))
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          {nothingToBuy ? COPY.emptyTitle : COPY.pageTitle}
        </h1>
        <p className="mt-2 text-sm text-gray-600">{nothingToBuy ? COPY.emptyIntro : COPY.intro}</p>

        {buyable.length > 0 && (
          <section className="mt-8">
            <ul role="list" className="divide-y divide-gray-200 border-t border-b border-gray-200">
              {buyable.map((line) => {
                const item = cartItemFor(line)
                const imageUrl = imageUrlFor(line)
                const inCart = prepared && lineInCart(line)
                const shippingName = inCart
                  ? getCartItem(line.product.id, line.kind, line.kind === 'other' ? line.variant.id : null)?.shipping?.methodName
                  : null
                const choosesShipping = needsShippingOnAdd(line.kind)

                return (
                  <li key={line.key} className="flex py-6">
                    <div className="relative size-24 shrink-0 overflow-hidden rounded-md border border-gray-200">
                      {imageUrl && <Image alt={item.name} src={imageUrl} fill className="object-cover" sizes="96px" />}
                    </div>
                    <div className="ml-4 flex min-w-0 flex-1 flex-col">
                      <div className="flex justify-between gap-4 text-base font-medium text-gray-900">
                        <h2 className="min-w-0">
                          <Link href={line.href} className="hover:text-gray-600">
                            {item.name}
                          </Link>
                        </h2>
                        <p className="shrink-0">{formatCents(toCents(item.price) * line.quantity)}</p>
                      </div>
                      {item.sellerName && <p className="mt-1 text-sm text-gray-500">{item.sellerName}</p>}
                      {line.kind === 'other' && <p className="mt-1 text-sm text-gray-500">{item.variantKey}</p>}
                      <p className="mt-1 text-sm text-gray-500">{COPY.quantity(line.quantity)}</p>

                      <div className="mt-2 text-sm">
                        {!choosesShipping && <p className="text-gray-500">{COPY.shippingNext}</p>}
                        {choosesShipping && inCart && (
                          <>
                            <p className="text-gray-700">{COPY.shippingChosen(shippingName || '')}</p>
                            {reusedKeys.has(line.key) && <p className="mt-1 text-xs text-gray-500">{COPY.shippingReused}</p>}
                          </>
                        )}
                        {choosesShipping && !inCart && (
                          <button
                            type="button"
                            onClick={() => chooseShipping(line)}
                            disabled={!prepared}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {COPY.chooseShipping}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="mt-6">
              <div className="flex justify-between text-base font-medium text-gray-900">
                <p>{COPY.subtotal}</p>
                <p>{formatCents(subtotalCents)}</p>
              </div>
              <p className="mt-0.5 text-sm text-gray-500">{COPY.subtotalNote}</p>
              <button
                type="button"
                onClick={openCheckout}
                disabled={!allInCart}
                className="mt-6 flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {COPY.continue}
              </button>
              {!prepared && <p className="mt-2 text-center text-xs text-gray-500">{COPY.preparing}</p>}
              {prepared && !allInCart && (
                <p className="mt-2 text-center text-xs text-amber-600">{COPY.pendingShipping}</p>
              )}
            </div>
          </section>
        )}

        {notBuyable.length > 0 && (
          <ProductLinks title={COPY.notBuyableTitle} intro={COPY.notBuyableIntro} lines={notBuyable} />
        )}

        {unavailable.length > 0 && (
          <ProductLinks title={COPY.unavailableTitle} intro={COPY.unavailableIntro} lines={unavailable} />
        )}

        {nothingToBuy && (
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3">
            <Link
              href="/galeria"
              className="rounded-md bg-black px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-900"
            >
              {COPY.goGallery}
            </Link>
            <Link href="/tienda" className="py-2.5 text-sm font-semibold text-gray-900 hover:text-gray-600">
              {COPY.goStore} <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        )}
      </div>

      {modalLine && (
        <ShippingSelectionModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSelect={handleShippingSelected}
          product={{
            id: modalLine.product.id,
            type: modalLine.kind === 'art' ? 'art' : 'others',
            seller_id: modalLine.product.seller_id,
            seller_name: modalLine.product.seller_full_name,
          }}
        />
      )}
    </div>
  )
}

function ProductLinks({ title, intro, lines }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-600">{intro}</p>
      <ul role="list" className="mt-4 divide-y divide-gray-200 border-t border-b border-gray-200">
        {lines.map((line) => (
          <li key={line.key} className="flex items-center justify-between gap-4 py-4 text-sm">
            <span className="min-w-0 text-gray-900">{line.product ? line.product.name : COPY.unpublished}</span>
            {line.href && (
              <Link href={line.href} className="shrink-0 font-medium text-gray-900 hover:text-gray-600">
                {COPY.viewProduct} <span aria-hidden="true">&rarr;</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
