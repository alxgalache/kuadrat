'use client'

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

export default function DrawHowWorksModal({ isOpen, onClose }) {
  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
      />

      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className="relative w-full max-w-xl transform rounded-lg bg-white p-6 shadow-xl transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <DialogTitle className="text-lg font-semibold text-gray-900">
                Cómo funcionan los sorteos
              </DialogTitle>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
              <p>
                Los compradores que se inscriban en un sorteo serán seleccionados al azar para recibir una
                edición de la asignación pública de esa obra de arte. Todos los usuarios inscritos antes de que
                el sorteo cierre tienen las mismas posibilidades de ser seleccionados. Solo se permite una inscripción
                por persona, y nos reservamos el derecho de eliminar las inscripciones que incumplan nuestros{' '}
                <a href="/legal/terminos-y-condiciones" target="_blank" rel="noopener noreferrer" className="underline text-black hover:text-gray-900">términos y condiciones.</a>
              </p>

              <p>
                Para inscribirte, deberás proporcionar una dirección de correo electrónico única, una dirección
                de envío válida y una tarjeta de pago. Al enviar tu inscripción, aceptas que, si eres
                seleccionado, tu tarjeta de pago será cargada automáticamente con el importe total indicado en
                el momento de la inscripción. Solo se cobran las inscripciones seleccionadas.
              </p>

              <p>
                Puedes cancelar tu inscripción en cualquier momento antes de que el sorteo cierre iniciando
                sesión en tu cuenta en avantarte.com o poniéndote en contacto con nosotros en
                info@140d.art. Si tu inscripción es seleccionada en el sorteo y decides cancelar
                tu pedido, debes contactarnos en un plazo de 24 horas. En ese caso, se te reembolsará el pago
                y se podrá aplicar una tarifa de gestión de hasta el 10% a nuestra discreción.
              </p>

              <p>
                Para obtener más información, consulta nuestras{' '}
                <a
                  href="/preguntas-frecuentes"
                  target="_blank"
                  className="underline text-black hover:text-gray-900"
                >
                  preguntas frecuentes
                </a>
                .
              </p>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
