'use client'

import {useState, useEffect, useMemo} from 'react'
import {useRouter} from 'next/navigation'
import {productsAPI} from '@/lib/api'
import {PhotoIcon} from '@heroicons/react/24/solid'
import {ChevronDownIcon} from '@heroicons/react/16/solid'
import AuthGuard from '@/components/AuthGuard'
import {useDropzone} from 'react-dropzone'
import {useNotification} from '@/contexts/NotificationContext'
import QuillEditor from '@/components/QuillEditor'
import 'quill/dist/quill.snow.css'

function PublishProductPageContent() {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [type, setType] = useState('physical')
    const [imageFile, setImageFile] = useState(null)
    const [previewUrl, setPreviewUrl] = useState('')
    const [loading, setLoading] = useState(false)
    const [showDecimalWarning, setShowDecimalWarning] = useState(false)
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
        // Extract plain text from Quill editor
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

        // Validate type
        if (!['physical', 'digital'].includes(type)) {
            validationErrors.push({ field: 'type', message: 'El tipo debe ser "physical" o "digital"' })
        }

        // Validate image
        if (!imageFile) {
            validationErrors.push({ field: 'image', message: 'El archivo de imagen es obligatorio' })
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
            // Send description as HTML (Quill's default format)
            formData.append('description', description)
            formData.append('price', priceNum.toString())
            formData.append('type', type)
            formData.append('image', imageFile)

            await productsAPI.create(formData)
            showSuccess('Enviado', '¡Obra publicada correctamente! El producto se encuentra en revisión, y cuando se acepte aparecerá disponible en la web')
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
        // Check if user tried to type a comma
        if (value.includes(',')) {
            setShowDecimalWarning(true)
            // Remove comma
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
            // If the price doesn't have a decimal part, add .00
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
                                    <div>
                                        <label htmlFor="name" className="block text-sm/6 font-medium text-gray-900">
                                            Nombre de la pieza
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
                                        <label className="block text-sm/6 font-medium text-gray-400">
                                            Introduce un pequeño texto descriptivo de la obra. Aquí puedes incluir materiales, medidas, etc.
                                        </label>
                                        <div className="mt-2">
                                            <QuillEditor
                                                value={description}
                                                onChange={setDescription}
                                                modules={modules}
                                                formats={formats}
                                                placeholder="Escribe la descripción de tu obra..."
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
                                                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label htmlFor="type" className="block text-sm/6 font-medium text-gray-900">
                                                Soporte
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

                                    {/* Image Upload - Moved to Left Column */}
                                    <div>
                                        <label className="block text-sm/6 font-medium text-gray-900">
                                            Imagen
                                        </label>
                                        <div
                                            {...getRootProps()}
                                            className={`mt-2 flex justify-center rounded-lg border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
                                                isDragActive
                                                    ? 'border-indigo-600 bg-indigo-50'
                                                    : 'border-gray-900/25 hover:border-gray-900/50'
                                            }`}
                                        >
                                            <div className="text-center">
                                                <PhotoIcon aria-hidden="true" className="mx-auto size-12 text-gray-300"/>
                                                <div className="mt-4 flex text-sm/6 text-gray-600">
                                                    <input {...getInputProps()} />
                                                    <p className="font-semibold text-indigo-600">
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
                            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                        >
                            {loading ? 'Subiendo...' : 'Subir artículo'}
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
