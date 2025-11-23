'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'

export default function VariationEditModal({ open, onClose, product, onSave }) {
  const [variations, setVariations] = useState([])
  const [saving, setSaving] = useState(false)
  const { showBanner } = useBannerNotification()

  useEffect(() => {
    if (product && product.variations) {
      // Initialize with existing variations
      setVariations(product.variations.map(v => ({
        id: v.id,
        key: v.key || '',
        value: v.value || '',
        stock: v.stock || 0
      })))
    }
  }, [product])

  const handleAddVariation = () => {
    setVariations([...variations, { key: '', value: '', stock: 0 }])
  }

  const handleRemoveVariation = (index) => {
    setVariations(variations.filter((_, i) => i !== index))
  }

  const handleVariationChange = (index, field, value) => {
    const updated = [...variations]
    if (field === 'stock') {
      updated[index][field] = parseInt(value, 10) || 0
    } else {
      updated[index][field] = value
    }
    setVariations(updated)
  }

  const handleSave = async () => {

    setSaving(true)
    try {
      await onSave(variations)
      onClose()
    } catch (error) {
      console.error('Error saving variations:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (!saving) {
      onClose()
    }
  }

  if (!product) return null

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
      />

      <div className="fixed inset-0 z-50 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in sm:my-8 sm:w-full sm:max-w-3xl sm:p-6 data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95"
          >
            <div className="absolute right-0 top-0 pr-4 pt-4 sm:block">
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none disabled:opacity-50"
              >
                <span className="sr-only">Cerrar</span>
                <XMarkIcon aria-hidden="true" className="size-6" />
              </button>
            </div>

            <div className="sm:flex sm:items-start">
              <div className="mt-3 w-full text-center sm:mt-0 sm:text-left">
                <DialogTitle as="h3" className="text-base font-semibold text-gray-900">
                  Editar variaciones - {product.name}
                </DialogTitle>
                <div className="mt-6">
                  <div className="space-y-4">
                    {variations.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No hay variaciones. Agrega al menos una variación.
                      </p>
                    ) : (
                      variations.map((variation, index) => (
                        <div key={index} className="flex gap-3 items-start">
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Nombre
                              </label>
                              <input
                                type="text"
                                value={variation.key}
                                onChange={(e) => handleVariationChange(index, 'key', e.target.value)}
                                placeholder="Ej: Tamaño, Color"
                                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Valor
                              </label>
                              <input
                                type="text"
                                value={variation.value}
                                onChange={(e) => handleVariationChange(index, 'value', e.target.value)}
                                placeholder="Ej: Grande, Rojo"
                                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Stock
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={variation.stock}
                                onChange={(e) => handleVariationChange(index, 'stock', e.target.value)}
                                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveVariation(index)}
                            className="mt-7 p-2 text-red-600 hover:text-red-800"
                            title="Eliminar variación"
                          >
                            <TrashIcon className="size-5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddVariation}
                    className="mt-4 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  >
                    <PlusIcon className="size-5" />
                    Agregar variación
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 sm:flex sm:flex-row-reverse gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || variations.length === 0}
                className="inline-flex w-full justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
