'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import PostalCodeSelect from '@/components/PostalCodeSelect'
import { ArrowLeftIcon, PlayIcon, XMarkIcon, TrashIcon } from '@heroicons/react/20/solid'

function AuctionDetailContent() {
  const params = useParams()
  const router = useRouter()
  const [auction, setAuction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Edit mode state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStartDatetime, setEditStartDatetime] = useState('')
  const [editEndDatetime, setEditEndDatetime] = useState('')
  const [editStatus, setEditStatus] = useState('draft')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Products for editing
  const [availableProducts, setAvailableProducts] = useState([])
  const [selectedProducts, setSelectedProducts] = useState({})
  const [loadingProducts, setLoadingProducts] = useState(false)

  useEffect(() => {
    if (params.id) {
      loadAuction()
    }
  }, [params.id])

  const loadAuction = async () => {
    try {
      const data = await adminAPI.auctions.getById(params.id)
      setAuction(data.auction || data)
    } catch (err) {
      setError(err.message || 'No se pudo cargar la subasta')
      console.error('Error loading auction:', err)
    } finally {
      setLoading(false)
    }
  }

  const enterEditMode = async () => {
    setEditing(true)
    setEditError('')

    // Populate edit fields from current auction data
    setEditName(auction.name || '')
    setEditDescription(auction.description || '')
    setEditStartDatetime(auction.start_datetime ? formatDatetimeLocal(auction.start_datetime) : '')
    setEditEndDatetime(auction.end_datetime ? formatDatetimeLocal(auction.end_datetime) : '')
    setEditStatus(auction.status || 'draft')

    // Load available products
    setLoadingProducts(true)

    try {
      const productsData = await adminAPI.auctions.getProductsForAuction(params.id)
      setAvailableProducts(productsData.products || [])

      // Pre-select current auction products and load their postal codes
      const currentProducts = {}
      if (auction.products && auction.products.length > 0) {
        // Collect all postal code IDs that need to be loaded
        const allPostalCodeIds = []
        auction.products.forEach(p => {
          if (p.postal_code_ids && p.postal_code_ids.length > 0) {
            allPostalCodeIds.push(...p.postal_code_ids)
          }
        })

        // Load postal codes by IDs if any exist
        let postalCodesMap = {}
        if (allPostalCodeIds.length > 0) {
          const uniqueIds = [...new Set(allPostalCodeIds)]
          const postalCodesData = await adminAPI.postalCodes.getByIds(uniqueIds)
          if (postalCodesData.postalCodes) {
            postalCodesData.postalCodes.forEach(pc => {
              postalCodesMap[pc.id] = pc
            })
          }
        }

        // Build selected products with postal code objects
        auction.products.forEach(p => {
          const key = `${p.product_type}_${p.product_id}`
          const postalCodes = (p.postal_code_ids || [])
            .map(id => postalCodesMap[id])
            .filter(Boolean)

          currentProducts[key] = {
            product_id: p.product_id,
            product_type: p.product_type,
            start_price: p.start_price || '',
            step_new_bid: p.step_new_bid || '',
            position: p.position || 1,
            postal_codes: postalCodes,
            shipping_observations: p.shipping_observations || '',
          }
        })
      }
      setSelectedProducts(currentProducts)
    } catch (err) {
      console.error('Error loading edit data:', err)
      setEditError('No se pudieron cargar los datos para editar')
    } finally {
      setLoadingProducts(false)
    }
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditError('')
  }

  const formatDatetimeLocal = (dateString) => {
    if (!dateString) return ''
    const d = new Date(dateString)
    // Format to YYYY-MM-DDTHH:mm for datetime-local input
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      draft: { label: 'Borrador', class: 'bg-gray-100 text-gray-800' },
      scheduled: { label: 'Programada', class: 'bg-blue-100 text-blue-800' },
      active: { label: 'Activa', class: 'bg-green-100 text-green-800' },
      finished: { label: 'Finalizada', class: 'bg-gray-900 text-white' },
      cancelled: { label: 'Cancelada', class: 'bg-red-100 text-red-800' },
    }

    const config = statusConfig[status] || { label: status, class: 'bg-gray-100 text-gray-800' }

    return (
      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${config.class}`}>
        {config.label}
      </span>
    )
  }

  const canEdit = auction && (auction.status === 'draft' || auction.status === 'scheduled')

  const handleStart = async () => {
    if (!confirm('¿Estás seguro de que quieres iniciar esta subasta?')) return

    setActionLoading(true)
    try {
      await adminAPI.auctions.start(params.id)
      await loadAuction()
    } catch (err) {
      setError(err.message || 'No se pudo iniciar la subasta')
      console.error('Error starting auction:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('¿Estás seguro de que quieres cancelar esta subasta?')) return

    setActionLoading(true)
    try {
      await adminAPI.auctions.cancel(params.id)
      await loadAuction()
    } catch (err) {
      setError(err.message || 'No se pudo cancelar la subasta')
      console.error('Error cancelling auction:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta subasta? Esta acción no se puede deshacer.')) return

    setActionLoading(true)
    try {
      await adminAPI.auctions.delete(params.id)
      router.push('/admin/subastas')
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la subasta')
      console.error('Error deleting auction:', err)
      setActionLoading(false)
    }
  }

  // Product editing helpers
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
          postal_codes: [],
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

  // Merge available products with currently selected ones for the edit form
  const getAllProductsForEdit = () => {
    const allProducts = [...availableProducts]
    // Add any currently-in-auction products that may not appear in availableProducts
    if (auction?.products) {
      auction.products.forEach(ap => {
        const exists = allProducts.some(
          p => p.id === ap.product_id && p.product_type === ap.product_type
        )
        if (!exists) {
          allProducts.push({
            id: ap.product_id,
            product_type: ap.product_type,
            name: ap.product_name || ap.name || `Producto #${ap.product_id}`,
            author_name: ap.author_name || '',
            price: ap.start_price || null,
          })
        }
      })
    }
    return allProducts
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    setEditError('')

    if (!editName.trim()) {
      setEditError('El nombre es obligatorio')
      return
    }

    if (!editStartDatetime) {
      setEditError('La fecha de inicio es obligatoria')
      return
    }

    if (!editEndDatetime) {
      setEditError('La fecha de fin es obligatoria')
      return
    }

    if (new Date(editEndDatetime) <= new Date(editStartDatetime)) {
      setEditError('La fecha de fin debe ser posterior a la de inicio')
      return
    }

    const productEntries = Object.values(selectedProducts)
    if (productEntries.length === 0) {
      setEditError('Debes seleccionar al menos un producto')
      return
    }

    for (const product of productEntries) {
      if (!product.start_price || parseFloat(product.start_price) <= 0) {
        setEditError('Todos los productos deben tener un precio de salida mayor a 0')
        return
      }
      if (!product.step_new_bid || parseFloat(product.step_new_bid) <= 0) {
        setEditError('Todos los productos deben tener un incremento de puja mayor a 0')
        return
      }
    }

    setSaving(true)

    try {
      const auctionData = {
        name: editName.trim(),
        description: editDescription.trim(),
        start_datetime: editStartDatetime,
        end_datetime: editEndDatetime,
        status: editStatus,
        products: productEntries.map(p => ({
          product_id: p.product_id,
          product_type: p.product_type,
          start_price: parseFloat(p.start_price),
          step_new_bid: parseFloat(p.step_new_bid),
          position: parseInt(p.position, 10) || 1,
          postal_code_ids: (p.postal_codes || []).map(pc => pc.id),
          shipping_observations: p.shipping_observations?.trim() || null,
        })),
      }

      await adminAPI.auctions.update(params.id, auctionData)
      setEditing(false)
      setLoading(true)
      await loadAuction()
    } catch (err) {
      setEditError(err.message || 'No se pudo actualizar la subasta')
      console.error('Error updating auction:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando subasta...</p>
      </div>
    )
  }

  if (error && !auction) {
    return (
      <div className="bg-white min-h-screen">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <Link
            href="/admin/subastas"
            className="inline-flex items-center gap-x-2 text-sm font-semibold text-gray-900 hover:text-gray-600 mb-8"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Volver a subastas
          </Link>
          <p className="text-red-500 mt-4">{error}</p>
        </div>
      </div>
    )
  }

  if (!auction) {
    return null
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Back button */}
        <Link
          href="/admin/subastas"
          className="inline-flex items-center gap-x-2 text-sm font-semibold text-gray-900 hover:text-gray-600 mb-8"
        >
          <ArrowLeftIcon className="h-5 w-5" />
          Volver a subastas
        </Link>

        {/* Error banner */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {!editing ? (
          /* ==================== VIEW MODE ==================== */
          <>
            {/* Auction header */}
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                    {auction.name}
                  </h1>
                  {auction.description && (
                    <p className="mt-2 text-sm text-gray-500">{auction.description}</p>
                  )}
                </div>
                <div>
                  {getStatusBadge(auction.status)}
                </div>
              </div>
            </div>

            {/* Auction details */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 mb-8">
              <div className="lg:col-span-2">
                {/* Dates */}
                <div className="rounded-lg border border-gray-300 shadow-sm overflow-hidden mb-6">
                  <div className="px-4 py-5 sm:p-6">
                    <h2 className="text-lg font-medium text-gray-900 mb-4">Fechas</h2>
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Inicio</dt>
                        <dd className="mt-1 text-sm text-gray-900">{formatDate(auction.start_datetime)}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Fin</dt>
                        <dd className="mt-1 text-sm text-gray-900">{formatDate(auction.end_datetime)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {/* Products */}
                <div className="rounded-lg border border-gray-300 shadow-sm overflow-hidden">
                  <div className="px-4 py-5 sm:p-6">
                    <h2 className="text-lg font-medium text-gray-900 mb-4">Productos</h2>
                    {auction.products && auction.products.length > 0 ? (
                      <ul role="list" className="divide-y divide-gray-200">
                        {auction.products.map((product, index) => (
                          <li key={index} className="py-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {product.product_name || product.name || `Producto #${product.product_id}`}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {product.product_type === 'art' ? 'Arte' : 'Otro'}
                                  {product.author_name ? ` · ${product.author_name}` : ''}
                                  {product.position ? ` · Posición: ${product.position}` : ''}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-gray-900">
                                  Salida: {product.start_price != null ? `${parseFloat(product.start_price).toFixed(2)}` : '-'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Incremento: {product.step_new_bid != null ? `${parseFloat(product.step_new_bid).toFixed(2)}` : '-'}
                                </p>
                                {product.current_price != null && (
                                  <p className="text-xs text-green-700 font-medium">
                                    Precio actual: {parseFloat(product.current_price).toFixed(2)}
                                  </p>
                                )}
                                {product.bid_count != null && (
                                  <p className="text-xs text-gray-400">
                                    {product.bid_count} puja{product.bid_count !== 1 ? 's' : ''}
                                  </p>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500">No hay productos en esta subasta</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar - Actions */}
              <div className="lg:col-span-1">
                <div className="rounded-lg border border-gray-300 shadow-sm overflow-hidden">
                  <div className="px-4 py-5 sm:p-6">
                    <h2 className="text-lg font-medium text-gray-900 mb-4">Acciones</h2>
                    <div className="space-y-3">
                      {canEdit && (
                        <button
                          onClick={enterEditMode}
                          className="w-full rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
                        >
                          Editar subasta
                        </button>
                      )}

                      {auction.status === 'scheduled' && (
                        <button
                          onClick={handleStart}
                          disabled={actionLoading}
                          className="w-full inline-flex items-center justify-center gap-x-2 rounded-md bg-green-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50"
                        >
                          <PlayIcon className="h-5 w-5" />
                          Iniciar subasta
                        </button>
                      )}

                      {(auction.status !== 'finished' && auction.status !== 'cancelled') && (
                        <button
                          onClick={handleCancel}
                          disabled={actionLoading}
                          className="w-full inline-flex items-center justify-center gap-x-2 rounded-md bg-red-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
                        >
                          <XMarkIcon className="h-5 w-5" />
                          Cancelar subasta
                        </button>
                      )}

                      {(auction.status === 'draft' || auction.status === 'cancelled') && (
                        <button
                          onClick={handleDelete}
                          disabled={actionLoading}
                          className="w-full inline-flex items-center justify-center gap-x-2 rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-red-600 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50 disabled:opacity-50"
                        >
                          <TrashIcon className="h-5 w-5" />
                          Eliminar subasta
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ==================== EDIT MODE ==================== */
          <form onSubmit={handleSaveEdit} className="space-y-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                Editar subasta
              </h1>
              <p className="mt-2 text-sm text-gray-700">
                Modifica la información de la subasta
              </p>
            </div>

            {editError && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{editError}</p>
              </div>
            )}

            {/* Basic info */}
            <div className="border-b border-gray-200 pb-8">
              <h2 className="text-lg font-medium text-gray-900 mb-6">Información general</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="edit-name" className="block text-sm font-medium text-gray-900">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="edit-description" className="block text-sm font-medium text-gray-900">
                    Descripción
                  </label>
                  <textarea
                    id="edit-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="edit-start-datetime" className="block text-sm font-medium text-gray-900">
                    Fecha y hora de inicio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    id="edit-start-datetime"
                    value={editStartDatetime}
                    onChange={(e) => setEditStartDatetime(e.target.value)}
                    required
                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="edit-end-datetime" className="block text-sm font-medium text-gray-900">
                    Fecha y hora de fin <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    id="edit-end-datetime"
                    value={editEndDatetime}
                    onChange={(e) => setEditEndDatetime(e.target.value)}
                    required
                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                  />
                </div>
              </div>

              <div className="sm:col-span-2 mt-6">
                <label htmlFor="edit-status" className="block text-sm font-medium text-gray-900">
                  Estado
                </label>
                <select
                  id="edit-status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
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

            {/* Product selection */}
            <div className="border-b border-gray-200 pb-8">
              <h2 className="text-lg font-medium text-gray-900 mb-2">Productos</h2>
              <p className="text-sm text-gray-500 mb-6">
                Selecciona los productos y configura sus precios de subasta
              </p>

              {loadingProducts ? (
                <p className="text-gray-500 text-sm">Cargando productos...</p>
              ) : (
                <div className="space-y-4">
                  {getAllProductsForEdit().map((product) => {
                    const key = `${product.product_type}_${product.id}`
                    const isSelected = !!selectedProducts[key]

                    return (
                      <div key={key} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex items-start gap-x-3">
                          <input
                            type="checkbox"
                            id={`edit-product-${key}`}
                            checked={isSelected}
                            onChange={() => toggleProduct(product.id, product.product_type)}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                          />
                          <label htmlFor={`edit-product-${key}`} className="flex-1 cursor-pointer">
                            <div className="text-sm font-medium text-gray-900">{product.name}</div>
                            <div className="text-xs text-gray-500">
                              {product.product_type === 'art' ? 'Arte' : 'Otro'} · {product.author_name || 'Sin autor'}
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

                            {/* Postal codes */}
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
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function AuctionDetailPage() {
  return (
    <AuthGuard requireRole="admin">
      <AuctionDetailContent />
    </AuthGuard>
  )
}
