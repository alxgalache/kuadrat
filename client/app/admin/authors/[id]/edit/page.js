'use client'

import { use, useRef, useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { adminAPI, getAuthorImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import SendcloudConfigSection from '@/components/admin/SendcloudConfigSection'
import AuthorImageDropzone from '@/components/admin/AuthorImageDropzone'
import ConfirmDialog from '@/components/ConfirmDialog'
import {
  SENDCLOUD_ENABLED,
  SELLER_KIND_LABELS,
  SELLER_KIND_DESCRIPTIONS,
  SELLER_KIND_CONFIRM_COPY,
  SELLER_KIND_ERRORS,
} from '@/lib/constants'
import { isArtistSeller, sellerKindOf } from '@/lib/sellerCapabilities'
import { useNotification } from '@/contexts/NotificationContext'
import QuillEditor from '@/components/QuillEditor'
import 'quill/dist/quill.snow.css'

function AuthorEditPageContent({ params }) {
  const unwrappedParams = use(params)
  const [author, setAuthor] = useState(null)
  const [fullName, setFullName] = useState('')
  const [slug, setSlug] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [email, setEmail] = useState('')
  const [emailContact, setEmailContact] = useState('')
  const [visible, setVisible] = useState(true)
  const [pickupAddress, setPickupAddress] = useState('')
  const [pickupCity, setPickupCity] = useState('')
  const [pickupPostalCode, setPickupPostalCode] = useState('')
  const [pickupCountry, setPickupCountry] = useState('')
  const [pickupInstructions, setPickupInstructions] = useState('')
  const [dealerCommissionArt, setDealerCommissionArt] = useState('')
  const [dealerCommissionOther, setDealerCommissionOther] = useState('')
  const [taxVatArt, setTaxVatArt] = useState('')
  const [taxVatOther, setTaxVatOther] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarMobileFile, setAvatarMobileFile] = useState(null)
  const [initialAvatarUrl, setInitialAvatarUrl] = useState('')
  const [initialAvatarMobileUrl, setInitialAvatarMobileUrl] = useState('')
  // Previews are rendered in the right column, so the URLs are lifted out of
  // the dropzones (which still own the object-URL lifecycle).
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarMobilePreview, setAvatarMobilePreview] = useState('')
  const [hideImgMobile, setHideImgMobile] = useState(false)
  // Tipo de vendedor (seller-kind-artist-speaker). `initialSellerKind` guarda
  // el valor con el que se cargó la ficha: es lo que distingue «he cambiado el
  // tipo» de «he guardado la ficha con el tipo que ya tenía». Solo el primero
  // pide confirmación y solo el primero cierra la sesión del vendedor.
  const [sellerKind, setSellerKind] = useState('artist')
  const [initialSellerKind, setInitialSellerKind] = useState('artist')
  const [kindConfirmOpen, setKindConfirmOpen] = useState(false)
  // Motivos que devuelve el 409 SELLER_KIND_CHANGE_BLOCKED, ya redactados por
  // el servidor. Se pintan tal cual: la pantalla nunca reconoce prosa.
  const [kindBlockers, setKindBlockers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const sendcloudRef = useRef(null)
  // Un solo predicado con nombre, consultado por la sección y por la rama de
  // guardado: dos condiciones en línea es como divergen.
  const showSendcloudSection = isArtistSeller(sellerKind)
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
      setSlug(author.slug || '')
      setBio(author.bio || '')
      setLocation(author.location || '')
      setEmail(author.email || '')
      setEmailContact(author.email_contact || '')
      setVisible(author.visible === 1)
      setPickupAddress(author.pickup_address || '')
      setPickupCity(author.pickup_city || '')
      setPickupPostalCode(author.pickup_postal_code || '')
      setPickupCountry(author.pickup_country || '')
      setPickupInstructions(author.pickup_instructions || '')
      setDealerCommissionArt(author.dealer_commission_art != null ? String(author.dealer_commission_art) : '')
      setDealerCommissionOther(author.dealer_commission_other != null ? String(author.dealer_commission_other) : '')
      setTaxVatArt(author.tax_vat_art != null ? String(author.tax_vat_art) : '')
      setTaxVatOther(author.tax_vat_other != null ? String(author.tax_vat_other) : '')
      setHideImgMobile(Boolean(Number(author.hide_profile_img_mobile)))
      setSellerKind(sellerKindOf(author))
      setInitialSellerKind(sellerKindOf(author))
      if (author.profile_img) {
        setInitialAvatarUrl(getAuthorImageUrl(author.profile_img))
      }
      if (author.profile_img_mobile) {
        setInitialAvatarMobileUrl(getAuthorImageUrl(author.profile_img_mobile))
      }
    } catch (err) {
      showApiError(err)
      router.push('/admin')
    } finally {
      setLoading(false)
    }
  }

  // File validation, preview and object-URL lifecycle now live in
  // AuthorImageDropzone, shared with the create page.

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

    // Validate commission percentages (0–100)
    const commissionArtNum = parseFloat(dealerCommissionArt)
    const commissionOtherNum = parseFloat(dealerCommissionOther)
    if (dealerCommissionArt === '' || isNaN(commissionArtNum) || commissionArtNum < 0 || commissionArtNum > 100) {
      showError('Error de validación', 'La comisión de arte debe ser un número entre 0 y 100')
      return
    }
    if (dealerCommissionOther === '' || isNaN(commissionOtherNum) || commissionOtherNum < 0 || commissionOtherNum > 100) {
      showError('Error de validación', 'La comisión de otros productos debe ser un número entre 0 y 100')
      return
    }

    // Validate VAT percentages (0–100)
    const taxVatArtNum = parseFloat(taxVatArt)
    const taxVatOtherNum = parseFloat(taxVatOther)
    if (taxVatArt === '' || isNaN(taxVatArtNum) || taxVatArtNum < 0 || taxVatArtNum > 100) {
      showError('Error de validación', 'El IVA de arte debe ser un número entre 0 y 100')
      return
    }
    if (taxVatOther === '' || isNaN(taxVatOtherNum) || taxVatOtherNum < 0 || taxVatOtherNum > 100) {
      showError('Error de validación', 'El IVA de otros productos debe ser un número entre 0 y 100')
      return
    }

    // Cambiar el tipo cierra la sesión del vendedor y cambia las secciones a
    // las que llega, así que se confirma antes de escribir nada — la misma
    // cortesía que el envío del enlace de contraseña. Guardar la ficha con el
    // tipo que ya tenía no pregunta y no expulsa a nadie.
    if (sellerKind !== initialSellerKind) {
      setKindConfirmOpen(true)
      return
    }

    await persistAuthor()
  }

  const persistAuthor = async () => {
    setKindBlockers([])
    setSaving(true)

    try {
      // First, upload the images that changed
      if (avatarFile) {
        await adminAPI.authors.uploadAvatar(unwrappedParams.id, avatarFile)
      }
      if (avatarMobileFile) {
        await adminAPI.authors.uploadAvatarMobile(unwrappedParams.id, avatarMobileFile)
      }

      // Then, update author data
      await adminAPI.authors.update(unwrappedParams.id, {
        full_name: fullName.trim(),
        slug: slug.trim(),
        bio: bio,
        location: location.trim(),
        email: email.trim(),
        email_contact: emailContact.trim(),
        visible: visible,
        pickup_address: pickupAddress.trim(),
        pickup_city: pickupCity.trim(),
        pickup_postal_code: pickupPostalCode.trim(),
        pickup_country: pickupCountry.trim(),
        pickup_instructions: pickupInstructions.trim(),
        dealer_commission_art: parseFloat(dealerCommissionArt),
        dealer_commission_other: parseFloat(dealerCommissionOther),
        tax_vat_art: parseFloat(taxVatArt),
        tax_vat_other: parseFloat(taxVatOther),
        hide_profile_img_mobile: hideImgMobile,
        seller_kind: sellerKind
      })

      // Save Sendcloud config if there is data. A speaker has no Sendcloud
      // section rendered, so there is nothing to read and the API would refuse
      // the write anyway (seller-kind-artist-speaker).
      if (SENDCLOUD_ENABLED && showSendcloudSection && sendcloudRef.current) {
        const { data, isNew } = sendcloudRef.current.getFormData()
        const hasData = sendcloudRef.current.hasData()

        if (hasData || !isNew) {
          if (isNew) {
            await adminAPI.authors.createSendcloudConfig(unwrappedParams.id, data)
          } else {
            await adminAPI.authors.updateSendcloudConfig(unwrappedParams.id, data)
          }
          sendcloudRef.current.markSaved(data)
        }
      }

      showSuccess('Actualizado', 'Autor actualizado correctamente')
      router.push(`/admin/authors/${unwrappedParams.id}`)
    } catch (err) {
      // El rechazo del cambio de tipo llega con su lista de motivos. Se pinta
      // en la propia pantalla, junto al selector, en lugar del aviso genérico:
      // el admin necesita saber QUÉ resolver, y el formulario conserva el
      // resto de sus cambios porque el servidor no escribió nada.
      if (err?.title === 'SELLER_KIND_CHANGE_BLOCKED') {
        setKindBlockers(err?.response?.blockers || [])
        setSellerKind(initialSellerKind)
        showError('No se pudo cambiar el tipo', SELLER_KIND_ERRORS.SELLER_KIND_CHANGE_BLOCKED)
      } else {
        showApiError(err)
      }
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
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
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
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                      />
                      <p className="mt-1 text-xs text-gray-500">URL-friendly: minúsculas, sin espacios, solo letras, números y guiones</p>
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
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
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
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
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
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
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
                            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
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
                              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
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
                              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
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
                            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
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
                            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm/6 font-semibold text-gray-900">Comisión de la galería</h3>
                    <p className="text-sm/6 text-gray-500">
                      Porcentaje que retiene la galería sobre cada venta de este vendedor.
                    </p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                      <div>
                        <label htmlFor="dealerCommissionArt" className="block text-sm/6 font-medium text-gray-900">
                          Comisión arte (%)
                        </label>
                        <div className="mt-2">
                          <input
                            id="dealerCommissionArt"
                            name="dealerCommissionArt"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={dealerCommissionArt}
                            onChange={(e) => setDealerCommissionArt(e.target.value)}
                            placeholder="Ej: 25"
                            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="dealerCommissionOther" className="block text-sm/6 font-medium text-gray-900">
                          Comisión otros productos (%)
                        </label>
                        <div className="mt-2">
                          <input
                            id="dealerCommissionOther"
                            name="dealerCommissionOther"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={dealerCommissionOther}
                            onChange={(e) => setDealerCommissionOther(e.target.value)}
                            placeholder="Ej: 10"
                            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tipo de usuario (seller-kind-artist-speaker). Cambiarlo
                      retira o concede secciones enteras y cierra la sesión del
                      vendedor, de ahí la confirmación previa al guardado. */}
                  <div>
                    <label htmlFor="sellerKind" className="block text-sm/6 font-medium text-gray-900">
                      Tipo de usuario
                    </label>
                    <div className="mt-2">
                      <select
                        id="sellerKind"
                        name="sellerKind"
                        value={sellerKind}
                        onChange={(e) => { setSellerKind(e.target.value); setKindBlockers([]) }}
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                      >
                        <option value="artist">{SELLER_KIND_LABELS.artist}</option>
                        <option value="speaker">{SELLER_KIND_LABELS.speaker}</option>
                      </select>
                    </div>
                    <p className="mt-2 text-sm/6 text-gray-500">{SELLER_KIND_DESCRIPTIONS[sellerKind]}</p>
                    {sellerKind !== initialSellerKind && (
                      <p className="mt-2 text-sm/6 text-amber-700">
                        Al guardar se cerrará la sesión de este vendedor.
                      </p>
                    )}
                    {kindBlockers.length > 0 && (
                      <div className="mt-3 rounded-md bg-red-50 p-3">
                        <p className="text-sm font-medium text-red-800">
                          {SELLER_KIND_ERRORS.SELLER_KIND_CHANGE_BLOCKED}
                        </p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                          {kindBlockers.map((b) => (
                            <li key={b.code}>{b.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm/6 font-semibold text-gray-900">IVA del vendedor</h3>
                    <p className="text-sm/6 text-gray-500">
                      10 = autor (REBU) · otro valor (p. ej. 21) = facturación vía cooperativa (régimen general). Solo afecta a ventas futuras.
                    </p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                      <div>
                        <label htmlFor="taxVatArt" className="block text-sm/6 font-medium text-gray-900">
                          IVA arte (%)
                        </label>
                        <div className="mt-2">
                          <input
                            id="taxVatArt"
                            name="taxVatArt"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={taxVatArt}
                            onChange={(e) => setTaxVatArt(e.target.value)}
                            placeholder="Ej: 10"
                            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="taxVatOther" className="block text-sm/6 font-medium text-gray-900">
                          IVA otros productos (%)
                        </label>
                        <div className="mt-2">
                          <input
                            id="taxVatOther"
                            name="taxVatOther"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={taxVatOther}
                            onChange={(e) => setTaxVatOther(e.target.value)}
                            placeholder="Ej: 21"
                            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
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

                  {/* Both image fields live here; their previews are rendered
                      in the right column (see below). */}
                  <AuthorImageDropzone
                    label="Avatar"
                    hint="Se muestra en pantallas grandes."
                    initialUrl={initialAvatarUrl}
                    onFileChange={setAvatarFile}
                    showPreview={false}
                    onPreviewChange={setAvatarPreview}
                  />

                  <AuthorImageDropzone
                    label="Imagen para móvil"
                    hint="Se muestra en pantallas pequeñas y medianas, donde la ficha se apila y la imagen es más apaisada. Si se deja vacía, se usa el avatar."
                    initialUrl={initialAvatarMobileUrl}
                    onFileChange={setAvatarMobileFile}
                    showPreview={false}
                    onPreviewChange={setAvatarMobilePreview}
                  />

                  <div className="relative flex items-start">
                    <div className="flex h-6 items-center">
                      <input
                        id="hide_profile_img_mobile"
                        name="hide_profile_img_mobile"
                        type="checkbox"
                        checked={hideImgMobile}
                        onChange={(e) => setHideImgMobile(e.target.checked)}
                        className="size-4 rounded border-gray-300 text-black focus:ring-black"
                      />
                    </div>
                    <div className="ml-3 text-sm/6">
                      <label htmlFor="hide_profile_img_mobile" className="font-medium text-gray-900">
                        No mostrar imagen en versión móvil
                      </label>
                      <p className="text-gray-500">
                        La ficha del artista se abrirá directamente por el nombre en pantallas pequeñas y medianas.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Column - previews of both images, stacked. The avatar
                    is shown as a plain rectangle: the artist card
                    (AuthorModal) crops it to a column, not to a circle. */}
                <div className="lg:col-span-2 space-y-8">
                  {avatarPreview && (
                    <div>
                      <label className="block text-sm/6 font-medium text-gray-900">
                        Vista previa del avatar
                      </label>
                      <div className="mt-2">
                        <Image
                          src={avatarPreview}
                          alt="Vista previa del avatar"
                          width={0}
                          height={0}
                          unoptimized
                          style={{ width: '100%', height: 'auto' }}
                        />
                      </div>
                    </div>
                  )}

                  {avatarMobilePreview && (
                    <div>
                      <label className="block text-sm/6 font-medium text-gray-900">
                        Vista previa de la imagen para móvil
                      </label>
                      <div className="mt-2">
                        <Image
                          src={avatarMobilePreview}
                          alt="Vista previa de la imagen para móvil"
                          width={0}
                          height={0}
                          unoptimized
                          style={{ width: '100%', height: 'auto' }}
                          className="rounded-lg"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sendcloud Configuration — only when enabled AND the author is an
              artist. A speaker never ships a product, so a sender address and
              a carrier preference on that account would be data nothing reads;
              the API refuses the write for the same reason. Reacts to the
              selector above without saving first, so the form always shows
              what the chosen type would have. */}
          {SENDCLOUD_ENABLED && author && showSendcloudSection && (
            <SendcloudConfigSection ref={sendcloudRef} authorId={unwrappedParams.id} />
          )}

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

        {/* Confirmación del cambio de tipo. Fuera del <form> a propósito: el
            ConfirmDialog de Headless UI se pinta por un portal y un submit
            disparado desde dentro del formulario volvería a entrar en
            handleSubmit. */}
        <ConfirmDialog
          open={kindConfirmOpen}
          onClose={() => setKindConfirmOpen(false)}
          onConfirm={() => {
            setKindConfirmOpen(false)
            persistAuthor()
          }}
          title={SELLER_KIND_CONFIRM_COPY.title}
          message={SELLER_KIND_CONFIRM_COPY.message(
            fullName || email,
            SELLER_KIND_LABELS[initialSellerKind],
            SELLER_KIND_LABELS[sellerKind]
          )}
          confirmText={SELLER_KIND_CONFIRM_COPY.confirmText}
        />
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
