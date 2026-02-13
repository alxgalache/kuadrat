'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { adminAPI, getAuthorImageUrl, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { SafeAuthorBio } from '@/components/SafeHTML'
import ConfirmDialog from '@/components/ConfirmDialog'
import VariationEditModal from '@/components/VariationEditModal'
import { useNotification } from '@/contexts/NotificationContext'
import { PencilIcon, EyeIcon, EyeSlashIcon, TrashIcon } from '@heroicons/react/24/outline'

function AuthorProfilePageContent({ params }) {
  const unwrappedParams = use(params)
  const [author, setAuthor] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { showSuccess, showApiError } = useNotification()

  // Modal states
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: '', product: null })
  const [variationModal, setVariationModal] = useState({ open: false, product: null })

  useEffect(() => {
    loadAuthorData()
  }, [])

  const loadAuthorData = async () => {
    try {
      const [authorData, productsData] = await Promise.all([
        adminAPI.authors.getById(unwrappedParams.id),
        adminAPI.authors.getProducts(unwrappedParams.id)
      ])
      setAuthor(authorData.author)
      setProducts(productsData.products)
    } catch (err) {
      setError('No se pudieron cargar los datos del autor')
      console.error('Error loading author data:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadProducts = async () => {
    try {
      const productsData = await adminAPI.authors.getProducts(unwrappedParams.id)
      setProducts(productsData.products)
    } catch (err) {
      console.error('Error reloading products:', err)
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
    setConfirmDialog({ open: true, type: 'visibility', product })
  }

  const handleDelete = (product) => {
    setConfirmDialog({ open: true, type: 'delete', product })
  }

  const handleEditVariations = (product) => {
    setVariationModal({ open: true, product })
  }

  const executeConfirmAction = async () => {
    const { type, product } = confirmDialog

    try {
      if (type === 'visibility') {
        await adminAPI.products.toggleVisibility(product.id, product.product_type, !product.visible)
        showSuccess(
          product.visible ? 'Producto oculto' : 'Producto visible',
          product.visible
            ? 'El producto ya no es visible en la galería'
            : 'El producto ahora es visible en la galería'
        )
      } else if (type === 'delete') {
        await adminAPI.products.delete(product.id, product.product_type)
        showSuccess('Producto eliminado', 'El producto ha sido eliminado permanentemente')
      }
      await loadProducts()
    } catch (err) {
      showApiError(err)
    } finally {
      setConfirmDialog({ open: false, type: '', product: null })
    }
  }

  const handleSaveVariations = async (variations) => {
    try {
      await adminAPI.products.updateVariations(variationModal.product.id, variations)
      showSuccess('Variaciones actualizadas', 'Las variaciones se han actualizado correctamente')
      await loadProducts()
      setVariationModal({ open: false, product: null })
    } catch (err) {
      showApiError(err)
      throw err
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (error || !author) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error || 'Autor no encontrado'}</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Back button */}
        <div className="mb-8">
          <Link href="/admin" className="text-sm font-semibold text-black hover:text-gray-500">
            ← Volver a autores
          </Link>
        </div>

        {/* Author Header */}
        <div className="md:flex md:items-center md:justify-between md:space-x-5">
          <div className="flex items-start space-x-5">
            <div className="shrink-0">
              <div className="relative">
                <img
                  alt={author.full_name || author.email}
                  src={author.profile_img ? getAuthorImageUrl(author.profile_img) : `https://ui-avatars.com/api/?name=${encodeURIComponent(author.full_name || author.email)}&background=random&size=128`}
                  className="size-16 rounded-full"
                />
                <span aria-hidden="true" className="absolute inset-0 rounded-full shadow-inner" />
              </div>
            </div>
            <div className="pt-1.5">
              <h1 className="text-2xl font-bold text-gray-900">{author.full_name || author.email}</h1>
              <p className="text-sm font-medium text-gray-500">
                Artista
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse justify-stretch space-y-4 space-y-reverse sm:flex-row-reverse sm:justify-end sm:space-y-0 sm:space-x-3 sm:space-x-reverse md:mt-0 md:flex-row md:space-x-3">
              <Link
                  href={`/admin/authors/${author.id}/edit`}
                  className="inline-flex items-center justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                  Editar
              </Link>
          </div>
        </div>

        {/* Author Bio */}
        {author.bio && (
          <div className="mt-8">
            <h2 className="text-lg font-medium text-gray-900">Biografía</h2>
            <SafeAuthorBio
              html={author.bio}
              className="mt-2 text-sm text-gray-700 prose prose-sm max-w-none"
            />
          </div>
        )}

        {/* Author Details */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {author.location && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Ubicación</dt>
              <dd className="mt-1 text-sm text-gray-900">{author.location}</dd>
            </div>
          )}
          {author.email && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="mt-1 text-sm text-gray-900">{author.email}</dd>
            </div>
          )}
          {author.email_contact && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Email de contacto</dt>
              <dd className="mt-1 text-sm text-gray-900">{author.email_contact}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-gray-500">Visible</dt>
            <dd className="mt-1 text-sm text-gray-900">{author.visible ? 'Sí' : 'No'}</dd>
          </div>
        </div>

        {/* Products Table */}
        <div className="mt-12">
          <div className="sm:flex sm:items-center">
            <div className="sm:flex-auto">
              <h1 className="text-base font-semibold text-gray-900">Productos</h1>
              <p className="mt-2 text-sm text-gray-700">
                Lista de todos los productos publicados por este autor
              </p>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Este autor no tiene productos publicados</p>
            </div>
          ) : (
            <div className="mt-8 flow-root">
              <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                  <table className="min-w-full divide-y divide-gray-300">
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
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

export default function AuthorProfilePage({ params }) {
  return (
    <AuthGuard requireRole="admin">
      <AuthorProfilePageContent params={params} />
    </AuthGuard>
  )
}
