import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: 'Normas de Participación en Eventos en Directo - 140d',
}

export default function EventRulesPage() {
  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:px-8 lg:px-10">
        <Link href="/" className="inline-block mb-10">
          <Image
            alt="140d Galería de Arte logo"
            src="/brand/140d.svg"
            width={120}
            height={24}
            className="h-6 w-auto"
          />
        </Link>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Normas de Participación en Eventos en Directo
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Última actualización: febrero 2025
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Normas Generales</h2>
            <p className="mt-3">
              La participación en los eventos en directo de 140d Galería de Arte está sujeta al cumplimiento
              de las presentes normas. Al acceder a un evento, el participante acepta cumplir con todas las
              condiciones aquí establecidas. 140d se reserva el derecho de modificar estas normas en
              cualquier momento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Comportamiento durante el Evento</h2>
            <p className="mt-3">
              Todos los participantes deben mantener un comportamiento respetuoso durante la totalidad del evento.
              Se espera que los asistentes:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1">
              <li>Traten a los demás participantes, al host y a los ponentes con respeto y cortesía</li>
              <li>Escuchen activamente y no interrumpan a los ponentes mientras hablan</li>
              <li>Sigan las instrucciones del host del evento en todo momento</li>
              <li>Utilicen un lenguaje apropiado y profesional en todas las interacciones</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Uso del Chat</h2>
            <p className="mt-3">
              El chat del evento es una herramienta de comunicación complementaria. Su uso está sujeto a las
              siguientes reglas:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1">
              <li>Los mensajes deben ser relevantes al tema del evento</li>
              <li>Queda prohibido el envío masivo de mensajes repetidos o sin sentido (spam)</li>
              <li>No se permite el uso de lenguaje ofensivo, discriminatorio o intimidante</li>
              <li>No se permite compartir enlaces externos o publicidad no autorizada</li>
              <li>No se permite el acoso o la difamación hacia otros participantes</li>
            </ul>
            <p className="mt-3">
              El sistema detecta automáticamente el envío excesivo de mensajes. Los participantes que
              realicen spam en el chat serán expulsados del evento de forma automática e inmediata.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Intervención con Micrófono</h2>
            <p className="mt-3">
              La activación del micrófono está controlada por el host del evento. Si deseas intervenir:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1">
              <li>Utiliza la función de levantar la mano para solicitar la palabra</li>
              <li>Espera a que el host te conceda permiso para hablar</li>
              <li>Mantén tus intervenciones breves y relevantes al tema</li>
              <li>Silencia tu micrófono cuando no estés hablando para evitar ruido de fondo</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Prohibiciones</h2>
            <p className="mt-3">
              Queda terminantemente prohibido durante los eventos en directo:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1">
              <li>Realizar spam en el chat (envío masivo o repetitivo de mensajes)</li>
              <li>Utilizar lenguaje inapropiado, ofensivo, discriminatorio o violento</li>
              <li>Acosar, amenazar o intimidar a otros participantes</li>
              <li>Compartir contenido ilegal, explícito o no relacionado con el evento</li>
              <li>Grabar o retransmitir el evento sin autorización expresa del host</li>
              <li>Suplantar la identidad de otros participantes o del host</li>
              <li>Intentar acceder al evento con datos falsos o suplantados</li>
              <li>Alterar o interferir con el funcionamiento normal del evento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Consecuencias del Incumplimiento</h2>
            <p className="mt-3">
              El incumplimiento de cualquiera de estas normas podrá conllevar las siguientes consecuencias:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1">
              <li>Expulsión inmediata del evento en curso sin previo aviso</li>
              <li>Prohibición de acceso al mismo evento con cualquier cuenta o dispositivo</li>
              <li>Posible restricción de acceso a futuros eventos de 140d</li>
            </ul>
            <p className="mt-3">
              Las expulsiones por spam se realizan de forma automática cuando el sistema detecta un
              envío excesivo de mensajes en un período corto de tiempo. En estos casos, no se realizarán
              reembolsos si el evento era de pago.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Protección de Datos</h2>
            <p className="mt-3">
              Los datos personales proporcionados para acceder al evento serán tratados conforme a nuestra{' '}
              <Link href="/legal/politica-de-privacidad" className="font-medium text-gray-900 underline hover:text-gray-700">
                Política de Privacidad
              </Link>
              . La dirección IP del participante podrá ser registrada con fines de seguridad y prevención
              de abusos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Contacto</h2>
            <p className="mt-3">
              Para cualquier consulta relacionada con estas normas o para reportar un incidente durante
              un evento, puedes contactarnos a través de nuestro correo electrónico: info@140d.art
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
