'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import Script from 'next/script'
import { inquiriesAPI } from '@/lib/api'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'
import { INQUIRY_FIELD_LIMITS, INQUIRY_COPY } from '@/lib/constants'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

const EMPTY_FORM = { name: '', email: '', phone: '', message: '' }

export default function ArtProductInquiryModal({ open, onClose, product }) {
  const { showBanner } = useBannerNotification()

  const [formData, setFormData] = useState(EMPTY_FORM)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [scriptReady, setScriptReady] = useState(false)

  const widgetContainerRef = useRef(null)
  const widgetIdRef = useRef(null)

  const renderTurnstile = useCallback(() => {
    if (!scriptReady || !open || !TURNSTILE_SITE_KEY) return
    if (!widgetContainerRef.current) return
    if (widgetIdRef.current !== null) return
    if (typeof window === 'undefined' || !window.turnstile) return

    widgetIdRef.current = window.turnstile.render(widgetContainerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: 'always',
      callback: (token) => setTurnstileToken(token),
      'error-callback': () => setTurnstileToken(''),
      'expired-callback': () => setTurnstileToken(''),
      'timeout-callback': () => setTurnstileToken(''),
    })
  }, [scriptReady, open])

  const removeTurnstile = useCallback(() => {
    if (widgetIdRef.current !== null && typeof window !== 'undefined' && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current)
      } catch {
        // ignore — the widget may have been already removed
      }
    }
    widgetIdRef.current = null
    setTurnstileToken('')
  }, [])

  const resetTurnstile = useCallback(() => {
    if (widgetIdRef.current !== null && typeof window !== 'undefined' && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current)
      } catch {
        // ignore
      }
    }
    setTurnstileToken('')
  }, [])

  // Reset transient state and render the widget when the modal opens.
  useEffect(() => {
    if (open) {
      setFormData(EMPTY_FORM)
      setSubmitting(false)
      setTurnstileToken('')
      // Render once the script is ready; if it loads later, the script onLoad
      // also re-attempts via renderTurnstile in its own effect.
      renderTurnstile()
    } else {
      removeTurnstile()
    }
  }, [open, renderTurnstile, removeTurnstile])

  // Re-render the widget when the script finishes loading after the modal is
  // already open.
  useEffect(() => {
    if (open && scriptReady) {
      renderTurnstile()
    }
  }, [open, scriptReady, renderTurnstile])

  // Cleanup on unmount.
  useEffect(() => () => removeTurnstile(), [removeTurnstile])

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const trimmedName = formData.name.trim()
  const trimmedEmail = formData.email.trim()
  const trimmedMessage = formData.message.trim()

  const isValid =
    !!trimmedName &&
    !!trimmedEmail &&
    !!trimmedMessage &&
    !!turnstileToken &&
    !submitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValid || !product) return

    setSubmitting(true)
    try {
      await inquiriesAPI.createArtInquiry({
        productId: product.id,
        name: trimmedName,
        email: trimmedEmail,
        phone: formData.phone.trim() || undefined,
        message: trimmedMessage,
        turnstileToken,
      })
      showBanner(INQUIRY_COPY.bannerSuccess)
      onClose()
    } catch (err) {
      resetTurnstile()
      const code = err?.title || ''
      let message = INQUIRY_COPY.bannerErrorGeneric
      if (err?.status === 429) message = INQUIRY_COPY.bannerErrorRateLimit
      else if (code === 'CAPTCHA_FAILED') message = INQUIRY_COPY.bannerErrorCaptchaFailed
      else if (code === 'CAPTCHA_UNAVAILABLE') message = INQUIRY_COPY.bannerErrorCaptchaUnavailable
      else if (code === 'EMAIL_DELIVERY_FAILED') message = INQUIRY_COPY.bannerErrorEmailDelivery
      else if (code === 'PRODUCT_NOT_FOUND') message = INQUIRY_COPY.bannerErrorProductNotFound
      showBanner(message)
      // When the captcha service itself is unavailable there is nothing the
      // user can do from inside the modal, so close it and drop any state.
      // The form is reset on next open via the open-effect above.
      if (code === 'CAPTCHA_UNAVAILABLE') {
        setFormData(EMPTY_FORM)
        onClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!product) return null

  return (
    <>
      {open && TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setScriptReady(true)}
          onReady={() => setScriptReady(true)}
        />
      )}

      <Dialog open={open} onClose={handleClose} className="relative z-50">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-gray-500/75 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
        />

        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <DialogPanel
              transition
              className="mx-auto max-w-xl w-full rounded-lg bg-white p-6 shadow-xl transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <DialogTitle className="text-lg font-semibold text-gray-900">
                    {INQUIRY_COPY.modalTitle}
                  </DialogTitle>
                  <p className="mt-1 text-sm text-gray-500">{INQUIRY_COPY.modalSubtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-md text-gray-400 hover:text-gray-500"
                  aria-label="Cerrar"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="inquiry-name" className="block text-sm font-medium text-gray-700">
                    {INQUIRY_COPY.labelName}
                  </label>
                  <input
                    id="inquiry-name"
                    type="text"
                    required
                    maxLength={INQUIRY_FIELD_LIMITS.name}
                    value={formData.name}
                    onChange={handleChange('name')}
                    placeholder={INQUIRY_COPY.placeholderName}
                    autoComplete="name"
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 sm:text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label htmlFor="inquiry-email" className="block text-sm font-medium text-gray-700">
                    {INQUIRY_COPY.labelEmail}
                  </label>
                  <input
                    id="inquiry-email"
                    type="email"
                    required
                    maxLength={INQUIRY_FIELD_LIMITS.email}
                    value={formData.email}
                    onChange={handleChange('email')}
                    placeholder={INQUIRY_COPY.placeholderEmail}
                    autoComplete="email"
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 sm:text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label htmlFor="inquiry-phone" className="block text-sm font-medium text-gray-700">
                    {INQUIRY_COPY.labelPhone}
                  </label>
                  <input
                    id="inquiry-phone"
                    type="tel"
                    maxLength={INQUIRY_FIELD_LIMITS.phone}
                    value={formData.phone}
                    onChange={handleChange('phone')}
                    placeholder={INQUIRY_COPY.placeholderPhone}
                    autoComplete="tel"
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 sm:text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label htmlFor="inquiry-message" className="block text-sm font-medium text-gray-700">
                    {INQUIRY_COPY.labelMessage}
                  </label>
                  <textarea
                    id="inquiry-message"
                    required
                    maxLength={INQUIRY_FIELD_LIMITS.message}
                    rows={5}
                    value={formData.message}
                    onChange={handleChange('message')}
                    placeholder={INQUIRY_COPY.placeholderMessage}
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 sm:text-sm outline-none focus:border-gray-900 resize-y"
                  />
                </div>

                <div>
                  <div ref={widgetContainerRef} className="min-h-[65px]" />
                  {!scriptReady && (
                    <p className="text-xs text-gray-500">{INQUIRY_COPY.captchaLoading}</p>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={submitting}
                    className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {INQUIRY_COPY.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={!isValid}
                    className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? INQUIRY_COPY.submitting : INQUIRY_COPY.submit}
                  </button>
                </div>

                <p className="pt-2 text-xs text-gray-500">
                  {INQUIRY_COPY.gdpr}{' '}
                  <a
                    href={INQUIRY_COPY.gdprHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-gray-700 hover:text-gray-500"
                  >
                    {INQUIRY_COPY.gdprLink}
                  </a>
                  .
                </p>
              </form>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </>
  )
}
