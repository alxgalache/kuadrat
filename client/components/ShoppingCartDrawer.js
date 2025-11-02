'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useCart } from '@/contexts/CartContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'
import { getArtImageUrl, getOthersImageUrl, ordersAPI } from '@/lib/api'
import CountryCodeSelector from './CountryCodeSelector'

export default function ShoppingCartDrawer({ open, onClose }) {
  const { cart, removeFromCart, updateQuantity, getTotalPrice, getSubtotal, getTotalShipping, clearCart } = useCart()
  const { user } = useAuth()
  const { showBanner } = useBannerNotification()
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)
  const [showContactSelection, setShowContactSelection] = useState(false)
  const [contactMethod, setContactMethod] = useState('email')
  const [contactEmail, setContactEmail] = useState('')
  const [contactCountryCode, setContactCountryCode] = useState('+34')
  const [contactPhone, setContactPhone] = useState('')

  const getImageUrl = (item) => {
    return item.productType === 'art'
      ? getArtImageUrl(item.basename)
      : getOthersImageUrl(item.basename)
  }

  const getProductUrl = (item) => {
    return item.productType === 'art'
      ? `/galeria/p/${item.slug}`
      : `/galeria/mas/p/${item.slug}`
  }

  const handleQuantityChange = (item, newQuantity) => {
    const qty = parseInt(newQuantity, 10)
    if (qty > 0 && qty <= 10) {
      updateQuantity(item.productId, item.productType, qty, item.variantId)
    }
  }

  const handleRemove = (item) => {
    removeFromCart(item.productId, item.productType, item.variantId)
  }

  const handleCheckout = () => {
    // Pre-fill email if user is logged in
    if (user?.email) {
      setContactEmail(user.email)
    }
    // Show contact selection
    setShowContactSelection(true)
  }

  const handleBackToCart = () => {
    setShowContactSelection(false)
  }

  const isContactValid = () => {
    if (contactMethod === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(contactEmail.trim())
    } else if (contactMethod === 'whatsapp') {
      // Phone must be digits only and between 6-15 characters
      const phoneRegex = /^\d{6,15}$/
      return phoneRegex.test(contactPhone.trim())
    }
    return false
  }

  const handleProceedToPayment = async () => {
    if (!isContactValid()) {
      showBanner('Por favor, introduce un contacto válido')
      return
    }

    setIsProcessing(true)
    try {
      // Convert cart items to order items format
      const orderItems = cart.flatMap(item => {
        const baseItem = {
          type: item.productType === 'art' ? 'art' : 'other',
          id: item.productId,
          shipping: item.shipping,
        }

        if (item.productType === 'other') {
          baseItem.variantId = item.variantId
        }

        // Create multiple items for quantity > 1
        return Array(item.quantity).fill(baseItem)
      })

      // Prepare contact data
      const contactData = contactMethod === 'email'
        ? contactEmail.trim()
        : `${contactCountryCode}${contactPhone.trim()}`

      await ordersAPI.create(orderItems, contactData, contactMethod)
      showBanner('¡Compra exitosa! Revisa tu contacto para confirmación.')

      // Clear cart
      clearCart()

      // Reset contact selection state
      setShowContactSelection(false)
      setContactEmail('')
      setContactPhone('')
      setContactMethod('email')

      // Close drawer
      onClose()

      // Redirect based on user authentication
      if (user) {
        router.push('/orders')
      } else {
        router.push('/galeria')
      }
    } catch (err) {
      showBanner(err.message || 'Compra fallida. Por favor, inténtalo de nuevo.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-10">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity duration-500 ease-in-out data-[closed]:opacity-0"
      />

      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
            <DialogPanel
              transition
              className="pointer-events-auto w-screen max-w-md transform transition duration-500 ease-in-out data-[closed]:translate-x-full sm:duration-700"
            >
              <div className="flex h-full flex-col overflow-y-auto bg-white shadow-xl">
                <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                  <div className="flex items-start justify-between">
                    <DialogTitle className="text-lg font-medium text-gray-900">Carrito de compra</DialogTitle>
                    <div className="ml-3 flex h-7 items-center">
                      <button
                        type="button"
                        onClick={onClose}
                        className="relative -m-2 p-2 text-gray-400 hover:text-gray-500"
                      >
                        <span className="absolute -inset-0.5" />
                        <span className="sr-only">Cerrar panel</span>
                        <XMarkIcon aria-hidden="true" className="size-6" />
                      </button>
                    </div>
                  </div>

                  {cart.length === 0 ? (
                    <div className="mt-8 text-center">
                      <p className="text-gray-500">Tu carrito está vacío</p>
                    </div>
                  ) : (
                    <div className="mt-8">
                      <div className="flow-root">
                        <ul role="list" className="-my-6 divide-y divide-gray-200">
                          {cart.map((item) => (
                            <li key={item.id} className="flex py-6">
                              <div className="size-24 shrink-0 overflow-hidden rounded-md border border-gray-200">
                                <img
                                  alt={item.name}
                                  src={getImageUrl(item)}
                                  className="size-full object-cover"
                                />
                              </div>

                              <div className="ml-4 flex flex-1 flex-col">
                                <div>
                                  <div className="flex justify-between text-base font-medium text-gray-900">
                                    <h3>
                                      <Link
                                        href={getProductUrl(item)}
                                        onClick={onClose}
                                        className="hover:text-gray-600"
                                      >
                                        {item.name}
                                      </Link>
                                    </h3>
                                    <p className="ml-4">€{(item.price * item.quantity).toFixed(2)}</p>
                                  </div>
                                  {item.variantKey && (
                                    <p className="mt-1 text-sm text-gray-500">{item.variantKey}</p>
                                  )}
                                  {item.shipping && (
                                    <div className="mt-1 text-sm text-gray-500">
                                      <p>
                                        <span className="font-medium">Envío:</span> {item.shipping.methodName}
                                        {item.shipping.methodType === 'pickup' && ' (Recogida)'}
                                        {' · '}€{item.shipping.cost.toFixed(2)}
                                      </p>
                                      {item.shipping.estimatedDays && (
                                        <p className="text-xs text-gray-400">
                                          Entrega estimada: {item.shipping.estimatedDays} días
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {!item.shipping && (
                                    <p className="mt-1 text-xs text-amber-600">
                                      ⚠ Método de envío no seleccionado
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-1 items-end justify-between text-sm">
                                  {item.productType === 'art' ? (
                                    <p className="text-gray-500">Cantidad: {item.quantity}</p>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <label htmlFor={`quantity-${item.id}`} className="text-gray-500">
                                        Cantidad:
                                      </label>
                                      <select
                                        id={`quantity-${item.id}`}
                                        value={item.quantity}
                                        onChange={(e) => handleQuantityChange(item, e.target.value)}
                                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-black focus:ring-1 focus:ring-black"
                                      >
                                        {[...Array(10)].map((_, i) => (
                                          <option key={i + 1} value={i + 1}>
                                            {i + 1}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}

                                  <div className="flex">
                                    <button
                                      type="button"
                                      onClick={() => handleRemove(item)}
                                      className="font-medium text-black hover:text-gray-600"
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="border-t border-gray-200 px-4 py-6 sm:px-6">
                    {/* Contact Selection - Shows when user clicks "Completar compra" */}
                    {showContactSelection && (
                      <div className="mb-6">
                        <h3 className="text-sm font-medium text-gray-900 mb-3">
                          Elige el medio de contacto y actualizaciones para este pedido
                        </h3>
                        <fieldset aria-label="Contact method" className="-space-y-px rounded-md bg-white">
                          {/* Email Option */}
                          <label
                            className="group flex border border-gray-200 p-4 first:rounded-tl-md first:rounded-tr-md last:rounded-br-md last:rounded-bl-md focus:outline-hidden has-[:checked]:relative has-[:checked]:border-gray-400 has-[:checked]:bg-gray-50"
                          >
                            <input
                              type="radio"
                              name="contact-method"
                              value="email"
                              checked={contactMethod === 'email'}
                              onChange={(e) => setContactMethod(e.target.value)}
                              className="relative mt-0.5 size-4 shrink-0 appearance-none rounded-full border border-gray-300 bg-white before:absolute before:inset-1 before:rounded-full before:bg-white not-checked:before:hidden checked:border-gray-900 checked:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                            />
                            <span className="ml-3 flex flex-col flex-1">
                              <span className="block text-sm font-medium text-gray-900 group-has-[:checked]:text-gray-900">
                                Correo electrónico
                              </span>
                              <span className="block text-sm text-gray-500 group-has-[:checked]:text-gray-700">
                                Recibirás la confirmación por email
                              </span>
                                {contactMethod === 'email' && (
                                <div className="mt-3">
                                  <input
                                    type="email"
                                    placeholder="tu@email.com"
                                    value={contactEmail}
                                    onChange={(e) => setContactEmail(e.target.value)}
                                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black"
                                  />
                                </div>
                                )}
                            </span>
                          </label>

                          {/* WhatsApp Option */}
                          <label
                            className="group flex border border-gray-200 p-4 first:rounded-tl-md first:rounded-tr-md last:rounded-br-md last:rounded-bl-md focus:outline-hidden has-[:checked]:relative has-[:checked]:border-gray-400 has-[:checked]:bg-gray-50"
                          >
                            <input
                              type="radio"
                              name="contact-method"
                              value="whatsapp"
                              checked={contactMethod === 'whatsapp'}
                              onChange={(e) => setContactMethod(e.target.value)}
                              className="relative mt-0.5 size-4 shrink-0 appearance-none rounded-full border border-gray-300 bg-white before:absolute before:inset-1 before:rounded-full before:bg-white not-checked:before:hidden checked:border-gray-900 checked:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                            />
                            <span className="ml-3 flex flex-col flex-1">
                              <span className="block text-sm font-medium text-gray-900 group-has-[:checked]:text-gray-900">
                                WhatsApp
                              </span>
                              <span className="block text-sm text-gray-500 group-has-[:checked]:text-gray-700">
                                Recibirás actualizaciones por WhatsApp
                              </span>
                                {contactMethod === 'whatsapp' && (
                                <div className="mt-3 flex gap-2">
                                  <CountryCodeSelector
                                    value={contactCountryCode}
                                    onChange={setContactCountryCode}
                                  />
                                  <input
                                    type="tel"
                                    placeholder="600123456"
                                    value={contactPhone}
                                    onChange={(e) => {
                                      // Only allow digits
                                      const value = e.target.value.replace(/\D/g, '')
                                      setContactPhone(value)
                                    }}
                                    maxLength="15"
                                    className="block flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black"
                                  />
                                </div>
                                )}
                            </span>
                          </label>
                        </fieldset>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-gray-600">
                        <p>Subtotal productos</p>
                        <p>€{getSubtotal().toFixed(2)}</p>
                      </div>
                      <div className="flex justify-between text-sm text-gray-600">
                        <p>Envío</p>
                        <p>€{getTotalShipping().toFixed(2)}</p>
                      </div>
                      <div className="flex justify-between text-base font-medium text-gray-900 pt-2 border-t border-gray-200">
                        <p>Total</p>
                        <p>€{getTotalPrice().toFixed(2)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">Los impuestos se calcularán según tu ubicación.</p>
                    <div className="mt-6">
                      {!showContactSelection ? (
                        <button
                          onClick={handleCheckout}
                          disabled={isProcessing || cart.some(item => !item.shipping)}
                          className="flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessing ? 'Procesando...' : 'Completar compra'}
                        </button>
                      ) : (
                        <button
                          onClick={handleProceedToPayment}
                          disabled={isProcessing || !isContactValid()}
                          className="flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessing ? 'Procesando...' : 'Ir al pago'}
                        </button>
                      )}
                      {cart.some(item => !item.shipping) && !showContactSelection && (
                        <p className="mt-2 text-xs text-center text-amber-600">
                          Algunos productos no tienen método de envío seleccionado
                        </p>
                      )}
                    </div>
                    <div className="mt-6 flex justify-center text-center text-sm text-gray-500">
                      <p>
                        {showContactSelection ? (
                          <button
                            type="button"
                            onClick={handleBackToCart}
                            className="font-medium text-black hover:text-gray-600"
                          >
                            <span aria-hidden="true">&larr; </span>
                            Atrás
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={onClose}
                            className="font-medium text-black hover:text-gray-600"
                          >
                            Continuar comprando
                            <span aria-hidden="true"> &rarr;</span>
                          </button>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </DialogPanel>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
