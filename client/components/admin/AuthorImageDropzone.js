'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import NextImage from 'next/image'
import { PhotoIcon } from '@heroicons/react/24/solid'
import { useDropzone } from 'react-dropzone'
import { useNotification } from '@/contexts/NotificationContext'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Label + dropzone + preview for one author portrait.
 *
 * Extracted because the artist form now carries two images (the main one and the
 * landscape variant for small screens) across both the create and edit pages —
 * four copies of the same validation and object-URL bookkeeping otherwise.
 *
 * The component owns the selected File and its preview; the parent only needs
 * the File in order to upload it, and receives it through `onFileChange`.
 *
 * @param {string} label
 * @param {string} [hint] - short es-ES explanation under the label
 * @param {string} [initialUrl] - existing stored image, for the edit page
 * @param {(file: File | null) => void} onFileChange
 * @param {string} [previewClassName] - e.g. 'rounded-full' or 'rounded-lg'
 * @param {boolean} [showPreview] - false when the parent renders the preview
 *        itself (the create page puts both previews in the right column)
 * @param {(url: string) => void} [onPreviewChange] - preview URL, so a parent
 *        with `showPreview={false}` can render it wherever it wants. The object
 *        URL stays owned (and revoked) by this component.
 */
export default function AuthorImageDropzone({
  label,
  hint,
  initialUrl = '',
  onFileChange,
  previewClassName = 'rounded-lg',
  showPreview = true,
  onPreviewChange,
}) {
  const { showError } = useNotification()
  const [preview, setPreview] = useState(initialUrl)
  // Tracks whether `preview` is an object URL we created (and must revoke).
  const objectUrlRef = useRef(null)
  // Once the admin picks a file, a late-arriving initialUrl must not clobber it.
  const dirtyRef = useRef(false)

  useEffect(() => {
    if (!dirtyRef.current && initialUrl) setPreview(initialUrl)
  }, [initialUrl])

  const revokeCurrent = useCallback(() => {
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current)
      } catch {}
      objectUrlRef.current = null
    }
  }, [])

  useEffect(() => revokeCurrent, [revokeCurrent])

  // Mirrored to the parent through a ref so an inline callback does not
  // re-trigger the effect on every render.
  const onPreviewChangeRef = useRef(onPreviewChange)
  onPreviewChangeRef.current = onPreviewChange
  useEffect(() => {
    onPreviewChangeRef.current?.(preview)
  }, [preview])

  const onDrop = useCallback(
    async (acceptedFiles) => {
      const file = acceptedFiles?.[0]
      if (!file) return

      if (!ALLOWED_TYPES.includes(file.type)) {
        showError('Formato de imagen inválido', 'Solo se permiten imágenes PNG, JPG y WEBP')
        return
      }
      if (file.size > MAX_BYTES) {
        showError('Archivo demasiado grande', 'La imagen debe ser de 10MB o menos')
        return
      }

      // Decode before accepting, so a corrupt file is rejected here rather than
      // failing later at upload time.
      const objectUrl = URL.createObjectURL(file)
      try {
        await new Promise((resolve, reject) => {
          const probe = new window.Image()
          probe.onload = resolve
          probe.onerror = reject
          probe.src = objectUrl
        })
      } catch {
        try {
          URL.revokeObjectURL(objectUrl)
        } catch {}
        showError('Imagen inválida', 'No se pudo procesar el archivo de imagen')
        return
      }

      revokeCurrent()
      objectUrlRef.current = objectUrl
      dirtyRef.current = true
      setPreview(objectUrl)
      onFileChange(file)
    },
    [onFileChange, revokeCurrent, showError]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
    },
    maxFiles: 1,
    multiple: false,
  })

  return (
    <div>
      <label className="block text-sm/6 font-medium text-gray-900">{label}</label>
      {hint && <p className="mt-1 text-xs/5 text-gray-500">{hint}</p>}
      <div
        {...getRootProps()}
        className={`mt-2 flex justify-center rounded-lg border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
          isDragActive ? 'border-black bg-gray-50' : 'border-gray-900/25 hover:border-gray-900/50'
        }`}
      >
        <div className="text-center">
          <PhotoIcon aria-hidden="true" className="mx-auto size-12 text-gray-300" />
          <div className="mt-4 flex text-sm/6 text-gray-600">
            <input {...getInputProps()} />
            <p className="font-semibold text-black">
              {isDragActive ? 'Suelta la imagen aquí' : 'Haz clic para subir o arrastra y suelta'}
            </p>
          </div>
          <p className="text-xs/5 text-gray-600">PNG, JPG o WEBP hasta 10MB</p>
        </div>
      </div>

      {showPreview && preview && (
        <div className="mt-4">
          <label className="block text-sm/6 font-medium text-gray-900">Vista previa</label>
          <div className="mt-2">
            <NextImage
              src={preview}
              alt="Vista previa"
              width={0}
              height={0}
              unoptimized
              style={{ width: '100%', height: 'auto' }}
              className={previewClassName}
            />
          </div>
        </div>
      )}
    </div>
  )
}
