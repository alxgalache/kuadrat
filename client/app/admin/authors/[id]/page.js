'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { adminAPI, getAuthorImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'

function AuthorProfilePageContent({ params }) {
  const unwrappedParams = use(params)
  const [author, setAuthor] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring inset-ring-gray-300 hover:bg-gray-50"
            >
              Ver productos
            </button>
              <Link
                  href={`/admin/authors/${author.id}/edit`}
                  type="button"
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
            <div
              className="mt-2 text-sm text-gray-700 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: author.bio }}
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
        <div className="mt-12 px-4 sm:px-6 lg:px-8">
          <div className="sm:flex sm:items-center">
            <div className="sm:flex-auto">
              <h1 className="text-base font-semibold text-gray-900">Productos</h1>
              <p className="mt-2 text-sm text-gray-700">
                Lista de todos los productos publicados por este autor
              </p>
            </div>
          </div>
          <div className="mt-8 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <div className="overflow-hidden shadow-sm outline-1 outline-black/5 sm:rounded-lg">
                  <table className="relative min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                          Nombre
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Precio
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Tipo
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Estado
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Visible
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Vendido
                        </th>
                        <th scope="col" className="py-3.5 pr-4 pl-3 sm:pr-6">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {products.map((product) => (
                        <tr key={product.id}>
                          <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-gray-900 sm:pl-6">
                            {product.name}
                          </td>
                          <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                            €{product.price.toFixed(2)}
                          </td>
                          <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                            {product.type}
                          </td>
                          <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500 capitalize">
                            {product.status}
                          </td>
                          <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                            {product.visible ? 'Sí' : 'No'}
                          </td>
                          <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                            {product.is_sold ? 'Sí' : 'No'}
                          </td>
                          <td className="py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-6 space-x-4">
                            <Link href={`/galeria/${product.id}`} className="text-black hover:text-gray-500">
                              Ver
                            </Link>
                              <Link href={`/admin/products/${product.id}/edit`} className="text-black hover:text-gray-500">
                              Editar
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {products.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">Este autor no tiene productos publicados</p>
            </div>
          )}
        </div>
      </div>
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
