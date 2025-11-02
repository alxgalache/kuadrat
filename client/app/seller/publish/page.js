'use client'

import {useState, useEffect, useMemo} from 'react'
import {useRouter} from 'next/navigation'
import {artAPI, othersAPI} from '@/lib/api'
import {PhotoIcon, PlusIcon, XMarkIcon} from '@heroicons/react/24/solid'
import {ChevronDownIcon} from '@heroicons/react/16/solid'
import AuthGuard from '@/components/AuthGuard'
import {useDropzone} from 'react-dropzone'
import {useNotification} from '@/contexts/NotificationContext'
import QuillEditor from '@/components/QuillEditor'
import 'quill/dist/quill.snow.css'

function PublishProductPageContent() {
    const [productCategory, setProductCategory] = useState('art')
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [type, setType] = useState('')
    const [weight, setWeight] = useState('')
    const [dimensions, setDimensions] = useState('')
    const [imageFile, setImageFile] = useState(null)
    const [previewUrl, setPreviewUrl] = useState('')
    const [loading, setLoading] = useState(false)
    const [showDecimalWarning, setShowDecimalWarning] = useState(false)

    // For "others" products - variations
    const [hasVariations, setHasVariations] = useState(false)
    const [globalStock, setGlobalStock] = useState('')
    const [variations, setVariations] = useState([
        { key: '', stock: '' }
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

    const validateAndSetImage = async (file) => {
        // Reset previous state
        if (previewUrl) {
            try {
                URL.revokeObjectURL(previewUrl)
            } catch {
            }
        }
        setPreviewUrl('')
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
            } catch {
            }
        }
    }

    const onDrop = async (acceptedFiles) => {
        if (acceptedFiles.length > 0) {
            await validateAndSetImage(acceptedFiles[0])
        }
    }

    const {getRootProps, getInputProps, isDragActive} = useDropzone({
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
            if (previewUrl) {
                try {
                    URL.revokeObjectURL(previewUrl)
                } catch {
                }
            }
        }
    }, [previewUrl])

    // Add variation row
    const handleAddVariation = () => {
        setVariations([...variations, { key: '', stock: '' }])
    }

    // Remove variation row
    const handleRemoveVariation = (index) => {
        if (variations.length > 1) {
            setVariations(variations.filter((_, i) => i !== index))
        }
    }

    // Update variation field
    const handleVariationChange = (index, field, value) => {
        const newVariations = [...variations]
        newVariations[index][field] = value
        setVariations(newVariations)
    }

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

        // Validate weight (optional, but if provided must be > 0)
        if (weight && weight.trim()) {
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

        // Validate image
        if (!imageFile) {
            validationErrors.push({ field: 'image', message: 'El archivo de imagen es obligatorio' })
        }

        // Validate stock/variations for "others"
        if (productCategory === 'other') {
            if (hasVariations) {
                // Validate variations
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
                    })
                }
            } else {
                // Validate global stock
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

        // If there are validation errors, show them
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
            formData.append('image', imageFile)

            // Add weight and dimensions if provided
            if (weight && weight.trim()) {
                formData.append('weight', parseInt(weight, 10).toString())
            }
            if (dimensions && dimensions.trim()) {
                formData.append('dimensions', dimensions.trim())
            }

            if (productCategory === 'art') {
                // Submit to art API
                formData.append('type', type.trim())
                await artAPI.create(formData)
            } else {
                // Submit to others API with variations
                const variationsData = hasVariations
                    ? variations.map(v => ({
                        key: v.key.trim(),
                        stock: parseInt(v.stock, 10)
                      }))
                    : [{ key: null, stock: parseInt(globalStock, 10) }]

                formData.append('variations', JSON.stringify(variationsData))
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
                                        </div>

                                        {/* Type field only for Art */}
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

                                    {/* Weight and Dimensions - for both art and others */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-8">
                                        <div>
                                            <label htmlFor="weight" className="block text-sm/6 font-medium text-gray-900">
                                                Peso (gramos) <span className="text-gray-400">(opcional)</span>
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
                                                Formato: LxWxH. Ej: "30x20x10"
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
                                                    className="size-4 rounded border-gray-300 text-black focus:ring-black"
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
                                                    {variations.map((variation, index) => (
                                                        <div key={index} className="flex gap-2 items-start">
                                                            <div className="flex-1 grid grid-cols-2 gap-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Ej: Verde XL"
                                                                    value={variation.key}
                                                                    onChange={(e) => handleVariationChange(index, 'key', e.target.value)}
                                                                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    placeholder="Stock"
                                                                    min="0"
                                                                    value={variation.stock}
                                                                    onChange={(e) => handleVariationChange(index, 'stock', e.target.value)}
                                                                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                                                                />
                                                            </div>
                                                            {variations.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveVariation(index)}
                                                                    className="mt-1 p-2 text-red-600 hover:text-red-800"
                                                                >
                                                                    <XMarkIcon className="size-5" />
                                                                </button>
                                                            )}
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

                                    {/* Image Upload */}
                                    <div>
                                        <label className="block text-sm/6 font-medium text-gray-900">
                                            Imagen
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
                                                <p className="text-xs/5 text-gray-600">PNG, JPG o WEBP hasta 10MB, mínimo 600x600</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column - Image Preview Only (40%) */}
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
