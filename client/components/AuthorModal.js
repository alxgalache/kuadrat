'use client'

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Fragment } from 'react'
import Image from 'next/image'
import { getAuthorImageUrl } from '@/lib/api'
import { SafeAuthorBio } from '@/components/SafeHTML'
import { AUTHOR_CARD_COPY } from '@/lib/constants'

/** Initials fallback for artists without a profile picture: first letter of the
 *  first two words of their name. */
function getInitials(fullName) {
  if (!fullName) return ''
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
}

export default function AuthorModal({ author, open, onClose }) {
  const desktopImg = author?.profile_img || ''
  // Below `md` the landscape variant wins when the artist has one; otherwise the
  // main portrait is reused, so artists with a single image behave exactly as
  // before. The flag arrives from SQLite as 0/1.
  const mobileImg = author?.profile_img_mobile || ''
  const hideOnMobile = Boolean(Number(author?.hide_profile_img_mobile))

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-10">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <DialogBackdrop className="fixed inset-0 bg-gray-500/75" />
        </TransitionChild>

        <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-300"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              {/* Catalogue-card layout: image column left, content right on md+;
                  stacked on mobile. `overflow-hidden` makes the image respect
                  the panel radius; the height cap lives in `.author-card-panel`
                  (globals.css) so the vh/dvh fallback keeps its cascade order.

                  Flex rather than grid on md+: `auto` grid rows are sized to
                  their content and are NOT compressed by the container's
                  `max-height`, so the column overflowed the panel and the action
                  bar got clipped instead of the body scrolling. Flex items
                  stretch to the container's clamped height, which is what makes
                  the inner scroller work. */}
              <DialogPanel className="author-card-panel relative w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all flex flex-col md:flex-row">
                {author && (
                  <>
                    {/* Image column. Fixed band on mobile so the name and the
                        start of the bio stay above the fold; full column height
                        on md+, where it stays put while the bio scrolls.

                        The band and the desktop column have opposite extreme
                        aspect ratios, so a single portrait cannot fill both
                        without losing its subject. Rather than crop harder, the
                        artist gets a second, landscape-oriented file used below
                        `md` (`profile_img_mobile`), or opts out of showing any
                        image there (`hide_profile_img_mobile`) — in which case
                        the whole column is dropped on small screens and the card
                        opens straight onto the name.

                        Visibility is driven by CSS rather than a media-query
                        hook so there is no hydration mismatch and no flash of
                        the wrong variant. The cost is that a browser fetches
                        both files when an artist has both — acceptable for a
                        modal opened on demand. */}
                    <div
                      className={`relative w-full shrink-0 h-[30vh] max-h-64 bg-gray-100 md:h-auto md:max-h-none md:w-2/5 ${
                        hideOnMobile ? 'hidden md:block' : ''
                      }`}
                    >
                      {desktopImg ? (
                        <>
                          <Image
                            src={getAuthorImageUrl(desktopImg)}
                            alt={author.full_name}
                            fill
                            sizes={mobileImg ? '40vw' : '(min-width: 768px) 40vw, 100vw'}
                            className={`object-cover ${mobileImg ? 'hidden md:block' : ''}`}
                          />
                          {mobileImg && (
                            <Image
                              src={getAuthorImageUrl(mobileImg)}
                              alt={author.full_name}
                              fill
                              sizes="100vw"
                              className="object-cover md:hidden"
                            />
                          )}
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="text-5xl font-light tracking-wide text-gray-400">
                            {getInitials(author.full_name)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Content column. `min-h-0` is what keeps the scroll inside
                        the body instead of letting it escape to the panel. */}
                    <div className="flex min-h-0 flex-1 flex-col border-t border-gray-200 md:w-3/5 md:border-t-0 md:border-l">
                      <div className="shrink-0 border-b border-gray-200 px-6 pt-6 pb-4 sm:px-8">
                        <DialogTitle as="h3" className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
                          {author.full_name}
                        </DialogTitle>
                        {author.location && (
                          <p className="mt-1.5 text-sm text-gray-500">{author.location}</p>
                        )}
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                          {AUTHOR_CARD_COPY.bioLabel}
                        </p>
                        {author.bio ? (
                          <SafeAuthorBio
                            html={author.bio}
                            className="author-bio text-sm text-gray-700"
                          />
                        ) : (
                          <p className="text-sm italic text-gray-400">{AUTHOR_CARD_COPY.bioEmpty}</p>
                        )}
                      </div>

                      <div className="shrink-0 border-t border-gray-200 px-6 py-4 sm:px-8">
                        <button
                          type="button"
                          onClick={onClose}
                          className="inline-flex w-full justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 sm:w-auto"
                        >
                          {AUTHOR_CARD_COPY.close}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
