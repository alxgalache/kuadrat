'use client'

import { use, useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { adminAPI, getAuthorImageUrl } from '@/lib/api'
import { PhotoIcon } from '@heroicons/react/24/solid'
import AuthGuard from '@/components/AuthGuard'
import { useDropzone } from 'react-dropzone'
import { useNotification } from '@/contexts/NotificationContext'
import QuillEditor from '@/components/QuillEditor'
import 'quill/dist/quill.snow.css'

function AuthorEditPageContent({ params }) {
  const unwrappedParams = use(params)
  const [author, setAuthor] = useState(null)
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [email, setEmail] = useState('')
  const [emailContact, setEmailContact] = useState('')
  const [visible, setVisible] = useState(true)
  const [avatarFile, setAvatarFile] = useState(null)
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
    loadAuthor()
  }, [])

  const loadAuthor = async () => {
    try {
      const data = await adminAPI.authors.getById(unwrappedParams.id)
      const author = data.author
      setAuthor(author)
      setFullName(author.full_name || '')
      setBio(author.bio || '')
      setLocation(author.location || '')
      setEmail(author.email || '')
      setEmailContact(author.email_contact || '')
      setVisible(author.visible === 1)
      if (author.profile_img) {
        setPreviewUrl(getAuthorImageUrl(author.profile_img))
      }
    } catch (err) {
      showApiError(err)
      router.push('/admin')
    } finally {
      setLoading(false)
    }
  }

  const validateAndSetAvatar = async (file) => {
    // Reset previous state
    if (previewUrl && avatarFile) {
      try {
        URL.revokeObjectURL(previewUrl)
      } catch {}
    }
    setAvatarFile(null)

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

      setAvatarFile(file)
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
      await validateAndSetAvatar(acceptedFiles[0])
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
      if (previewUrl && avatarFile) {
        try {
          URL.revokeObjectURL(previewUrl)
        } catch {}
      }
    }
  }, [previewUrl, avatarFile])

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validate required fields
    if (!fullName.trim()) {
      showError('Error de validación', 'El nombre completo es obligatorio')
      return
    }

    if (!email.trim()) {
      showError('Error de validación', 'El email es obligatorio')
      return
    }

    setSaving(true)

    try {
      // First, upload avatar if changed
      if (avatarFile) {
        await adminAPI.authors.uploadAvatar(unwrappedParams.id, avatarFile)
      }

      // Then, update author data
      await adminAPI.authors.update(unwrappedParams.id, {
        full_name: fullName.trim(),
        bio: bio,
        location: location.trim(),
        email: email.trim(),
        email_contact: emailContact.trim(),
        visible: visible
      })

      showSuccess('Actualizado', 'Autor actualizado correctamente')
      router.push(`/admin/authors/${unwrappedParams.id}`)
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
              <h2 className="text-base/7 font-semibold text-gray-900">Editar Autor</h2>
              <p className="mt-1 text-sm/6 text-gray-600">
                Edita la información del autor
              </p>

              <div className="mt-10 grid grid-cols-1 lg:grid-cols-5 gap-x-8 gap-y-8">
                {/* Left Column - Form Fields */}
                <div className="lg:col-span-3 space-y-8">
                  <div>
                    <label htmlFor="fullName" className="block text-sm/6 font-medium text-gray-900">
                      Nombre completo
                    </label>
                    <div className="mt-2">
                      <input
                        id="fullName"
                        name="fullName"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="bio" className="block text-sm/6 font-medium text-gray-900">
                      Biografía
                    </label>
                    <div className="mt-2">
                      <QuillEditor
                        value={bio}
                        onChange={setBio}
                        modules={modules}
                        formats={formats}
                        placeholder="Escribe la biografía del autor..."
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="location" className="block text-sm/6 font-medium text-gray-900">
                      Ubicación
                    </label>
                    <div className="mt-2">
                      <input
                        id="location"
                        name="location"
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm/6 font-medium text-gray-900">
                      Email
                    </label>
                    <div className="mt-2">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="emailContact" className="block text-sm/6 font-medium text-gray-900">
                      Email de contacto
                    </label>
                    <div className="mt-2">
                      <input
                        id="emailContact"
                        name="emailContact"
                        type="email"
                        value={emailContact}
                        onChange={(e) => setEmailContact(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                      />
                    </div>
                  </div>

                  <div className="relative flex items-start">
                    <div className="flex h-6 items-center">
                        <input
                            id="visible"
                            name="visible"
                            type="checkbox"
                            checked={visible}
                            onChange={(e) => setVisible(e.target.checked)}
                        className="size-4 rounded border-gray-300 text-black focus:ring-black"
                      />
                    </div>
                    <div className="ml-3 text-sm/6">
                      <label htmlFor="visible" className="font-medium text-gray-900">
                        Visible
                      </label>
                      <p className="text-gray-500">El autor aparecerá en la galería pública</p>
                    </div>
                  </div>

                  {/* Avatar Upload */}
                  <div>
                    <label className="block text-sm/6 font-medium text-gray-900">
                      Avatar
                    </label>
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
                        <p className="text-xs/5 text-gray-600">PNG, JPG o WEBP hasta 10MB</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column - Avatar Preview */}
                <div className="lg:col-span-2 space-y-4">
                  {previewUrl && (
                    <div>
                      <label className="block text-sm/6 font-medium text-gray-900">Vista previa</label>
                      <div className="mt-2">
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="w-full rounded-full"
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
              className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AuthorEditPage({ params }) {
  return (
    <AuthGuard requireRole="admin">
      <AuthorEditPageContent params={params} />
    </AuthGuard>
  )
}
