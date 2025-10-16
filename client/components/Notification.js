'use client'

import { Transition } from '@headlessui/react'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { useNotification } from '@/contexts/NotificationContext'

const notificationConfig = {
  success: {
    icon: CheckCircleIcon,
    iconColor: 'text-green-400',
  },
  error: {
    icon: ExclamationCircleIcon,
    iconColor: 'text-red-400',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    iconColor: 'text-yellow-400',
  },
  info: {
    icon: InformationCircleIcon,
    iconColor: 'text-blue-400',
  },
}

export default function NotificationContainer() {
  const { notifications, removeNotification } = useNotification()

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 z-50"
    >
      <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
        {notifications.map((notification) => {
          const config = notificationConfig[notification.type] || notificationConfig.error
          const Icon = config.icon

          return (
            <Transition
              key={notification.id}
              show={true}
              enter="transform ease-out duration-300 transition"
              enterFrom="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
              enterTo="translate-y-0 opacity-100 sm:translate-x-0"
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="pointer-events-auto w-full max-w-sm rounded-lg bg-white shadow-2xl ring-2 ring-gray-900 ring-opacity-10 border border-gray-200">
                <div className="p-4">
                  <div className="flex items-start">
                    <div className="shrink-0">
                      <Icon aria-hidden="true" className={`size-6 ${config.iconColor}`} />
                    </div>
                    <div className="ml-3 w-0 flex-1 pt-0.5">
                      {notification.title && (
                        <p className="text-sm font-bold text-gray-900">{notification.title}</p>
                      )}
                      {notification.message && (
                        <p className={`text-sm text-gray-600 ${notification.title ? 'mt-1' : ''}`}>
                          {notification.message}
                        </p>
                      )}
                      {notification.errors && Array.isArray(notification.errors) && notification.errors.length > 0 && (
                        <ul className="mt-2 text-sm text-gray-600 space-y-1">
                          {notification.errors.map((error, index) => (
                            <li key={index} className="pl-0">
                              {error.message || error}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="ml-4 flex shrink-0">
                      <button
                        type="button"
                        onClick={() => removeNotification(notification.id)}
                        className="inline-flex rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2"
                      >
                        <span className="sr-only">Cerrar</span>
                        <XMarkIcon aria-hidden="true" className="size-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          )
        })}
      </div>
    </div>
  )
}
