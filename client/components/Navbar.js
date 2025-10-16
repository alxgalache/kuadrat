'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Dialog, DialogPanel } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isAuthenticated, logout, user } = useAuth()
  const router = useRouter()

  const isAdmin = user?.role === 'admin'
  const isSeller = user?.role === 'seller'

  const navigation = [
      { name: 'Galería', href: '/galeria' },
      { name: 'Más', href: '/galeria/mas' }
  ]

  const handleLogout = () => {
    logout()
    router.push('/')
    router.refresh()
  }

  return (
    <header className="bg-white">
      <nav aria-label="Global" className="mx-auto flex max-w-7xl items-center justify-between p-6 lg:px-8">
        <div className="flex flex-1 items-center">
          <div className="hidden lg:flex lg:gap-x-12">
            {navigation.map((item) => (
              <Link key={item.name} href={item.href} className="text-sm/6 font-semibold text-gray-900 hover:text-gray-600">
                {item.name}
              </Link>
            ))}
          </div>
          <div className="flex lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
            >
              <span className="sr-only">Abrir menú principal</span>
              <Bars3Icon aria-hidden="true" className="size-6" />
            </button>
          </div>
        </div>

        <Link href="/" className="-m-1.5 p-1.5">
          <span className="sr-only">Kuadrat</span>
          <img
            alt="Kuadrat logo"
            src="/brand/140d.svg"
            className="h-6 w-auto"
          />
        </Link>

        <div className="flex flex-1 justify-end">
          {isAuthenticated && (
            <div className="flex items-center gap-x-6">
              {isAdmin ? (
                <Link
                  href="/admin"
                  className="text-sm/6 font-semibold text-gray-900 hover:text-gray-600"
                >
                  Admin
                </Link>
              ) : isSeller ? (
                <>
                  <Link
                    href="/seller/publish"
                    className="text-sm/6 font-semibold text-gray-900 hover:text-gray-600"
                  >
                    Subir
                  </Link>
                  <Link
                    href="#"
                    className="text-sm/6 font-semibold text-gray-900 hover:text-gray-600"
                  >
                    Cuenta
                  </Link>
                </>
              ) : null}
              <button
                onClick={handleLogout}
                className="text-sm/6 font-semibold text-gray-900 hover:text-gray-600"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </nav>

      <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
        <div className="fixed inset-0 z-10" />
        <DialogPanel className="fixed inset-y-0 left-0 z-10 w-full overflow-y-auto bg-white px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-1">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="-m-2.5 rounded-md p-2.5 text-gray-700"
              >
                <span className="sr-only">Cerrar menú</span>
                <XMarkIcon aria-hidden="true" className="size-6" />
              </button>
            </div>
            <Link href="/" className="-m-1.5 p-1.5">
              <span className="sr-only">Kuadrat</span>
              <img
                alt="Kuadrat logo"
                src="/brand/140d.svg"
                className="h-8 w-auto"
              />
            </Link>
            <div className="flex flex-1 justify-end" />
          </div>
          <div className="mt-6 space-y-2">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50"
              >
                {item.name}
              </Link>
            ))}
            {isAuthenticated && (
              <>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50"
                  >
                    Admin
                  </Link>
                ) : isSeller ? (
                  <>
                    <Link
                      href="/seller/publish"
                      onClick={() => setMobileMenuOpen(false)}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Subir
                    </Link>
                    <Link
                      href="#"
                      onClick={() => setMobileMenuOpen(false)}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Cuenta
                    </Link>
                  </>
                ) : null}
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    handleLogout()
                  }}
                  className="-mx-3 block w-full text-left rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Cerrar sesión
                </button>
              </>
            )}
          </div>
        </DialogPanel>
      </Dialog>
    </header>
  )
}
