'use client'

import { use, useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { adminAPI, getProductImageUrl } from '@/lib/api'
import { PhotoIcon } from '@heroicons/react/24/solid'
import { ChevronDownIcon } from '@heroicons/react/16/solid'
import AuthGuard from '@/components/AuthGuard'
import { useDropzone } from 'react-dropzone'
import { useNotification } from '@/contexts/NotificationContext'
import QuillEditor from '@/components/QuillEditor'
import 'quill/dist/quill.snow.css'

function ProductEditPageContent({ params }) {
  const unwrappedParams = use(params)
  const [product, setProduct] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [type, setType] = useState('physical')
  const [visible, setVisible] = useState(true)
  const [isSold, setIsSold] = useState(false)
  const [status, setStatus] = useState('pending')
  const [imageFile, setImageFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const { showError, showApiError, showSuccess } = useNotification()

  // Quill editor configuration
  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link'],
      ['clean']
    ]
  }), [])

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list',
    'link'
  ]

  useEffect(() => {
    loadProduct()
  }, [])

  const loadProduct = async () => {
    try {
      const data = await adminAPI.products.getById(unwrappedParams.id)
      const product = data.product
      setProduct(product)
      setName(product.name || '')
      setDescription(product.description || '')
      setPrice(product.price?.toString() || '')
      setType(product.type || 'physical')
      setVisible(product.visible === 1)
      setIsSold(product.is_sold === 1)
      setStatus(product.status || 'pending')
      if (product.basename) {
        setPreviewUrl(getProductImageUrl(product.basename))
      }
    } catch (err) {
      showApiError(err)
      router.push('/admin')
    } finally {
      setLoading(false)
    }
  }

  const validateAndSetImage = async (file) => {
    // Reset previous state
    if (previewUrl && imageFile) {
      try {
        URL.revokeObjectURL(previewUrl)
      } catch {}
    }
    setImageFile(null)

    if (!file) return

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      showError('Formato de imagen inválido', 'Solo se permiten imágenes PNG, JPG y WEBP')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      showError('Archivo demasiado grande', 'La imagen debe ser de 10MB o menos')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    try {
      const img = new Image()
      const loaded = new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })
      img.src = objectUrl
      await loaded

      if (img.naturalWidth < 600 || img.naturalHeight < 600) {
        showError('Imagen demasiado pequeña', 'La imagen debe tener una resolucion de al menos 600x600 pixeles')
        URL.revokeObjectURL(objectUrl)
        return
      }

      setImageFile(file)
      setPreviewUrl(objectUrl)
    } catch (err) {
      showError('Imagen inválida', 'No se pudo procesar el archivo de imagen')
      try {
        URL.revokeObjectURL(objectUrl)
      } catch {}
    }
  }

  const onDrop = async (acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      await validateAndSetImage(acceptedFiles[0])
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp']
    },
    maxFiles: 1,
    multiple: false
  })

  useEffect(() => {
    return () => {
      if (previewUrl && imageFile) {
        try {
          URL.revokeObjectURL(previewUrl)
        } catch {}
      }
    }
  }, [previewUrl, imageFile])

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validate
    if (!name.trim()) {
      showError('Error de validación', 'El nombre es obligatorio')
      return
    }

    if (!price || isNaN(parseFloat(price))) {
      showError('Error de validación', 'El precio debe ser un número válido')
      return
    }

    setSaving(true)

    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('description', description)
      formData.append('price', parseFloat(price).toString())
      formData.append('type', type)
      formData.append('visible', visible ? '1' : '0')
      formData.append('is_sold', isSold ? '1' : '0')
      formData.append('status', status)

      if (imageFile) {
        formData.append('image', imageFile)
      }

      await adminAPI.products.update(unwrappedParams.id, formData)
      showSuccess('Actualizado', 'Producto actualizado correctamente')
      router.back()
    } catch (err) {
      showApiError(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <form onSubmit={handleSubmit}>
          <div className="space-y-12">
            <div className="border-b border-gray-900/10 pb-12">
              <h2 className="text-base/7 font-semibold text-gray-900">Editar Producto</h2>
              <p className="mt-1 text-sm/6 text-gray-600">
                Edita la información del producto
              </p>

              <div className="mt-10 grid grid-cols-1 lg:grid-cols-5 gap-x-8 gap-y-8">
                {/* Left Column - Form Fields */}
                <div className="lg:col-span-3 space-y-8">
                  <div>
                    <label htmlFor="name" className="block text-sm/6 font-medium text-gray-900">
                      Nombre del producto
                    </label>
                    <div className="mt-2">
                      <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="description" className="block text-sm/6 font-medium text-gray-900">
                      Descripción
                    </label>
                    <div className="mt-2">
                      <QuillEditor
                        value={description}
                        onChange={setDescription}
                        modules={modules}
                        formats={formats}
                        placeholder="Escribe la descripción del producto..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-8">
                    <div>
                      <label htmlFor="price" className="block text-sm/6 font-medium text-gray-900">
                        Precio (€)
                      </label>
                      <div className="mt-2">
                        <input
                          id="price"
                          name="price"
                          type="number"
                          step="0.01"
                          required
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="type" className="block text-sm/6 font-medium text-gray-900">
                        Tipo
                      </label>
                      <div className="mt-2 grid grid-cols-1">
                        <select
                          id="type"
                          name="type"
                          value={type}
                          onChange={(e) => setType(e.target.value)}
                          className="col-start-1 row-start-1 w-full appearance-none rounded-md border border-gray-300 bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                        >
                          <option value="physical">Físico</option>
                          <option value="digital">Digital</option>
                        </select>
                        <ChevronDownIcon
                          aria-hidden="true"
                          className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="status" className="block text-sm/6 font-medium text-gray-900">
                      Estado
                    </label>
                    <div className="mt-2 grid grid-cols-1">
                      <select
                        id="status"
                        name="status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="col-start-1 row-start-1 w-full appearance-none rounded-md border border-gray-300 bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                      >
                        <option value="pending">Pendiente</option>
                        <option value="approved">Aprobado</option>
                        <option value="rejected">Rechazado</option>
                      </select>
                      <ChevronDownIcon
                        aria-hidden="true"
                        className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="relative flex items-start">
                      <div className="flex h-6 items-center">
                        <input
                          id="visible"
                          name="visible"
                          type="checkbox"
                          checked={visible}
                          onChange={(e) => setVisible(e.target.checked)}
                          className="size-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                        />
                      </div>
                      <div className="ml-3 text-sm/6">
                        <label htmlFor="visible" className="font-medium text-gray-900">
                          Visible
                        </label>
                      </div>
                    </div>

                    <div className="relative flex items-start">
                      <div className="flex h-6 items-center">
                        <input
                          id="isSold"
                          name="isSold"
                          type="checkbox"
                          checked={isSold}
                          onChange={(e) => setIsSold(e.target.checked)}
                          className="size-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                        />
                      </div>
                      <div className="ml-3 text-sm/6">
                        <label htmlFor="isSold" className="font-medium text-gray-900">
                          Vendido
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Image Upload */}
                  <div>
                    <label className="block text-sm/6 font-medium text-gray-900">
                      Imagen del producto
                    </label>
                    <p className="text-xs text-gray-500 mt-1">Deja vacío para mantener la imagen actual</p>
                    <div
                      {...getRootProps()}
                      className={`mt-2 flex justify-center rounded-lg border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
                        isDragActive
                          ? 'border-black bg-gray-50'
                          : 'border-gray-900/25 hover:border-gray-900/50'
                      }`}
                    >
                      <div className="text-center">
                        <PhotoIcon aria-hidden="true" className="mx-auto size-12 text-gray-300"/>
                        <div className="mt-4 flex text-sm/6 text-gray-600">
                          <input {...getInputProps()} />
                          <p className="font-semibold text-black">
                            {isDragActive ? 'Suelta la imagen aquí' : 'Haz clic para subir o arrastra y suelta'}
                          </p>
                        </div>
                        <p className="text-xs/5 text-gray-600">PNG, JPG o WEBP hasta 10MB, mínimo 600x600</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column - Image Preview */}
                <div className="lg:col-span-2 space-y-4">
                  {previewUrl && (
                    <div>
                      <label className="block text-sm/6 font-medium text-gray-900">Vista previa</label>
                      <div className="mt-2">
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="w-full rounded-md"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-x-6">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-sm/6 font-semibold text-gray-900"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProductEditPage({ params }) {
  return (
    <AuthGuard requireRole="admin">
      <ProductEditPageContent params={params} />
    </AuthGuard>
  )
}
