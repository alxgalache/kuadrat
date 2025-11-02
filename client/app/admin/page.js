'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'

function RedirectContent() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin/autores')
  }, [router])

  return (
    <div className="bg-white min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Redirigiendo...</p>
    </div>
  )
}

export default function AdminPage() {
  return (
    <AuthGuard requireRole="admin">
      <RedirectContent />
    </AuthGuard>
  )
}
