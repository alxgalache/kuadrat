import Link from 'next/link'
import BrandLogo from '@/components/BrandLogo'

export const metadata = {
  // Antes sólo declaraba `title`, así que `description` y `alternates` caían a
  // las de la raíz: las CINCO páginas legales declaraban la portada como su
  // canónica, es decir, le decían al buscador que eran la home y que no debía
  // indexarlas por separado.
  //
  // El título tampoco repite la marca: la plantilla de la raíz ya añade
  // «| 140d», y ponerlo aquí daba «Política de privacidad - 140d | 140d».
  title: 'Política de privacidad',
  description:
    'Política de privacidad de 140d: qué datos personales tratamos, con qué finalidad y base legal, durante cuánto tiempo y cómo ejercer tus derechos.',
  alternates: {
    canonical: '/legal/politica-de-privacidad',
  },
}

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:px-8 lg:px-10">
        <Link href="/" className="inline-block mb-10">
          <BrandLogo className="h-6 w-auto" priority />
        </Link>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Política de Privacidad
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Última actualización: Septiembre 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Responsable del Tratamiento</h2>
            <p className="mt-3">
              El responsable del tratamiento de tus datos personales es 140d Galería de Arte S.L.
              Puedes contactarnos en cualquier momento a través de info@140d.art para ejercer
              tus derechos o resolver cualquier duda sobre el tratamiento de tus datos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Datos que Recopilamos</h2>
            <p className="mt-3">
              Recopilamos los siguientes datos personales cuando realizas una compra, participas en un
              sorteo o te registras como pujador en nuestras subastas:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1">
              <li>Nombre y apellidos</li>
              <li>
                Identificador fiscal (DNI o NIE), necesario para emitir la factura de tu compra
              </li>
              <li>Dirección de correo electrónico</li>
              <li>Número de teléfono</li>
              <li>Dirección de entrega</li>
              <li>Dirección de facturación</li>
              <li>Datos de pago (procesados de forma segura a través de Stripe)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Finalidad del Tratamiento</h2>
            <p className="mt-3">
              Tus datos personales son tratados con las siguientes finalidades:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1">
              <li>Gestionar tu participación en las subastas</li>
              <li>Procesar los pagos y envíos de los artículos adquiridos</li>
              <li>Enviarte comunicaciones relacionadas con las subastas en las que participas</li>
              <li>Cumplir con las obligaciones legales y fiscales aplicables</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Base Legal</h2>
            <p className="mt-3">
              El tratamiento de tus datos se fundamenta en:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1">
              <li>Tu consentimiento expreso al aceptar esta política</li>
              <li>La ejecución del contrato de compraventa derivado de la subasta</li>
              <li>El cumplimiento de obligaciones legales</li>
              <li>Nuestro interés legítimo en mejorar nuestros servicios</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Seguridad de los Datos</h2>
            <p className="mt-3">
              Implementamos medidas técnicas y organizativas adecuadas para proteger tus datos personales
              contra el acceso no autorizado, la pérdida o la destrucción. Los datos de pago son procesados
              directamente por Stripe y nunca se almacenan en nuestros servidores.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Conservación de Datos</h2>
            <p className="mt-3">
              Tus datos personales se conservarán durante el tiempo necesario para cumplir con las
              finalidades descritas y, en todo caso, durante los plazos legalmente establecidos.
              Los datos asociados a transacciones se conservarán durante un mínimo de 5 años
              conforme a la legislación fiscal.
            </p>
          </section>

          <section id="grabacion-de-eventos" className="scroll-mt-24">
            <h2 className="text-lg font-semibold text-gray-900">7. Grabación de Eventos en Directo</h2>
            <p className="mt-3">
              Los eventos en directo de 140d pueden grabarse. Te informamos de ello en esta política,
              que aceptas al registrarte en un evento; no se muestra un aviso distinto en cada evento.
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1">
              <li>
                <strong>Qué se graba:</strong> la imagen y la voz de quienes intervienen. En un stream,
                el host, el co-presentador y los asistentes a los que se da la palabra: al recibirla se
                activa su micrófono, que pueden silenciar en cualquier momento, y su imagen solo si
                activan la cámara. En una reunión, cada participante mientras tenga la cámara o el
                micrófono activados. Nunca se graba el chat ni a los asistentes que solo miran y
                escuchan.
              </li>
              <li>
                <strong>Finalidad:</strong> permitir consultar el contenido del evento después de su
                celebración y reutilizarlo.
              </li>
              <li>
                <strong>Base legal:</strong> para el host y el co-presentador, la relación que les une
                con 140d para impartir el evento. Para los asistentes que intervienen, su
                consentimiento, que prestan al pedir la palabra o al activar la cámara o el micrófono
                sabiendo, por esta política que aceptan al registrarse, que el evento puede grabarse.
                Puedes asistir sin ser grabado: basta con no pedir la palabra ni activar la cámara o el
                micrófono.
              </li>
              <li>
                <strong>Encargados del tratamiento:</strong> Agora, que realiza la grabación en su
                región europea, y Amazon Web Services, que la almacena en la Unión Europea.
              </li>
              <li>
                <strong>Conservación:</strong> 30 días naturales desde la celebración del evento.
                Transcurrido ese plazo, la grabación se elimina automáticamente.
              </li>
              <li>
                <strong>Tus derechos:</strong> además de los indicados en el apartado siguiente, puedes
                pedirnos en info@140d.art que suprimamos tu intervención antes de que venza ese plazo.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Tus Derechos</h2>
            <p className="mt-3">
              De conformidad con el Reglamento General de Protección de Datos (RGPD), tienes derecho a:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1">
              <li>Acceder a tus datos personales</li>
              <li>Rectificar datos inexactos o incompletos</li>
              <li>Solicitar la supresión de tus datos</li>
              <li>Oponerte al tratamiento de tus datos</li>
              <li>Solicitar la limitación del tratamiento</li>
              <li>Solicitar la portabilidad de tus datos</li>
            </ul>
            <p className="mt-3">
              Para ejercer cualquiera de estos derechos, contacta con nosotros en info@140d.art.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">9. Cookies</h2>
            <p className="mt-3">
              Nuestro sitio web utiliza cookies técnicas necesarias para el funcionamiento de la plataforma, y cookies
              para la gestión de métricas y analíticas de publicidad (Meta).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">10. Modificaciones</h2>
            <p className="mt-3">
              Nos reservamos el derecho de actualizar esta política de privacidad en cualquier momento.
              Cualquier cambio será publicado en esta página con la fecha de la última actualización.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
