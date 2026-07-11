'use client'

import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import ProductForm from '@/components/ProductForm'
import { useNotification } from '@/contexts/NotificationContext'

function AdminProductEditPageContent({ params }) {
  const unwrappedParams = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { showSuccess } = useNotification()

  // Listing/admin endpoints use 'art' | 'others'; the form uses 'art' | 'other'
  const type = searchParams.get('type') === 'others' ? 'others' : 'art'
  const formProductType = type === 'others' ? 'other' : 'art'

  const [product, setProduct] = useState(null)
  const [commissionRates, setCommissionRates] = useState(null)
  const [taxRates, setTaxRates] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    adminAPI.products.getEditData(unwrappedParams.id, type)
      .then((data) => {
        if (!active) return
        setProduct(data.product)
        setCommissionRates(data.commissionRates)
        setTaxRates(data.tax_rates)
      })
      .catch((err) => {
        console.error('Error loading product edit data:', err)
        if (active) setError('No se pudo cargar el producto')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [unwrappedParams.id, type])

  const handleUpdate = async (formData) => {
    if (type === 'art') {
      await adminAPI.products.updateArt(unwrappedParams.id, formData)
    } else {
      await adminAPI.products.updateOthers(unwrappedParams.id, formData)
    }
    showSuccess('Guardado', 'El producto se ha actualizado correctamente')
    router.push(`/admin/authors/${product.seller_id}`)
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error || 'Producto no encontrado'}</p>
      </div>
    )
  }

  return (
    <ProductForm
      mode="edit"
      initialProduct={product}
      initialProductType={formProductType}
      initialCommissionRates={commissionRates}
      initialTaxRates={taxRates}
      onSubmit={handleUpdate}
    />
  )
}

export default function AdminProductEditPage({ params }) {
  return (
    <AuthGuard requireRole="admin">
      <AdminProductEditPageContent params={params} />
    </AuthGuard>
  )
}
