import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: 'Política de Cookies - 140d',
}

export default function CookiePolicyPage() {
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
          Política de Cookies
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Última actualización: abril 2025
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. ¿Qué son las cookies?</h2>
            <p className="mt-3">
              Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo (ordenador, tablet o móvil)
              cuando visitas un sitio web. Se utilizan ampliamente para hacer que los sitios web funcionen de manera
              más eficiente, así como para proporcionar información a los propietarios del sitio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. ¿Qué cookies utilizamos?</h2>
            <p className="mt-3">
              En 140d utilizamos los siguientes tipos de cookies:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>
                <strong>Cookies esenciales:</strong> Necesarias para el funcionamiento básico del sitio web. Incluyen
                cookies de sesión, autenticación y consentimiento de cookies. Sin ellas, el sitio no puede funcionar
                correctamente.
              </li>
              <li>
                <strong>Cookies de rendimiento y análisis:</strong> Nos permiten contar las visitas y fuentes de tráfico
                para poder medir y mejorar el rendimiento de nuestro sitio. Nos ayudan a saber qué páginas son las más
                y menos populares y ver cómo se mueven los visitantes por el sitio.
              </li>
              <li>
                <strong>Cookies de funcionalidad:</strong> Permiten que el sitio web recuerde las elecciones que realizas
                (como tu nombre de usuario, idioma o la región en la que te encuentras) y proporcione funciones mejoradas
                y más personales, como el carrito de compra.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Finalidad de las cookies</h2>
            <p className="mt-3">
              Utilizamos cookies para los siguientes fines:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>Garantizar el correcto funcionamiento del sitio web y sus servicios.</li>
              <li>Mantener la sesión del usuario autenticado de forma segura.</li>
              <li>Recordar tus preferencias de consentimiento de cookies.</li>
              <li>Gestionar el carrito de compra durante tu navegación.</li>
              <li>Analizar el uso del sitio web para mejorar nuestros servicios.</li>
              <li>Detectar y prevenir actividades fraudulentas.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Cookies de terceros</h2>
            <p className="mt-3">
              Nuestro sitio web puede utilizar servicios de terceros que establecen sus propias cookies. Estos servicios
              incluyen procesadores de pago (Stripe), herramientas de monitorización de errores (Sentry) y servicios
              de streaming en directo (LiveKit) para los eventos en vivo de la galería.
            </p>
            <p className="mt-3">
              No tenemos control sobre las cookies de terceros. Te recomendamos consultar las políticas de privacidad
              de estos proveedores para obtener más información sobre sus prácticas.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. ¿Cómo gestionar las cookies?</h2>
            <p className="mt-3">
              Puedes gestionar tus preferencias de cookies en cualquier momento. La mayoría de los navegadores web
              permiten controlar las cookies a través de sus configuraciones. A continuación te indicamos cómo
              gestionar las cookies en los navegadores más comunes:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>
                <strong>Google Chrome:</strong> Configuración → Privacidad y seguridad → Cookies y otros datos de sitios
              </li>
              <li>
                <strong>Mozilla Firefox:</strong> Opciones → Privacidad y seguridad → Cookies y datos del sitio
              </li>
              <li>
                <strong>Safari:</strong> Preferencias → Privacidad → Gestionar datos de sitios web
              </li>
              <li>
                <strong>Microsoft Edge:</strong> Configuración → Cookies y permisos del sitio → Cookies y datos almacenados
              </li>
            </ul>
            <p className="mt-3">
              Ten en cuenta que si desactivas las cookies, algunas funciones de nuestro sitio web podrían no estar
              disponibles o no funcionar correctamente. En particular, no podrás realizar compras ni participar en
              subastas si las cookies esenciales están desactivadas.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Duración de las cookies</h2>
            <p className="mt-3">
              Las cookies que utilizamos tienen diferentes períodos de vigencia:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>
                <strong>Cookies de sesión:</strong> Se eliminan automáticamente cuando cierras el navegador.
              </li>
              <li>
                <strong>Cookies persistentes:</strong> Permanecen en tu dispositivo durante un período determinado
                o hasta que las elimines manualmente. Por ejemplo, la cookie de consentimiento se almacena durante
                aproximadamente 30 días.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Actualizaciones de esta política</h2>
            <p className="mt-3">
              Nos reservamos el derecho de actualizar esta Política de Cookies en cualquier momento.
              Cualquier cambio será publicado en esta página con la fecha de la última actualización.
              Te recomendamos revisar esta política periódicamente para estar informado sobre el uso de cookies
              en nuestro sitio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Contacto</h2>
            <p className="mt-3">
              Si tienes preguntas sobre nuestra Política de Cookies, puedes contactarnos a través de
              nuestro correo electrónico: info@140d.art
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
