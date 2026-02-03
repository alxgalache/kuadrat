'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import PostalCodeSelect from '@/components/PostalCodeSelect'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'

function NewAuctionPageContent() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDatetime, setStartDatetime] = useState('')
  const [endDatetime, setEndDatetime] = useState('')
  const [status, setStatus] = useState('draft')

  // Products
  const [availableProducts, setAvailableProducts] = useState([])
  const [selectedProducts, setSelectedProducts] = useState({})
  const [loadingProducts, setLoadingProducts] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    try {
      const data = await adminAPI.auctions.getProductsForAuction()
      setAvailableProducts(data.products || [])
    } catch (err) {
      console.error('Error loading products:', err)
    } finally {
      setLoadingProducts(false)
    }
  }

  const toggleProduct = (productId, productType) => {
    const key = `${productType}_${productId}`
    setSelectedProducts(prev => {
      if (prev[key]) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return {
        ...prev,
        [key]: {
          product_id: productId,
          product_type: productType,
          start_price: '',
          step_new_bid: '',
          position: Object.keys(prev).length + 1,
          postal_codes: [], // Store full postal code objects
          shipping_observations: '',
        },
      }
    })
  }

  const updateProductField = (key, field, value) => {
    setSelectedProducts(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }))
  }

  const updateProductPostalCodes = (key, postalCodes) => {
    setSelectedProducts(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        postal_codes: postalCodes,
      },
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('El nombre es obligatorio')
      return
    }

    if (!startDatetime) {
      setError('La fecha de inicio es obligatoria')
      return
    }

    if (!endDatetime) {
      setError('La fecha de fin es obligatoria')
      return
    }

    if (new Date(startDatetime) >= new Date(endDatetime)) {
      setError('La fecha de inicio debe ser anterior a la fecha de fin')
      return
    }

    const productEntries = Object.values(selectedProducts)

    if (productEntries.length === 0) {
      setError('Debes seleccionar al menos un producto')
      return
    }

    for (const p of productEntries) {
      if (!p.start_price || parseFloat(p.start_price) <= 0) {
        setError('Todos los productos deben tener un precio de salida válido')
        return
      }
      if (!p.step_new_bid || parseFloat(p.step_new_bid) <= 0) {
        setError('Todos los productos deben tener un incremento de puja válido')
        return
      }
    }

    setSaving(true)

    try {
      const products = productEntries.map(p => ({
        id: p.product_id,
        type: p.product_type,
        start_price: parseFloat(p.start_price),
        step_new_bid: parseFloat(p.step_new_bid),
        position: parseInt(p.position, 10) || 0,
        postal_code_ids: p.postal_codes.map(pc => pc.id),
        shipping_observations: p.shipping_observations?.trim() || null,
      }))

      await adminAPI.auctions.create({
        name: name.trim(),
        description: description.trim() || null,
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        status,
        products,
      })

      router.push('/admin/subastas')
    } catch (err) {
      setError(err.message || 'Error al crear la subasta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <div className="mb-6">
          <Link
            href="/admin/subastas"
            className="inline-flex items-center gap-x-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a subastas
          </Link>
        </div>

        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Nueva subasta</h1>
          <p className="mt-2 text-sm text-gray-700">
            Crea una nueva subasta seleccionando los productos y configurando sus precios
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic info */}
          <div className="border-b border-gray-200 pb-8">
            <h2 className="text-lg font-medium text-gray-900 mb-6">Información general</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="name" className="block text-sm font-medium text-gray-900">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                  placeholder="ej: Subasta de primavera 2025"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="description" className="block text-sm font-medium text-gray-900">
                  Descripción
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                  placeholder="Descripción opcional de la subasta"
                />
              </div>

              <div>
                <label htmlFor="start_datetime" className="block text-sm font-medium text-gray-900">
                  Fecha y hora de inicio <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  id="start_datetime"
                  value={startDatetime}
                  onChange={(e) => setStartDatetime(e.target.value)}
                  required
                  className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="end_datetime" className="block text-sm font-medium text-gray-900">
                  Fecha y hora de fin <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  id="end_datetime"
                  value={endDatetime}
                  onChange={(e) => setEndDatetime(e.target.value)}
                  required
                  className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="status" className="block text-sm font-medium text-gray-900">
                  Estado
                </label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                >
                  <option value="draft">Borrador</option>
                  <option value="scheduled">Programada</option>
                  <option value="active">Activa</option>
                  <option value="finished">Finalizada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>
            </div>
          </div>

          {/* Product selection */}
          <div className="border-b border-gray-200 pb-8">
            <h2 className="text-lg font-medium text-gray-900 mb-2">Productos</h2>
            <p className="text-sm text-gray-500 mb-6">
              Selecciona los productos que participarán en la subasta y configura sus precios
            </p>

            {loadingProducts ? (
              <p className="text-gray-500 text-sm">Cargando productos...</p>
            ) : availableProducts.length === 0 ? (
              <p className="text-gray-500 text-sm">No hay productos disponibles para subasta</p>
            ) : (
              <div className="space-y-4">
                {availableProducts.map((product) => {
                  const key = `${product.product_type}_${product.id}`
                  const isSelected = !!selectedProducts[key]

                  return (
                    <div key={key} className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-start gap-x-3">
                        <input
                          type="checkbox"
                          id={`product-${key}`}
                          checked={isSelected}
                          onChange={() => toggleProduct(product.id, product.product_type)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        />
                        <label htmlFor={`product-${key}`} className="flex-1 cursor-pointer">
                          <div className="text-sm font-medium text-gray-900">{product.name}</div>
                          <div className="text-xs text-gray-500">
                            {product.product_type === 'art' ? 'Arte' : 'Otro'} · {product.author_name || 'Sin autor'}
                            {product.price ? ` · Precio: ${product.price.toFixed(2)}` : ''}
                          </div>
                        </label>
                      </div>

                      {isSelected && (
                        <div className="mt-4 ml-7 space-y-4">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700">
                                Precio de salida <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={selectedProducts[key].start_price}
                                onChange={(e) => updateProductField(key, 'start_price', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700">
                                Incremento de puja <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={selectedProducts[key].step_new_bid}
                                onChange={(e) => updateProductField(key, 'step_new_bid', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700">
                                Posición
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={selectedProducts[key].position}
                                onChange={(e) => updateProductField(key, 'position', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                                placeholder="1"
                              />
                            </div>
                          </div>

                          {/* Postal codes for this product */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Códigos postales de envío
                            </label>
                            <PostalCodeSelect
                              value={selectedProducts[key].postal_codes || []}
                              onChange={(postalCodes) => updateProductPostalCodes(key, postalCodes)}
                              placeholder="Busca por código postal o ciudad (min. 3 caracteres)..."
                            />
                          </div>

                          {/* Shipping observations */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700">
                              Observaciones de envío
                            </label>
                            <textarea
                              value={selectedProducts[key].shipping_observations || ''}
                              onChange={(e) => updateProductField(key, 'shipping_observations', e.target.value)}
                              rows={2}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                              placeholder="Restricciones o información adicional sobre el envío..."
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-x-3 pt-2">
            <Link
              href="/admin/subastas"
              className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Creando...' : 'Crear subasta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function NewAuctionPage() {
  return (
    <AuthGuard requireRole="admin">
      <NewAuctionPageContent />
    </AuthGuard>
  )
}
