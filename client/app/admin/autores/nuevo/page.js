'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { adminAPI, getAuthorImageUrl } from '@/lib/api'
import { PhotoIcon } from '@heroicons/react/24/solid'
import AuthGuard from '@/components/AuthGuard'
import { useDropzone } from 'react-dropzone'
import { useNotification } from '@/contexts/NotificationContext'
import QuillEditor from '@/components/QuillEditor'
import 'quill/dist/quill.snow.css'

function NewAuthorPageContent() {
  const [fullName, setFullName] = useState('')
  const [slug, setSlug] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailContact, setEmailContact] = useState('')
  const [visible, setVisible] = useState(true)
  const [pickupAddress, setPickupAddress] = useState('')
  const [pickupCity, setPickupCity] = useState('')
  const [pickupPostalCode, setPickupPostalCode] = useState('')
  const [pickupCountry, setPickupCountry] = useState('')
  const [pickupInstructions, setPickupInstructions] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
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

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validate required fields
    if (!fullName.trim()) {
      showError('Error de validación', 'El nombre completo es obligatorio')
      return
    }

    if (!slug.trim()) {
      showError('Error de validación', 'El slug es obligatorio')
      return
    }

    // Validate slug format (lowercase, alphanumeric with hyphens)
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    if (!slugRegex.test(slug.trim())) {
      showError('Error de validación', 'El slug debe ser en minúsculas, sin espacios, solo letras, números y guiones (ej: "john-doe")')
      return
    }

    if (!email.trim()) {
      showError('Error de validación', 'El email es obligatorio')
      return
    }

    if (!password.trim()) {
      showError('Error de validación', 'La contraseña es obligatoria')
      return
    }

    if (password.length < 6) {
      showError('Error de validación', 'La contraseña debe tener al menos 6 caracteres')
      return
    }

    setSaving(true)

    try {
      // Create author
      const result = await adminAPI.authors.create({
        full_name: fullName.trim(),
        slug: slug.trim(),
        bio: bio,
        location: location.trim(),
        email: email.trim(),
        password: password,
        email_contact: emailContact.trim(),
        visible: visible,
        pickup_address: pickupAddress.trim(),
        pickup_city: pickupCity.trim(),
        pickup_postal_code: pickupPostalCode.trim(),
        pickup_country: pickupCountry.trim(),
        pickup_instructions: pickupInstructions.trim()
      })

      const newAuthorId = result.author.id

      // Upload avatar if provided
      if (avatarFile && newAuthorId) {
        await adminAPI.authors.uploadAvatar(newAuthorId, avatarFile)
      }

      showSuccess('Creado', 'Autor creado correctamente')
      router.push(`/admin/authors/${newAuthorId}`)
    } catch (err) {
      showApiError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <form onSubmit={handleSubmit}>
          <div className="space-y-12">
            <div className="border-b border-gray-900/10 pb-12">
              <h2 className="text-base/7 font-semibold text-gray-900">Nuevo Autor</h2>
              <p className="mt-1 text-sm/6 text-gray-600">
                Crea un nuevo usuario con rol de vendedor (seller)
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
                    <label htmlFor="slug" className="block text-sm/6 font-medium text-gray-900">
                      Slug
                    </label>
                    <div className="mt-2">
                      <input
                        id="slug"
                        name="slug"
                        type="text"
                        required
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="ej: john-doe"
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                      />
                      <p className="mt-1 text-xs text-gray-500">URL-friendly: minúsculas, sin espacios, solo letras, números y guiones</p>
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
                    <label htmlFor="password" className="block text-sm/6 font-medium text-gray-900">
                      Contraseña
                    </label>
                    <div className="mt-2">
                      <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                      />
                      <p className="mt-1 text-xs text-gray-500">Mínimo 6 caracteres</p>
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

                  {/* Pickup Address Section */}
                  <div className="pt-8 border-t border-gray-200">
                    <h3 className="text-base font-semibold text-gray-900 mb-4">Dirección de recogida</h3>
                    <p className="text-sm text-gray-600 mb-6">
                      Información para la recogida presencial de productos
                    </p>

                    <div className="space-y-6">
                      <div>
                        <label htmlFor="pickupAddress" className="block text-sm/6 font-medium text-gray-900">
                          Dirección
                        </label>
                        <div className="mt-2">
                          <input
                            id="pickupAddress"
                            name="pickupAddress"
                            type="text"
                            value={pickupAddress}
                            onChange={(e) => setPickupAddress(e.target.value)}
                            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <div>
                          <label htmlFor="pickupCity" className="block text-sm/6 font-medium text-gray-900">
                            Ciudad
                          </label>
                          <div className="mt-2">
                            <input
                              id="pickupCity"
                              name="pickupCity"
                              type="text"
                              value={pickupCity}
                              onChange={(e) => setPickupCity(e.target.value)}
                              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                            />
                          </div>
                        </div>

                        <div>
                          <label htmlFor="pickupPostalCode" className="block text-sm/6 font-medium text-gray-900">
                            Código postal
                          </label>
                          <div className="mt-2">
                            <input
                              id="pickupPostalCode"
                              name="pickupPostalCode"
                              type="text"
                              value={pickupPostalCode}
                              onChange={(e) => setPickupPostalCode(e.target.value)}
                              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="pickupCountry" className="block text-sm/6 font-medium text-gray-900">
                          País
                        </label>
                        <div className="mt-2">
                          <input
                            id="pickupCountry"
                            name="pickupCountry"
                            type="text"
                            value={pickupCountry}
                            onChange={(e) => setPickupCountry(e.target.value)}
                            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="pickupInstructions" className="block text-sm/6 font-medium text-gray-900">
                          Instrucciones de recogida
                        </label>
                        <div className="mt-2">
                          <textarea
                            id="pickupInstructions"
                            name="pickupInstructions"
                            rows={3}
                            value={pickupInstructions}
                            onChange={(e) => setPickupInstructions(e.target.value)}
                            placeholder="Ej: Llamar al timbre, horario de recogida, etc."
                            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                          />
                        </div>
                      </div>
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
                      Avatar (opcional)
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
              onClick={() => router.push('/admin/autores')}
              className="text-sm/6 font-semibold text-gray-900"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
            >
              {saving ? 'Creando...' : 'Crear autor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function NewAuthorPage() {
  return (
    <AuthGuard requireRole="admin">
      <NewAuthorPageContent />
    </AuthGuard>
  )
}
