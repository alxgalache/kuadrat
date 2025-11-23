'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Dialog, DialogPanel, Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { Bars3Icon, XMarkIcon, ShoppingCartIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import ShoppingCartDrawer from '@/components/ShoppingCartDrawer'

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const { isAuthenticated, logout, user } = useAuth()
  const { getTotalItems, animationTrigger } = useCart()
  const router = useRouter()

  const isAdmin = user?.role === 'admin'
  const isSeller = user?.role === 'seller'
  const totalCartItems = getTotalItems()
  const displayName = user?.full_name || ''

  const navigation = [
      { name: 'Galería', href: '/galeria' },
      { name: 'Más', href: '/galeria/mas' }
  ]

  const handleLogout = () => {
    logout()
    router.push('/')
    router.refresh()
  }

  // Trigger animation when cart changes
  useEffect(() => {
    if (animationTrigger > 0) {
      setIsAnimating(true)
      const timer = setTimeout(() => {
        setIsAnimating(false)
      }, 600) // Animation duration
      return () => clearTimeout(timer)
    }
  }, [animationTrigger])

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
            {/* Static upcoming feature label for auctions */}
            <div className="relative group">
              <span className="text-sm/6 font-semibold text-gray-900 cursor-default">
                Subastas
              </span>
              <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-lg ring-1 ring-gray-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                Próximamente...
              </div>
            </div>
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

        <div className="flex flex-1 justify-end items-center gap-x-2">
          {/* Admin profile menu */}
          {isAuthenticated && isAdmin && (
            <Popover className="relative hidden lg:block transition-all duration-[600ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]">
              {({ open, close }) => (
                <>
                  <PopoverButton className="inline-flex items-center justify-center rounded-xl p-2.5 text-gray-900 hover:text-gray-600 bg-white transition-all duration-200 focus-visible:outline-none">
                    <span className="sr-only">Abrir menú de administrador</span>
                    <UserCircleIcon aria-hidden="true" className="size-6" />
                  </PopoverButton>

                  {open && (
                    <div
                      className="fixed inset-0 z-[5]"
                      onClick={() => close()}
                      aria-hidden="true"
                    />
                  )}

                  <PopoverPanel
                    transition
                    className="absolute right-0 z-10 mt-2 flex w-screen max-w-min transition data-closed:translate-y-1 data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
                  >
                    <div className="w-56 shrink rounded-xl bg-white p-4 text-sm/6 font-semibold text-gray-900 shadow-lg ring-1 ring-gray-900/10">
                      {displayName && (
                        <div className="mb-2 px-2 italic text-gray-400 font-normal truncate" title={displayName}>
                          {displayName}
                        </div>
                      )}
                      <Link
                        href="/admin/autores"
                        onClick={() => close()}
                        className="block p-2 hover:text-gray-600"
                      >
                        Autores
                      </Link>
                      <Link
                        href="/admin/pedidos"
                        onClick={() => close()}
                        className="block p-2 hover:text-gray-600"
                      >
                        Pedidos
                      </Link>
                      <Link
                        href="/admin/envios"
                        onClick={() => close()}
                        className="block p-2 hover:text-gray-600"
                      >
                        Envíos
                      </Link>
                      <button
                        onClick={() => {
                          close()
                          handleLogout()
                        }}
                        className="block w-full text-left p-2 hover:text-gray-600"
                      >
                        Cerrar sesión
                      </button>
                    </div>
                  </PopoverPanel>
                </>
              )}
            </Popover>
          )}
          {/* Seller profile menu */}
          {isAuthenticated && isSeller && (
            <Popover className="relative hidden lg:block transition-all duration-[600ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]">
              {({ open, close }) => (
                <>
                  <PopoverButton className="inline-flex items-center justify-center rounded-xl p-2.5 text-gray-900 hover:text-gray-600 bg-white transition-all duration-200 focus-visible:outline-none">
                    <span className="sr-only">Abrir menú de perfil</span>
                    <UserCircleIcon aria-hidden="true" className="size-6" />
                  </PopoverButton>

                  {open && (
                    <div
                      className="fixed inset-0 z-[5]"
                      onClick={() => close()}
                      aria-hidden="true"
                    />
                  )}

                  <PopoverPanel
                    transition
                    className="absolute right-0 z-10 mt-2 flex w-screen max-w-min transition data-closed:translate-y-1 data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
                  >
                <div className="w-56 shrink rounded-xl bg-white p-4 text-sm/6 font-semibold text-gray-900 shadow-lg ring-1 ring-gray-900/10">
                  {displayName && (
                    <div className="mb-2 px-2 italic text-gray-400 font-normal truncate" title={displayName}>
                      {displayName}
                    </div>
                  )}
                  <Link
                    href="/seller/products"
                    onClick={() => close()}
                    className="block p-2 hover:text-gray-600"
                  >
                    Artículos
                  </Link>
                  <Link
                    href="/orders"
                    onClick={() => close()}
                    className="block p-2 hover:text-gray-600"
                  >
                    Pedidos
                  </Link>
                  <button
                    onClick={() => {
                      close()
                      handleLogout()
                    }}
                    className="block w-full text-left p-2 hover:text-gray-600"
                  >
                    Salir
                  </button>
                </div>
              </PopoverPanel>
                </>
              )}
            </Popover>
          )}
          {/* Shopping cart icon - far right */}
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative -m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-900 hover:text-gray-600"
          >
            <span className="sr-only">Abrir carrito</span>
            <ShoppingCartIcon
              aria-hidden="true"
              className={`size-6 ${isAnimating ? 'cart-icon-bounce' : ''}`}
            />
            {totalCartItems > 0 && (
              <span className={`ml-2 text-sm font-semibold ${isAnimating ? 'cart-number-bounce' : ''}`}>
                {totalCartItems}
              </span>
            )}
          </button>
          <style jsx>{`
            @keyframes cartIconBounce {
              0% {
                transform: translateX(0);
              }
              30% {
                transform: translateX(-8px);
              }
              50% {
                transform: translateX(-10px);
              }
              70% {
                transform: translateX(2px);
              }
              85% {
                transform: translateX(-1px);
              }
              100% {
                transform: translateX(0);
              }
            }

            @keyframes cartNumberBounce {
              0% {
                transform: translateX(0);
                opacity: 0.5;
              }
              30% {
                transform: translateX(12px);
                opacity: 1;
              }
              50% {
                transform: translateX(14px);
                opacity: 1;
              }
              70% {
                transform: translateX(-2px);
                opacity: 1;
              }
              85% {
                transform: translateX(1px);
                opacity: 1;
              }
              100% {
                transform: translateX(0);
                opacity: 1;
              }
            }

            :global(.cart-icon-bounce) {
              animation: cartIconBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            :global(.cart-number-bounce) {
              animation: cartNumberBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
          `}</style>
        </div>
      </nav>

      <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
        <div className="fixed inset-0 z-10" />
        <DialogPanel className="fixed inset-y-0 left-0 z-10 w-full overflow-y-auto bg-white px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-1 items-center gap-x-4">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="-m-2.5 rounded-md p-2.5 text-gray-700"
              >
                <span className="sr-only">Cerrar menú</span>
                <XMarkIcon aria-hidden="true" className="size-6" />
              </button>
              {/* Intentionally no cart button here on mobile; cart access remains in the main navbar on the right. */}
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
            {/* Static upcoming feature label for auctions in mobile menu */}
            <div className="-mx-3 rounded-lg px-3 py-2">
              <span className="block text-base/7 font-semibold text-gray-900">
                Subastas
              </span>
              <span className="mt-1 block text-sm text-gray-600">
                Próximamente...
              </span>
            </div>
            {isAuthenticated && (
              <>
                {isAdmin ? (
                  <>
                    <Link
                      href="/admin/autores"
                      onClick={() => setMobileMenuOpen(false)}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Autores
                    </Link>
                    <Link
                      href="/admin/pedidos"
                      onClick={() => setMobileMenuOpen(false)}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Pedidos
                    </Link>
                    <Link
                      href="/admin/envios"
                      onClick={() => setMobileMenuOpen(false)}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Envíos
                    </Link>
                  </>
                ) : isSeller ? (
                  <>
                    <Link
                      href="/seller/products"
                      onClick={() => setMobileMenuOpen(false)}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Artículos
                    </Link>
                    <Link
                      href="/orders"
                      onClick={() => setMobileMenuOpen(false)}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Pedidos
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
                  Salir
                </button>
              </>
            )}
          </div>
        </DialogPanel>
      </Dialog>

      {/* Shopping Cart Drawer */}
      <ShoppingCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </header>
  )
}
