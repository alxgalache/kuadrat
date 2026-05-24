'use client'

import {useState, useEffect, useMemo} from 'react'
import NextImage from 'next/image'
import {useRouter} from 'next/navigation'
import {artAPI, othersAPI} from '@/lib/api'
import {PhotoIcon, PlusIcon, XMarkIcon} from '@heroicons/react/24/solid'
import {ChevronDownIcon} from '@heroicons/react/16/solid'
import AuthGuard from '@/components/AuthGuard'
import {SENDCLOUD_ENABLED_ART, SENDCLOUD_ENABLED_OTHERS, MAX_PRODUCT_IMAGES} from '@/lib/constants'
import {useDropzone} from 'react-dropzone'
import {useNotification} from '@/contexts/NotificationContext'
import QuillEditor from '@/components/QuillEditor'
import 'quill/dist/quill.snow.css'

// Async file validation: MIME + size + minimum dimensions. Returns the file on
// success, throws an Error with a Spanish message on failure.
async function validateImageFile(file) {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Solo se permiten imágenes PNG, JPG y WEBP')
    }
    if (file.size > 10 * 1024 * 1024) {
        throw new Error('La imagen debe ser de 10MB o menos')
    }
    const objectUrl = URL.createObjectURL(file)
    try {
        const img = new Image()
        await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
            img.src = objectUrl
        })
        if (img.naturalWidth < 600 || img.naturalHeight < 600) {
            URL.revokeObjectURL(objectUrl)
            throw new Error('La imagen debe tener una resolución de al menos 600x600 píxeles')
        }
        return { file, previewUrl: objectUrl }
    } catch (err) {
        URL.revokeObjectURL(objectUrl)
        if (err instanceof Error) throw err
        throw new Error('No se pudo procesar el archivo de imagen')
    }
}

// Single image dropzone slot. Owns its own react-dropzone hook so multiple
// slots can coexist on the same form. When an image is selected, shows a
// compact thumbnail + action buttons instead of the dashed upload area.
function ImageDropzoneSlot({ previewUrl, onDrop, onClear, isFirst }) {
    const {getRootProps, getInputProps, isDragActive, open} = useDropzone({
        onDrop: (files) => { if (files?.[0]) onDrop(files[0]) },
        accept: {
            'image/png': ['.png'],
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/webp': ['.webp']
        },
        maxFiles: 1,
        multiple: false,
        noClick: !!previewUrl,
    })

    if (previewUrl) {
        return (
            <div
                {...getRootProps()}
                className={`mt-2 flex items-center gap-4 rounded-lg border px-4 py-4 transition-colors cursor-default ${
                    isDragActive ? 'border-black bg-gray-100' : 'border-gray-200 bg-gray-50'
                }`}
            >
                <input {...getInputProps()} />
                <NextImage
                    src={previewUrl}
                    alt="Preview"
                    width={80}
                    height={80}
                    unoptimized
                    className="size-20 flex-shrink-0 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1">
                    {isDragActive ? (
                        <p className="text-sm font-semibold text-black">Suelta para reemplazar</p>
                    ) : (
                        <>
                            <p className="text-sm font-medium text-gray-600">Imagen subida</p>
                            <div className="mt-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); open() }}
                                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
                                >
                                    Reemplazar
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onClear() }}
                                    className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-800"
                                >
                                    Limpiar
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )
    }

    return (
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
                        {isDragActive
                            ? 'Suelta la imagen aquí'
                            : isFirst
                                ? 'Haz clic para subir o arrastra y suelta'
                                : 'Sube otra imagen'}
                    </p>
                </div>
                <p className="text-xs/5 text-gray-600">PNG, JPG o WEBP hasta 10MB, mínimo 600x600</p>
            </div>
        </div>
    )
}

function PublishProductPageContent() {
    const [productCategory, setProductCategory] = useState('art')
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [type, setType] = useState('')
    const [weight, setWeight] = useState('')
    const [dimensions, setDimensions] = useState('')
    const [canCopack, setCanCopack] = useState(true)
    const [forAuction, setForAuction] = useState(false)
    const [aiGenerated, setAiGenerated] = useState(false)
    // Global product image slots (1..MAX_PRODUCT_IMAGES). Each slot is either
    // null (empty) or { file: File, previewUrl: string }. The first slot is
    // required; additional slots are optional and individually removable.
    const [imageSlots, setImageSlots] = useState([null])
    const [loading, setLoading] = useState(false)
    const [showDecimalWarning, setShowDecimalWarning] = useState(false)

    // For "others" products - variations. Each variation has its own array of
    // image slots (0..MAX_PRODUCT_IMAGES). Variation images are optional.
    const [hasVariations, setHasVariations] = useState(false)
    const [globalStock, setGlobalStock] = useState('')
    const [variations, setVariations] = useState([
        { key: '', stock: '', imageSlots: [null] }
    ])

    const router = useRouter()
    const {showError, showApiError, showSuccess} = useNotification()

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

    // Global image handlers
    const handleGlobalSlotDrop = async (slotIndex, file) => {
        try {
            const entry = await validateImageFile(file)
            setImageSlots((prev) => {
                const next = [...prev]
                if (next[slotIndex]?.previewUrl) {
                    try { URL.revokeObjectURL(next[slotIndex].previewUrl) } catch {}
                }
                next[slotIndex] = entry
                return next
            })
        } catch (err) {
            showError('Imagen inválida', err.message)
        }
    }

    const handleClearGlobalSlot = (slotIndex) => {
        setImageSlots((prev) => {
            const next = [...prev]
            const removed = next[slotIndex]
            if (removed?.previewUrl) {
                try { URL.revokeObjectURL(removed.previewUrl) } catch {}
            }
            next[slotIndex] = null
            return next
        })
    }

    const handleAddGlobalSlot = () => {
        setImageSlots((prev) => (prev.length < MAX_PRODUCT_IMAGES ? [...prev, null] : prev))
    }

    const handleRemoveGlobalSlot = (slotIndex) => {
        setImageSlots((prev) => {
            if (prev.length <= 1 || slotIndex === 0) return prev
            const removed = prev[slotIndex]
            if (removed?.previewUrl) {
                try { URL.revokeObjectURL(removed.previewUrl) } catch {}
            }
            return prev.filter((_, i) => i !== slotIndex)
        })
    }

    // Variation handlers
    const handleAddVariation = () => {
        setVariations((prev) => [...prev, { key: '', stock: '', imageSlots: [null] }])
    }

    const handleRemoveVariation = (index) => {
        setVariations((prev) => {
            if (prev.length <= 1) return prev
            const removed = prev[index]
            if (removed?.imageSlots) {
                for (const slot of removed.imageSlots) {
                    if (slot?.previewUrl) {
                        try { URL.revokeObjectURL(slot.previewUrl) } catch {}
                    }
                }
            }
            return prev.filter((_, i) => i !== index)
        })
    }

    const handleVariationChange = (index, field, value) => {
        setVariations((prev) => {
            const next = [...prev]
            next[index] = { ...next[index], [field]: value }
            return next
        })
    }

    const handleVariationSlotDrop = async (varIndex, slotIndex, file) => {
        try {
            const entry = await validateImageFile(file)
            setVariations((prev) => {
                const next = [...prev]
                const slots = [...next[varIndex].imageSlots]
                if (slots[slotIndex]?.previewUrl) {
                    try { URL.revokeObjectURL(slots[slotIndex].previewUrl) } catch {}
                }
                slots[slotIndex] = entry
                next[varIndex] = { ...next[varIndex], imageSlots: slots }
                return next
            })
        } catch (err) {
            showError('Imagen inválida', `Variación ${varIndex + 1}: ${err.message}`)
        }
    }

    const handleAddVariationSlot = (varIndex) => {
        setVariations((prev) => {
            const next = [...prev]
            if (next[varIndex].imageSlots.length >= MAX_PRODUCT_IMAGES) return prev
            next[varIndex] = {
                ...next[varIndex],
                imageSlots: [...next[varIndex].imageSlots, null],
            }
            return next
        })
    }

    const handleRemoveVariationSlot = (varIndex, slotIndex) => {
        setVariations((prev) => {
            const next = [...prev]
            const slots = [...next[varIndex].imageSlots]
            if (slots.length <= 1 || slotIndex === 0) return prev
            const removed = slots[slotIndex]
            if (removed?.previewUrl) {
                try { URL.revokeObjectURL(removed.previewUrl) } catch {}
            }
            next[varIndex] = {
                ...next[varIndex],
                imageSlots: slots.filter((_, i) => i !== slotIndex),
            }
            return next
        })
    }

    const handleClearVariationSlot = (varIndex, slotIndex) => {
        setVariations((prev) => {
            const next = [...prev]
            const slots = [...next[varIndex].imageSlots]
            if (slots[slotIndex]?.previewUrl) {
                try { URL.revokeObjectURL(slots[slotIndex].previewUrl) } catch {}
            }
            slots[slotIndex] = null
            next[varIndex] = { ...next[varIndex], imageSlots: slots }
            return next
        })
    }

    const handleAddVariationSlotWithFile = async (varIndex, file) => {
        try {
            const entry = await validateImageFile(file)
            setVariations((prev) => {
                const next = [...prev]
                if (next[varIndex].imageSlots.length >= MAX_PRODUCT_IMAGES) return prev
                next[varIndex] = {
                    ...next[varIndex],
                    imageSlots: [...next[varIndex].imageSlots, entry],
                }
                return next
            })
        } catch (err) {
            showError('Imagen inválida', `Variación ${varIndex + 1}: ${err.message}`)
        }
    }

    // Cleanup all object URLs on unmount
    useEffect(() => {
        return () => {
            for (const slot of imageSlots) {
                if (slot?.previewUrl) {
                    try { URL.revokeObjectURL(slot.previewUrl) } catch {}
                }
            }
            for (const v of variations) {
                for (const slot of v.imageSlots || []) {
                    if (slot?.previewUrl) {
                        try { URL.revokeObjectURL(slot.previewUrl) } catch {}
                    }
                }
            }
        }
        // We intentionally run cleanup only on unmount, not on every slot
        // change — individual slot drops/removals revoke their own URLs above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()

        // Collect validation errors
        const validationErrors = []

        // Validate name (5-200 characters)
        if (!name || name.trim().length < 5) {
            validationErrors.push({ field: 'name', message: 'El nombre debe tener al menos 5 caracteres' })
        } else if (name.trim().length > 200) {
            validationErrors.push({ field: 'name', message: 'El nombre no debe exceder 200 caracteres' })
        }

        // Validate description (100-1000 characters from plain text)
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = description
        const plainText = tempDiv.textContent || tempDiv.innerText || ''
        const trimmedPlainText = plainText.trim()

        if (!trimmedPlainText || trimmedPlainText.length < 100) {
            validationErrors.push({ field: 'description', message: 'La descripción debe tener al menos 100 caracteres' })
        } else if (trimmedPlainText.length > 1000) {
            validationErrors.push({ field: 'description', message: 'La descripción no debe exceder 1000 caracteres' })
        }

        // Validate price (10-10000)
        const priceNum = parseFloat(price)
        if (!price || isNaN(priceNum)) {
            validationErrors.push({ field: 'price', message: 'El precio es obligatorio' })
        } else if (priceNum < 10) {
            validationErrors.push({ field: 'price', message: 'El precio debe ser al menos €10' })
        } else if (priceNum > 10000) {
            validationErrors.push({ field: 'price', message: 'El precio no debe exceder €10,000' })
        }

        // Validate type/soporte (only for art)
        if (productCategory === 'art') {
            if (!type || type.trim().length < 3) {
                validationErrors.push({ field: 'type', message: 'El soporte debe tener al menos 3 caracteres' })
            } else if (type.trim().length > 100) {
                validationErrors.push({ field: 'type', message: 'El soporte no debe exceder 100 caracteres' })
            }
        }

        // Validate weight — mandatory when Sendcloud enabled for this product type
        const weightRequired = (productCategory === 'art' && SENDCLOUD_ENABLED_ART) || (productCategory === 'others' && SENDCLOUD_ENABLED_OTHERS)
        if (weightRequired && (!weight || !weight.trim())) {
            validationErrors.push({ field: 'weight', message: 'El peso es obligatorio para poder calcular el envío' })
        } else if (weight && weight.trim()) {
            const weightNum = parseInt(weight, 10)
            if (isNaN(weightNum) || weightNum <= 0) {
                validationErrors.push({ field: 'weight', message: 'El peso debe ser un número válido mayor que 0' })
            }
        }

        // Validate dimensions (optional, but if provided must follow format WxLxH)
        if (dimensions && dimensions.trim()) {
            const dimensionsRegex = /^\d+x\d+x\d+$/
            if (!dimensionsRegex.test(dimensions.trim())) {
                validationErrors.push({ field: 'dimensions', message: 'Las dimensiones deben estar en formato "LxWxH" (ej: 30x20x10)' })
            }
        }

        // Validate global image slots. The first slot is required EXCEPT when
        // the product is 'other' with named variations — in that mode each
        // variation must carry its own image, and the global is optional.
        const filledGlobalSlots = imageSlots.filter(Boolean)
        const globalImageRequired = !(productCategory === 'other' && hasVariations)
        if (globalImageRequired && (filledGlobalSlots.length === 0 || !imageSlots[0])) {
            validationErrors.push({ field: 'images', message: 'La primera imagen del producto es obligatoria' })
        }

        // Validate stock/variations for "others"
        if (productCategory === 'other') {
            if (hasVariations) {
                if (variations.length === 0) {
                    validationErrors.push({ field: 'variations', message: 'Debe agregar al menos una variación' })
                } else {
                    variations.forEach((v, index) => {
                        if (!v.key || !v.key.trim()) {
                            validationErrors.push({ field: `variations[${index}].key`, message: `Variación ${index + 1}: La variación es obligatoria` })
                        }
                        const stock = parseInt(v.stock, 10)
                        if (!v.stock || isNaN(stock) || stock < 0) {
                            validationErrors.push({ field: `variations[${index}].stock`, message: `Variación ${index + 1}: El stock debe ser un número válido` })
                        }
                        if (!v.imageSlots?.[0]) {
                            const label = v.key?.trim() || String(index + 1)
                            validationErrors.push({ field: `variations[${index}].images`, message: `La variación ${label} debe tener al menos una imagen` })
                        }
                    })
                }
            } else {
                const stockNum = parseInt(globalStock, 10)
                if (!globalStock || isNaN(stockNum)) {
                    validationErrors.push({ field: 'globalStock', message: 'El stock es obligatorio' })
                } else if (stockNum < 0) {
                    validationErrors.push({ field: 'globalStock', message: 'El stock no puede ser negativo' })
                } else if (stockNum > 10000) {
                    validationErrors.push({ field: 'globalStock', message: 'El stock no debe exceder 10,000 unidades' })
                }
            }
        }

        if (validationErrors.length > 0) {
            showError('Error al enviar', 'Se produjeron los siguientes errores:', validationErrors)
            return
        }

        setLoading(true)

        try {
            const formData = new FormData()
            formData.append('name', name.trim())
            formData.append('description', description)
            formData.append('price', priceNum.toString())

            // Append each global image under the `images` multipart field
            for (const slot of filledGlobalSlots) {
                formData.append('images', slot.file)
            }

            if (weight && weight.trim()) {
                formData.append('weight', parseInt(weight, 10).toString())
            }
            if (dimensions && dimensions.trim()) {
                formData.append('dimensions', dimensions.trim())
            }
            if (forAuction) formData.append('for_auction', '1')
            if (aiGenerated) formData.append('ai_generated', '1')

            if (productCategory === 'art') {
                formData.append('type', type.trim())
                await artAPI.create(formData)
            } else {
                const variationsData = hasVariations
                    ? variations.map((v) => ({
                        key: v.key.trim(),
                        stock: parseInt(v.stock, 10),
                      }))
                    : [{ key: null, stock: parseInt(globalStock, 10) }]

                formData.append('variations', JSON.stringify(variationsData))
                formData.append('can_copack', canCopack ? '1' : '0')

                // Append each variation's images under its indexed field name.
                // Order matters: the backend pairs variation index to its files.
                if (hasVariations) {
                    variations.forEach((v, varIdx) => {
                        const files = (v.imageSlots || []).filter(Boolean)
                        for (const slot of files) {
                            formData.append(`variation_${varIdx}_images`, slot.file)
                        }
                    })
                }

                await othersAPI.create(formData)
            }

            showSuccess('Enviado', '¡Producto publicado correctamente! El producto se encuentra en revisión, y cuando se acepte aparecerá disponible en la web')
            router.push('/seller/products')
        } catch (err) {
            showApiError(err)
        } finally {
            setLoading(false)
        }
    }

    // Handle price input to prevent comma and show warning
    const handlePriceChange = (e) => {
        const value = e.target.value
        if (value.includes(',')) {
            setShowDecimalWarning(true)
            setPrice(value.replace(/,/g, ''))
        } else {
            setShowDecimalWarning(false)
            setPrice(value)
        }
    }

    // Handle price blur to add .00 if no decimal part
    const handlePriceBlur = () => {
        if (price && !isNaN(parseFloat(price))) {
            const priceNum = parseFloat(price)
            if (!price.includes('.')) {
                setPrice(priceNum.toFixed(2))
            }
        }
        setShowDecimalWarning(false)
    }

    // Net earnings preview
    const priceValue = parseFloat(price)
    const showNetEarnings = !isNaN(priceValue) && priceValue >= 10
    let netEarnings = null
    if (showNetEarnings) {
        if (productCategory === 'art') {
            const commissionRate = parseFloat(process.env.NEXT_PUBLIC_DEALER_COMMISSION_ART || '25') / 100
            const vatRate = parseFloat(process.env.NEXT_PUBLIC_TAX_VAT_ART_ES || '10') / 100
            const gross = priceValue * (1 - commissionRate)
            const net = gross / (1 + vatRate)
            netEarnings = { net, gross, vatPercent: parseInt(process.env.NEXT_PUBLIC_TAX_VAT_ART_ES || '10') }
        } else {
            const commissionRate = parseFloat(process.env.NEXT_PUBLIC_DEALER_COMMISSION_OTHERS || '10') / 100
            const vatRate = parseFloat(process.env.NEXT_PUBLIC_TAX_VAT_ES || '21') / 100
            const base = priceValue / (1 + vatRate)
            const artistBase = base * (1 - commissionRate)
            const gross = artistBase * (1 + vatRate)
            netEarnings = { net: artistBase, gross, vatPercent: parseInt(process.env.NEXT_PUBLIC_TAX_VAT_ES || '21') }
        }
    }

    const previewUrls = imageSlots.filter(Boolean).map((s) => s.previewUrl)

    return (
        <div className="bg-white">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
                <form onSubmit={handleSubmit}>
                    <div className="space-y-12">
                        <div className="border-b border-gray-900/10 pb-12">
                            <h2 className="text-base/7 font-semibold text-gray-900">Nuevo producto</h2>
                            <p className="mt-1 text-sm/6 text-gray-600">
                                Introduce la información del producto que deseas publicar.
                            </p>

                            <div className="mt-10 grid grid-cols-1 lg:grid-cols-5 gap-x-8 gap-y-8">
                                {/* Left Column - Form Fields (60%) */}
                                <div className="lg:col-span-3 space-y-8">
                                    {/* Product Category Selector */}
                                    <div>
                                        <label htmlFor="productCategory" className="block text-sm/6 font-medium text-gray-900">
                                            Tipo de producto
                                        </label>
                                        <div className="mt-2 grid grid-cols-1">
                                            <select
                                                id="productCategory"
                                                name="productCategory"
                                                value={productCategory}
                                                onChange={(e) => setProductCategory(e.target.value)}
                                                className="col-start-1 row-start-1 w-full appearance-none rounded-md border border-gray-300 bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                                            >
                                                <option value="art">Galería de Arte</option>
                                                <option value="other">Otros productos</option>
                                            </select>
                                            <ChevronDownIcon
                                                aria-hidden="true"
                                                className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="name" className="block text-sm/6 font-medium text-gray-900">
                                            Nombre {productCategory === 'art' ? 'de la pieza' : 'del producto'}
                                        </label>
                                        <div className="mt-2">
                                            <input
                                                id="name"
                                                name="name"
                                                type="text"
                                                required
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="description" className="block text-sm/6 font-medium text-gray-900">
                                            Descripción
                                        </label>
                                        <label className="block text-sm/6 font-medium text-gray-400">
                                            Introduce un pequeño texto descriptivo. Aquí puedes incluir materiales, medidas, etc.
                                        </label>
                                        <div className="mt-2">
                                            <QuillEditor
                                                value={description}
                                                onChange={setDescription}
                                                modules={modules}
                                                formats={formats}
                                                placeholder="Escribe la descripción..."
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-8">
                                        <div>
                                            <label htmlFor="price" className="block text-sm/6 font-medium text-gray-900">
                                                Precio (€)
                                            </label>
                                            <label className="block text-sm/6 font-medium text-gray-400">
                                                Introduce el precio total, impuestos incluidos
                                            </label>
                                            {showDecimalWarning && (
                                                <p className="mt-1 text-xs text-amber-600">
                                                    Introduce punto para los decimales
                                                </p>
                                            )}
                                            <div className="mt-2">
                                                <input
                                                    id="price"
                                                    name="price"
                                                    type="number"
                                                    step="0.01"
                                                    min="10"
                                                    max="10000"
                                                    required
                                                    value={price}
                                                    onChange={handlePriceChange}
                                                    onBlur={handlePriceBlur}
                                                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                                                />
                                            </div>
                                            {netEarnings && (
                                                <p className="mt-2 text-sm text-gray-500">
                                                    Recibirás {netEarnings.net.toFixed(2)}€ netos por la venta ({netEarnings.gross.toFixed(2)}€ incluyendo {netEarnings.vatPercent}% IVA)
                                                </p>
                                            )}
                                        </div>

                                        {productCategory === 'art' && (
                                            <div>
                                                <label htmlFor="type" className="block text-sm/6 font-medium text-gray-900">
                                                    Soporte
                                                </label>
                                                <label className="block text-sm/6 font-medium text-gray-400">
                                                    Ej: "Óleo sobre tabla", "Lámina ilustrada"
                                                </label>
                                                <div className="mt-2">
                                                    <input
                                                        id="type"
                                                        name="type"
                                                        type="text"
                                                        required
                                                        value={type}
                                                        onChange={(e) => setType(e.target.value)}
                                                        placeholder="Introduce el tipo de soporte"
                                                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-8">
                                        <div>
                                            <label htmlFor="weight" className="block text-sm/6 font-medium text-gray-900">
                                                Peso (gramos) {((productCategory === 'art' && SENDCLOUD_ENABLED_ART) || (productCategory === 'others' && SENDCLOUD_ENABLED_OTHERS))
                                                    ? <span className="text-red-500">*</span>
                                                    : <span className="text-gray-400">(opcional)</span>}
                                            </label>
                                            <label className="block text-sm/6 font-medium text-gray-400">
                                                Necesario para calcular costos de envío
                                            </label>
                                            <div className="mt-2">
                                                <input
                                                    id="weight"
                                                    name="weight"
                                                    type="number"
                                                    min="1"
                                                    value={weight}
                                                    onChange={(e) => setWeight(e.target.value)}
                                                    placeholder="Ej: 500"
                                                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label htmlFor="dimensions" className="block text-sm/6 font-medium text-gray-900">
                                                Dimensiones (cm) <span className="text-gray-400">(opcional)</span>
                                            </label>
                                            <label className="block text-sm/6 font-medium text-gray-400">
                                                Formato: Largo x Ancho x Fondo. Ej: "30x20x5"
                                            </label>
                                            <div className="mt-2">
                                                <input
                                                    id="dimensions"
                                                    name="dimensions"
                                                    type="text"
                                                    value={dimensions}
                                                    onChange={(e) => setDimensions(e.target.value)}
                                                    placeholder="Ej: 30x20x10"
                                                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {productCategory === 'others' && SENDCLOUD_ENABLED_OTHERS && (
                                        <div className="flex items-center">
                                            <input
                                                id="canCopack"
                                                name="canCopack"
                                                type="checkbox"
                                                checked={canCopack}
                                                onChange={(e) => setCanCopack(e.target.checked)}
                                                className="size-4 rounded border-gray-300 text-black accent-black focus:ring-black"
                                            />
                                            <label htmlFor="canCopack" className="ml-3 text-sm/6 font-medium text-gray-900">
                                                Este producto puede empaquetarse junto con otros productos del mismo pedido
                                            </label>
                                        </div>
                                    )}

                                    <div className="flex items-center">
                                        <input
                                            id="forAuction"
                                            name="forAuction"
                                            type="checkbox"
                                            checked={forAuction}
                                            onChange={(e) => setForAuction(e.target.checked)}
                                            className="size-4 rounded border-gray-300 text-black accent-black focus:ring-black"
                                        />
                                        <label htmlFor="forAuction" className="ml-3 text-sm/6 font-medium text-gray-900">
                                            Disponible para subastas
                                        </label>
                                    </div>

                                    <div className="flex items-center">
                                        <input
                                            id="aiGenerated"
                                            name="aiGenerated"
                                            type="checkbox"
                                            checked={aiGenerated}
                                            onChange={(e) => setAiGenerated(e.target.checked)}
                                            className="size-4 rounded border-gray-300 text-black accent-black focus:ring-black"
                                        />
                                        <label htmlFor="aiGenerated" className="ml-3 text-sm/6 font-medium text-gray-900">
                                            Se ha utilizado Inteligencia Artificial en la creación de este producto
                                        </label>
                                    </div>

                                    {/* Stock/Variations for Others */}
                                    {productCategory === 'other' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center">
                                                <input
                                                    id="hasVariations"
                                                    name="hasVariations"
                                                    type="checkbox"
                                                    checked={hasVariations}
                                                    onChange={(e) => setHasVariations(e.target.checked)}
                                                    className="size-4 rounded border-gray-300 text-black accent-black focus:ring-black"
                                                />
                                                <label htmlFor="hasVariations" className="ml-3 text-sm/6 font-medium text-gray-900">
                                                    Este producto tiene variaciones (tamaño, color, etc.)
                                                </label>
                                            </div>

                                            {hasVariations ? (
                                                <div className="space-y-4">
                                                    <label className="block text-sm/6 font-medium text-gray-900">
                                                        Variaciones del producto
                                                    </label>
                                                    {variations.map((variation, varIndex) => (
                                                        <div key={varIndex} className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-3">
                                                            <div className="flex gap-2 items-start">
                                                                <div className="flex-1 grid grid-cols-2 gap-2">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Ej: Verde XL"
                                                                        value={variation.key}
                                                                        onChange={(e) => handleVariationChange(varIndex, 'key', e.target.value)}
                                                                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                                                                    />
                                                                    <input
                                                                        type="number"
                                                                        placeholder="Stock"
                                                                        min="0"
                                                                        value={variation.stock}
                                                                        onChange={(e) => handleVariationChange(varIndex, 'stock', e.target.value)}
                                                                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                                                                    />
                                                                </div>
                                                                {variations.length > 1 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveVariation(varIndex)}
                                                                        className="mt-1 p-2 text-red-600 hover:text-red-800"
                                                                        aria-label="Eliminar variación"
                                                                    >
                                                                        <XMarkIcon className="size-5" />
                                                                    </button>
                                                                )}
                                                            </div>

                                                            <div className="space-y-2 pt-1">
                                                                <p className="text-xs/5 text-gray-400">Imágenes (obligatoria al menos 1, hasta {MAX_PRODUCT_IMAGES})</p>
                                                                <div className="flex flex-wrap items-start gap-3">
                                                                    {variation.imageSlots.map((slot, slotIdx) => (
                                                                        <div key={slotIdx} className="flex w-[68px] flex-col items-center gap-1">
                                                                            <label className={`relative flex size-[68px] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 transition-colors ${
                                                                                slot?.previewUrl
                                                                                    ? 'border-transparent ring-1 ring-gray-200'
                                                                                    : 'border-dashed border-gray-200 bg-white hover:border-gray-400'
                                                                            }`}>
                                                                                <input
                                                                                    type="file"
                                                                                    accept="image/png,image/jpeg,image/webp"
                                                                                    className="hidden"
                                                                                    onChange={(e) => {
                                                                                        if (e.target.files?.[0]) handleVariationSlotDrop(varIndex, slotIdx, e.target.files[0])
                                                                                    }}
                                                                                />
                                                                                {slot?.previewUrl ? (
                                                                                    <NextImage
                                                                                        src={slot.previewUrl}
                                                                                        alt={`Variación ${varIndex + 1}, imagen ${slotIdx + 1}`}
                                                                                        fill
                                                                                        unoptimized
                                                                                        className="object-cover"
                                                                                    />
                                                                                ) : (
                                                                                    <PlusIcon className="size-5 text-gray-300" />
                                                                                )}
                                                                            </label>
                                                                            <div className="flex flex-col items-center text-[11px] leading-tight">
                                                                                {slot?.previewUrl && (
                                                                                    <>
                                                                                        <label className="cursor-pointer text-gray-400 hover:text-gray-700">
                                                                                            <input
                                                                                                type="file"
                                                                                                accept="image/png,image/jpeg,image/webp"
                                                                                                className="hidden"
                                                                                                onChange={(e) => {
                                                                                                    if (e.target.files?.[0]) handleVariationSlotDrop(varIndex, slotIdx, e.target.files[0])
                                                                                                }}
                                                                                            />
                                                                                            Cambiar
                                                                                        </label>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => slotIdx === 0
                                                                                                ? handleClearVariationSlot(varIndex, slotIdx)
                                                                                                : handleRemoveVariationSlot(varIndex, slotIdx)
                                                                                            }
                                                                                            className="text-red-400 hover:text-red-600"
                                                                                        >
                                                                                            Quitar
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                                {!slot?.previewUrl && slotIdx > 0 && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleRemoveVariationSlot(varIndex, slotIdx)}
                                                                                        className="text-red-400 hover:text-red-600"
                                                                                    >
                                                                                        Quitar
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                    {variation.imageSlots[0] !== null && variation.imageSlots.length < MAX_PRODUCT_IMAGES && (
                                                                        <div className="flex w-[68px] flex-col items-center gap-1">
                                                                            <label className="flex size-[68px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-200 text-gray-300 transition-colors hover:border-gray-400 hover:text-gray-400">
                                                                                <input
                                                                                    type="file"
                                                                                    accept="image/png,image/jpeg,image/webp"
                                                                                    className="hidden"
                                                                                    onChange={(e) => {
                                                                                        if (e.target.files?.[0]) handleAddVariationSlotWithFile(varIndex, e.target.files[0])
                                                                                    }}
                                                                                />
                                                                                <PlusIcon className="size-4" />
                                                                                <span className="text-[11px] leading-none">Añadir</span>
                                                                            </label>
                                                                            <div className="h-[14px]" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={handleAddVariation}
                                                        className="flex items-center gap-2 text-sm font-medium text-black hover:text-gray-700"
                                                    >
                                                        <PlusIcon className="size-4" />
                                                        Agregar variación
                                                    </button>
                                                </div>
                                            ) : (
                                                <div>
                                                    <label htmlFor="globalStock" className="block text-sm/6 font-medium text-gray-900">
                                                        Stock disponible
                                                    </label>
                                                    <div className="mt-2">
                                                        <input
                                                            id="globalStock"
                                                            name="globalStock"
                                                            type="number"
                                                            min="0"
                                                            max="10000"
                                                            value={globalStock}
                                                            onChange={(e) => setGlobalStock(e.target.value)}
                                                            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                                                            placeholder="Ej: 10"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Global product image slots (1..3) */}
                                    <div>
                                        <label className="block text-sm/6 font-medium text-gray-900">
                                            Imagen para el listado de productos
                                        </label>
                                        <p className="text-xs/5 text-gray-500">
                                            {productCategory === 'other' && hasVariations
                                                ? `Opcional cuando el producto tiene variaciones con imagen propia. Hasta ${MAX_PRODUCT_IMAGES} imágenes.`
                                                : `Puedes añadir hasta ${MAX_PRODUCT_IMAGES} imágenes. La primera es obligatoria.`}
                                        </p>
                                        <div className="space-y-3">
                                            {imageSlots.map((slot, slotIdx) => (
                                                <div key={slotIdx}>
                                                    <ImageDropzoneSlot
                                                        previewUrl={slot?.previewUrl}
                                                        onDrop={(file) => handleGlobalSlotDrop(slotIdx, file)}
                                                        onClear={slotIdx === 0
                                                            ? () => handleClearGlobalSlot(slotIdx)
                                                            : () => handleRemoveGlobalSlot(slotIdx)}
                                                        isFirst={slotIdx === 0}
                                                    />
                                                    {slotIdx > 0 && !slot && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveGlobalSlot(slotIdx)}
                                                            className="mt-1 text-xs font-medium text-red-600 hover:text-red-800"
                                                        >
                                                            Eliminar imagen
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            {imageSlots.length < MAX_PRODUCT_IMAGES && (
                                                <button
                                                    type="button"
                                                    onClick={handleAddGlobalSlot}
                                                    className="flex items-center gap-2 text-sm font-medium text-black hover:text-gray-700"
                                                >
                                                    <PlusIcon className="size-4" />
                                                    Añadir otra imagen
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column - Image Previews (40%) */}
                                <div className="lg:col-span-2 space-y-4">
                                    {previewUrls.length > 0 && (
                                        <div>
                                            <label className="block text-sm/6 font-medium text-gray-900">Vista previa</label>
                                            <div className="mt-2 space-y-4">
                                                {previewUrls.map((url, i) => (
                                                    <NextImage
                                                        key={`${url}-${i}`}
                                                        src={url}
                                                        alt={`Preview ${i + 1}`}
                                                        width={0}
                                                        height={0}
                                                        unoptimized
                                                        style={{ width: '100%', height: 'auto' }}
                                                        className="rounded-md"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex items-center justify-end gap-x-6">
                        <button type="button" onClick={() => router.back()}
                                className="text-sm/6 font-semibold text-gray-900">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
                        >
                            {loading ? 'Subiendo...' : 'Subir producto'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default function PublishProductPage() {
    return (
        <AuthGuard requireRole="seller">
            <PublishProductPageContent />
        </AuthGuard>
    )
}
