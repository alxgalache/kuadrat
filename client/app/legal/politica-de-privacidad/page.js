import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: 'Política de Privacidad - 140d',
}

export default function PrivacyPolicyPage() {
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
          Política de Privacidad
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Última actualización: febrero 2025
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Responsable del Tratamiento</h2>
            <p className="mt-3">
              El responsable del tratamiento de tus datos personales es 140d Galería de Arte.
              Puedes contactarnos en cualquier momento a través de info@140d.art para ejercer
              tus derechos o resolver cualquier duda sobre el tratamiento de tus datos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Datos que Recopilamos</h2>
            <p className="mt-3">
              Recopilamos los siguientes datos personales cuando te registras como pujador en nuestras subastas:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-1">
              <li>Nombre y apellidos</li>
              <li>Dirección de correo electrónico</li>
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

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Tus Derechos</h2>
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
            <h2 className="text-lg font-semibold text-gray-900">8. Cookies</h2>
            <p className="mt-3">
              Nuestro sitio web utiliza cookies técnicas necesarias para el funcionamiento de la plataforma.
              No utilizamos cookies de terceros con fines publicitarios.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">9. Modificaciones</h2>
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
