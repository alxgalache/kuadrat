import Link from 'next/link'

export const metadata = {
  title: 'Términos y Condiciones - 140d',
}

export default function TermsPage() {
  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:px-8 lg:px-10">
        <Link href="/" className="inline-block mb-10">
          <img
            alt="140d Galería de Arte logo"
            src="/brand/140d.svg"
            className="h-6 w-auto"
          />
        </Link>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Términos y Condiciones
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Última actualización: febrero 2025
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Introducción</h2>
            <p className="mt-3">
              Bienvenido a 140d Galería de Arte. Estos Términos y Condiciones regulan el uso de nuestra plataforma web,
              incluyendo la participación en subastas en línea. Al acceder a nuestro sitio web o participar en una subasta,
              aceptas cumplir con estos términos en su totalidad. Si no estás de acuerdo con alguno de estos términos,
              te rogamos que no utilices nuestros servicios.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Participación en Subastas</h2>
            <p className="mt-3">
              Cada puja realizada en nuestra plataforma es vinculante e irrevocable. Al realizar una puja, el usuario se compromete
              a adquirir el artículo subastado en caso de resultar el pujador ganador, al precio de su puja final.
            </p>
            <p className="mt-3">
              El participante debe ser mayor de 18 años y tener capacidad legal para celebrar contratos.
              140d se reserva el derecho de solicitar verificación de identidad en cualquier momento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Proceso de Puja</h2>
            <p className="mt-3">
              Para participar en una subasta, el usuario deberá registrarse proporcionando sus datos personales,
              dirección de entrega y un método de pago válido. Se realizará un cargo de validación de 1 EUR que será
              reembolsado automáticamente.
            </p>
            <p className="mt-3">
              Las pujas deben respetar el incremento mínimo establecido para cada artículo. El sistema anti-sniping
              puede extender la duración de la subasta si se recibe una puja en los últimos minutos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Pago y Entrega</h2>
            <p className="mt-3">
              El ganador de la subasta deberá completar el pago del importe total en un plazo máximo de 5 días hábiles
              desde la finalización de la subasta. El envío se realizará a la dirección indicada durante el registro.
            </p>
            <p className="mt-3">
              Los gastos de envío, si los hubiera, serán comunicados al participante antes de la subasta y se añadirán
              al precio final de adjudicación.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Cancelaciones y Devoluciones</h2>
            <p className="mt-3">
              Dado el carácter vinculante de las pujas, no se admiten cancelaciones una vez realizada la puja.
              El derecho de desistimiento no es aplicable a los bienes adquiridos en subastas públicas,
              de conformidad con la legislación vigente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Responsabilidad</h2>
            <p className="mt-3">
              140d actúa como intermediario entre vendedores y compradores. Aunque realizamos esfuerzos razonables
              para verificar la autenticidad y el estado de los artículos, no podemos garantizar la exactitud de
              todas las descripciones proporcionadas por los vendedores.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Modificaciones</h2>
            <p className="mt-3">
              Nos reservamos el derecho de modificar estos términos en cualquier momento. Las modificaciones
              entrarán en vigor desde su publicación en el sitio web. El uso continuado de la plataforma
              tras la publicación de cambios constituye la aceptación de los mismos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Contacto</h2>
            <p className="mt-3">
              Para cualquier consulta relacionada con estos términos, puedes contactarnos a través de
              nuestro correo electrónico: info@140d.art
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
