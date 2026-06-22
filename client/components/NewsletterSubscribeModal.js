'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import Script from 'next/script'
import { newsletterAPI } from '@/lib/api'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'
import { NEWSLETTER_COPY, NEWSLETTER_FIELD_LIMITS, NEWSLETTER_TOPICS } from '@/lib/constants'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

const EMPTY_FORM = { firstName: '', lastName: '', email: '' }
// All topics pre-checked by default.
const DEFAULT_TOPICS = () => Object.fromEntries(NEWSLETTER_TOPICS.map((t) => [t.key, true]))

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function NewsletterSubscribeModal({ open, onClose }) {
  const { showBanner } = useBannerNotification()

  const [formData, setFormData] = useState(EMPTY_FORM)
  const [topics, setTopics] = useState(DEFAULT_TOPICS)
  const [consent, setConsent] = useState(false)
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
      setTopics(DEFAULT_TOPICS())
      setConsent(false)
      setSubmitting(false)
      setTurnstileToken('')
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

  const toggleTopic = (key) => () => {
    setTopics((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const trimmedFirstName = formData.firstName.trim()
  const trimmedEmail = formData.email.trim()
  const selectedKeys = NEWSLETTER_TOPICS.filter((t) => topics[t.key]).map((t) => t.key)

  const isValid =
    !!trimmedFirstName &&
    EMAIL_RE.test(trimmedEmail) &&
    selectedKeys.length > 0 &&
    consent &&
    !!turnstileToken &&
    !submitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValid) return

    setSubmitting(true)
    try {
      await newsletterAPI.subscribe({
        firstName: trimmedFirstName,
        lastName: formData.lastName.trim() || undefined,
        email: trimmedEmail,
        topics: selectedKeys,
        turnstileToken,
      })
      // Success — including the silent re-subscription of an existing email.
      showBanner(NEWSLETTER_COPY.bannerSuccess)
      onClose()
    } catch (err) {
      resetTurnstile()
      const code = err?.title || ''
      let message = NEWSLETTER_COPY.bannerErrorGeneric
      if (err?.status === 429) message = NEWSLETTER_COPY.bannerErrorRateLimit
      else if (code === 'CAPTCHA_FAILED') message = NEWSLETTER_COPY.bannerErrorCaptchaFailed
      else if (code === 'CAPTCHA_UNAVAILABLE') message = NEWSLETTER_COPY.bannerErrorCaptchaUnavailable
      else if (code === 'NEWSLETTER_DISABLED') message = NEWSLETTER_COPY.bannerErrorDisabled
      showBanner(message)
      // Nothing the user can do from inside the modal in these cases.
      if (code === 'CAPTCHA_UNAVAILABLE' || code === 'NEWSLETTER_DISABLED') {
        onClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

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
                    {NEWSLETTER_COPY.modalTitle}
                  </DialogTitle>
                  <p className="mt-1 text-sm text-gray-500">{NEWSLETTER_COPY.modalSubtitle}</p>
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

              <p className="mb-4 text-sm text-gray-600">{NEWSLETTER_COPY.intro}</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="newsletter-first-name" className="block text-sm font-medium text-gray-700">
                      {NEWSLETTER_COPY.labelFirstName}
                    </label>
                    <input
                      id="newsletter-first-name"
                      type="text"
                      required
                      maxLength={NEWSLETTER_FIELD_LIMITS.firstName}
                      value={formData.firstName}
                      onChange={handleChange('firstName')}
                      placeholder={NEWSLETTER_COPY.placeholderFirstName}
                      autoComplete="given-name"
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 sm:text-sm outline-none focus:border-gray-900"
                    />
                  </div>

                  <div>
                    <label htmlFor="newsletter-last-name" className="block text-sm font-medium text-gray-700">
                      {NEWSLETTER_COPY.labelLastName}
                    </label>
                    <input
                      id="newsletter-last-name"
                      type="text"
                      maxLength={NEWSLETTER_FIELD_LIMITS.lastName}
                      value={formData.lastName}
                      onChange={handleChange('lastName')}
                      placeholder={NEWSLETTER_COPY.placeholderLastName}
                      autoComplete="family-name"
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 sm:text-sm outline-none focus:border-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="newsletter-email" className="block text-sm font-medium text-gray-700">
                    {NEWSLETTER_COPY.labelEmail}
                  </label>
                  <input
                    id="newsletter-email"
                    type="email"
                    required
                    maxLength={NEWSLETTER_FIELD_LIMITS.email}
                    value={formData.email}
                    onChange={handleChange('email')}
                    placeholder={NEWSLETTER_COPY.placeholderEmail}
                    autoComplete="email"
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 sm:text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <fieldset>
                  <legend className="block text-sm font-medium text-gray-700">
                    {NEWSLETTER_COPY.labelTopics}
                  </legend>
                  <div className="mt-2 space-y-3">
                    {NEWSLETTER_TOPICS.map((topic) => (
                      <label key={topic.key} htmlFor={`newsletter-topic-${topic.key}`} className="flex items-start gap-3">
                        <input
                          id={`newsletter-topic-${topic.key}`}
                          type="checkbox"
                          checked={!!topics[topic.key]}
                          onChange={toggleTopic(topic.key)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-black accent-black focus:ring-black"
                        />
                        <span className="text-sm">
                          <span className="block font-medium text-gray-900">{topic.label}</span>
                          <span className="block text-gray-500">{topic.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <div ref={widgetContainerRef} className="min-h-[65px]" />
                  {!scriptReady && (
                    <p className="text-xs text-gray-500">{NEWSLETTER_COPY.captchaLoading}</p>
                  )}
                </div>

                <label htmlFor="newsletter-consent" className="flex items-start gap-3">
                  <input
                    id="newsletter-consent"
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-black accent-black focus:ring-black"
                  />
                  <span className="text-xs text-gray-500">
                    {NEWSLETTER_COPY.consentPrefix}{' '}
                    <a
                      href={NEWSLETTER_COPY.consentTermsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-gray-700 hover:text-gray-500"
                    >
                      {NEWSLETTER_COPY.consentTermsLink}
                    </a>{' '}
                    {NEWSLETTER_COPY.consentAnd}{' '}
                    <a
                      href={NEWSLETTER_COPY.consentPrivacyHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-gray-700 hover:text-gray-500"
                    >
                      {NEWSLETTER_COPY.consentPrivacyLink}
                    </a>
                    .
                  </span>
                </label>

                <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={submitting}
                    className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {NEWSLETTER_COPY.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={!isValid}
                    className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? NEWSLETTER_COPY.submitting : NEWSLETTER_COPY.submit}
                  </button>
                </div>
              </form>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </>
  )
}
