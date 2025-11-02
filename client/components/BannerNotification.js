'use client'

import { Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'

export default function BannerNotification() {
  const { banner, dismissBanner } = useBannerNotification()

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-0 bottom-0 sm:flex sm:justify-center sm:px-6 sm:pb-5 lg:px-8 z-50"
    >
      <Transition
        show={!!banner}
        enter="transform ease-out duration-300 transition"
        enterFrom="translate-y-full opacity-0"
        enterTo="translate-y-0 opacity-100"
        leave="transition ease-in duration-200"
        leaveFrom="translate-y-0 opacity-100"
        leaveTo="translate-y-full opacity-0"
        as="div"
        className="pointer-events-auto flex items-center justify-between gap-x-6 bg-black px-6 py-2.5 sm:rounded-xl sm:py-3 sm:pr-3.5 sm:pl-4"
      >
        <p className="text-sm/6 text-white">
          {banner?.message || ''}
        </p>
        <button
          type="button"
          onClick={dismissBanner}
          className="-m-1.5 flex-none p-1.5 hover:bg-gray-800 rounded-md transition-colors"
        >
          <span className="sr-only">Cerrar</span>
          <XMarkIcon aria-hidden="true" className="size-5 text-white" />
        </button>
      </Transition>
    </div>
  )
}
