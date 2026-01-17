'use client'

import { usePathname } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

// Routes where Navbar and Footer should be hidden
const ROUTES_WITHOUT_LAYOUT = [
  '/user-activation',
]

export default function LayoutWrapper({ children, isPublished }) {
  const pathname = usePathname()

  // Check if current path starts with any of the routes without layout
  const shouldHideLayout = ROUTES_WITHOUT_LAYOUT.some(route => pathname?.startsWith(route))

  if (!isPublished || shouldHideLayout) {
    return <main className="flex-grow">{children}</main>
  }

  return (
    <>
      <Navbar />
      <main className="flex-grow">{children}</main>
      <Footer />
    </>
  )
}
