'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { sellerAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import ConfirmDialog from '@/components/ConfirmDialog'
import VariationEditModal from '@/components/VariationEditModal'
import { useNotification } from '@/contexts/NotificationContext'
import { PencilIcon, EyeIcon, EyeSlashIcon, TrashIcon } from '@heroicons/react/24/outline'

function SellerProductsPageContent() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { showSuccess, showApiError, showError: showErrorNotif } = useNotification()

  // Modal states
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: '', product: null })
  const [variationModal, setVariationModal] = useState({ open: false, product: null })

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    try {
      const data = await sellerAPI.getProducts()
      setProducts(data.products)
    } catch (err) {
      setError('No se pudieron cargar tus productos')
      showApiError(err)
    } finally {
      setLoading(false)
    }
  }

  const getImageUrl = (product) => {
    return product.product_type === 'art'
      ? getArtImageUrl(product.basename)
      : getOthersImageUrl(product.basename)
  }

  const getStatusBadge = (status) => {
    const badges = {
      pending: { text: 'Pendiente', className: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20' },
      approved: { text: 'Aprobado', className: 'bg-green-50 text-green-700 ring-green-600/20' },
      rejected: { text: 'Rechazado', className: 'bg-red-50 text-red-700 ring-red-600/20' }
    }
    const badge = badges[status] || badges.pending
    return (
      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${badge.className}`}>
        {badge.text}
      </span>
    )
  }

  const getVisibleBadge = (visible) => {
    return visible ? (
      <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-green-50 text-green-700 ring-green-600/20">
        Visible
      </span>
    ) : (
      <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-gray-50 text-gray-600 ring-gray-500/10">
        Oculto
      </span>
    )
  }

  const handleToggleVisibility = (product) => {
    setConfirmDialog({
      open: true,
      type: 'visibility',
      product
    })
  }

  const handleDelete = (product) => {
    setConfirmDialog({
      open: true,
      type: 'delete',
      product
    })
  }

  const handleEditVariations = (product) => {
    setVariationModal({
      open: true,
      product
    })
  }

  const executeConfirmAction = async () => {
    const { type, product } = confirmDialog

    try {
      if (type === 'visibility') {
        await sellerAPI.toggleVisibility(product.id, product.product_type, !product.visible)
        showSuccess(
          product.visible ? 'Producto oculto' : 'Producto visible',
          product.visible
            ? 'El producto ya no es visible en la galería'
            : 'El producto ahora es visible en la galería'
        )
      } else if (type === 'delete') {
        await sellerAPI.deleteProduct(product.id, product.product_type)
        showSuccess('Producto eliminado', 'El producto ha sido eliminado permanentemente')
      }

      // Reload products
      await loadProducts()
    } catch (err) {
      showApiError(err)
    } finally {
      setConfirmDialog({ open: false, type: '', product: null })
    }
  }

  const handleSaveVariations = async (variations) => {
    try {
      await sellerAPI.updateVariations(variationModal.product.id, variations)
      showSuccess('Variaciones actualizadas', 'Las variaciones se han actualizado correctamente')
      await loadProducts()
      setVariationModal({ open: false, product: null })
    } catch (err) {
      showApiError(err)
      throw err // Re-throw to keep modal open
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando productos...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Mis productos</h1>
            <p className="mt-2 text-sm text-gray-700">
              Gestiona tus obras de arte y otros productos
            </p>
          </div>
          <Link
            href="/seller/publish"
            className="rounded-md bg-black px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-800"
          >
            Nuevo
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Aún no has publicado ningún producto</p>
            <div className="mt-4">
              <Link
                href="/seller/publish"
                className="text-black hover:text-gray-700 font-semibold"
              >
                Publica tu primer producto
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-8 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                {/* Desktop table layout */}
                <table className="hidden min-w-full divide-y divide-gray-300 sm:table">
                  <thead>
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                        Producto
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Tipo
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Precio
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Stock
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Estado
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Visible
                      </th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {products.map((product) => (
                      <tr key={`${product.product_type}-${product.id}`}>
                        <td className="py-4 pl-4 pr-3 sm:pl-0">
                          <div className="flex items-center">
                            <div className="size-16 shrink-0">
                              <img
                                alt={product.name}
                                src={getImageUrl(product)}
                                className="size-16 rounded-md object-cover"
                              />
                            </div>
                            <div className="ml-4">
                              <div className="font-medium text-gray-900">{product.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          <span className="capitalize">{product.product_type === 'art' ? 'Arte' : 'Otro'}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                          €{product.price.toFixed(2)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {product.total_stock}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {getStatusBadge(product.status)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {getVisibleBadge(product.visible)}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                          <div className="flex justify-end gap-2">
                            {/* Edit button - only for 'others' products */}
                            {product.product_type === 'others' && (
                              <button
                                onClick={() => handleEditVariations(product)}
                                className="text-indigo-600 hover:text-indigo-900"
                                title="Editar variaciones"
                              >
                                <PencilIcon className="size-5" />
                              </button>
                            )}

                            {/* Toggle visibility button */}
                            <button
                              onClick={() => handleToggleVisibility(product)}
                              className="text-blue-600 hover:text-blue-900"
                              title={product.visible ? 'Ocultar' : 'Mostrar'}
                            >
                              {product.visible ? (
                                <EyeSlashIcon className="size-5" />
                              ) : (
                                <EyeIcon className="size-5" />
                              )}
                            </button>

                            {/* Delete button */}
                            <button
                              onClick={() => handleDelete(product)}
                              className="text-red-600 hover:text-red-900"
                              title="Eliminar"
                            >
                              <TrashIcon className="size-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile-friendly stacked layout */}
                <div className="space-y-4 sm:hidden">
                  {products.map((product) => (
                    <div
                      key={`${product.product_type}-${product.id}`}
                      className="rounded-lg border border-gray-200 bg-white p-4 mx-4 shadow-sm"
                    >
                      {/* Title row with status & visibility badges */}
                      <div className="flex flex-col gap-2">
                        <div className="text-sm font-semibold text-gray-900">
                          {product.name}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {getStatusBadge(product.status)}
                          {getVisibleBadge(product.visible)}
                        </div>
                      </div>

                      {/* Content row: image + main fields */}
                      <div className="mt-4 flex items-center gap-4">
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                          <img
                            alt={product.name}
                            src={getImageUrl(product)}
                            className="h-full w-full object-cover"
                          />
                        </div>

                        <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                          <div>
                            <p className="text-xs text-gray-500">Precio</p>
                            <p className="font-medium text-gray-900">€{product.price.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Stock</p>
                            <p className="font-medium text-gray-900">{product.total_stock}</p>
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            {product.product_type === 'others' && (
                              <button
                                onClick={() => handleEditVariations(product)}
                                className="text-indigo-600 hover:text-indigo-900"
                                title="Editar variaciones"
                              >
                                <PencilIcon className="size-5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleVisibility(product)}
                              className="text-blue-600 hover:text-blue-900"
                              title={product.visible ? 'Ocultar' : 'Mostrar'}
                            >
                              {product.visible ? (
                                <EyeSlashIcon className="size-5" />
                              ) : (
                                <EyeIcon className="size-5" />
                              )}
                            </button>
                            <button
                              onClick={() => handleDelete(product)}
                              className="text-red-600 hover:text-red-900"
                              title="Eliminar"
                            >
                              <TrashIcon className="size-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, type: '', product: null })}
        onConfirm={executeConfirmAction}
        title={
          confirmDialog.type === 'delete'
            ? 'Eliminar producto'
            : confirmDialog.product?.visible
            ? 'Ocultar producto'
            : 'Mostrar producto'
        }
        message={
          confirmDialog.type === 'delete'
            ? 'Esta acción no se puede deshacer. El producto dejará de ser visible en la galería y no podrás recuperarlo.'
            : confirmDialog.product?.visible
            ? '¿Estás seguro de que deseas ocultar este producto de la galería?'
            : '¿Estás seguro de que deseas hacer visible este producto en la galería?'
        }
        confirmText={confirmDialog.type === 'delete' ? 'Eliminar' : 'Confirmar'}
        type={confirmDialog.type === 'delete' ? 'danger' : 'warning'}
      />

      {/* Variation Edit Modal */}
      <VariationEditModal
        open={variationModal.open}
        onClose={() => setVariationModal({ open: false, product: null })}
        product={variationModal.product}
        onSave={handleSaveVariations}
      />
    </div>
  )
}

export default function SellerProductsPage() {
  return (
    <AuthGuard requireRole="seller">
      <SellerProductsPageContent />
    </AuthGuard>
  )
}
