import Link from 'next/link'
import JsonLd from '@/components/JsonLd'
import { buildAboutPage, buildBreadcrumb } from '@/lib/schema'
import { SITE, SITE_URL } from '@/lib/siteInfo'

// Página de entidad. Es el documento que un asistente cita cuando le preguntan
// «¿qué es 140d?», así que está escrita para poder extraerse por partes: un
// único <h1>, encabezados que son preguntas, y un primer párrafo autocontenido
// que responde sin necesitar el resto de la página.
//
// Todo lo que se afirma aquí está confirmado por el operador y vive en
// lib/siteInfo.js. Lo que no está confirmado, no se dice: en particular no se
// declara cuántos artistas hay —cambia, y una cifra escrita a mano envejece— ni
// se anuncia el envío fuera de España, que está previsto pero no disponible.

export const metadata = {
  title: 'Sobre 140d',
  description:
    'Qué es 140d: galería de arte online española, con sede en Salamanca y activa desde ' +
    '2026, especializada en arte contemporáneo emergente. Cómo comprar, cómo vender y ' +
    'quién está detrás.',
  alternates: { canonical: '/sobre-140d' },
  openGraph: {
    title: 'Sobre 140d',
    description:
      'Galería de arte online española especializada en arte contemporáneo emergente. ' +
      'Qué es, cómo funciona y quién está detrás.',
    url: `${SITE_URL}/sobre-140d`,
    type: 'website',
  },
}

export default function SobrePage() {
  const aboutSchema = buildAboutPage({
    url: '/sobre-140d',
    description: SITE.oneLiner,
  })

  const breadcrumbSchema = buildBreadcrumb([
    { name: 'Inicio', url: '/' },
    { name: 'Sobre 140d' },
  ])

  return (
    <div className="bg-white">
      <JsonLd data={aboutSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          Sobre 140d
        </h1>

        {/* Párrafo autocontenido: tiene que responder «qué es 140d» aunque se
            extraiga solo, sin el título ni el resto de la página. */}
        <p className="mt-6 text-lg text-gray-700">
          140d es una galería de arte online española, con sede en Salamanca y activa
          desde 2026, especializada en arte contemporáneo emergente: vende obra original
          de artistas jóvenes españoles y organiza encuentros en directo que acercan al
          público el proceso de creación.
        </p>

        <h2 className="mt-12 text-xl font-semibold text-gray-900">
          ¿Qué tipo de arte se puede comprar en 140d?
        </h2>
        <p className="mt-3 text-base text-gray-600">
          Arte contemporáneo de artistas emergentes y jóvenes que trabajan en España.
          No aplicamos un criterio de disciplina: pintura, ilustración, fotografía,
          obra gráfica, arte digital o cualquier otra práctica tienen cabida, y los
          medios digitales y de difusión de la galería sirven a todas por igual. Al
          predominar el arte emergente, los precios cubren un rango amplio pero suelen
          ser asequibles para un público general.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-gray-900">
          ¿Cómo se compra una obra?
        </h2>
        <p className="mt-3 text-base text-gray-600">
          Se añade la obra a la cesta y se completa el pago, procesado por Stripe. El
          coste de envío se calcula según el destino dentro de España. Cada obra se
          entrega con su certificado de autenticidad. Además de la venta directa, hay{' '}
          <Link href="/eventos" className="font-medium text-gray-900 underline">
            subastas en tiempo real y sorteos
          </Link>
          ; en los sorteos solo se cobra a quien resulta ganador.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-gray-900">
          ¿Cómo se sabe que una obra es auténtica?
        </h2>
        <p className="mt-3 text-base text-gray-600">
          Cada obra viaja con un certificado de autenticidad en papel que lleva un chip
          NFC. Al acercar el móvil, el chip genera un código distinto en cada lectura
          que nuestro servidor verifica criptográficamente, de modo que un certificado
          no se puede duplicar ni reutilizar.{' '}
          <Link
            href="/guias/como-se-autentica-una-obra-con-nfc"
            className="font-medium text-gray-900 underline"
          >
            Cómo funciona en detalle
          </Link>
          .
        </p>

        <h2 className="mt-10 text-xl font-semibold text-gray-900">
          ¿Qué son los encuentros en directo?
        </h2>
        <p className="mt-3 text-base text-gray-600">
          Además de vender obra, 140d organiza directos, charlas, entrevistas, talleres
          y cursos con los artistas. La idea es que quien compra no reciba solo una
          pieza terminada, sino que pueda acompañar el proceso que la produce: preguntar,
          ver trabajar y entender de dónde sale lo que cuelga en su pared. Es lo que
          distingue a 140d de un catálogo con carrito.{' '}
          <Link href="/live" className="font-medium text-gray-900 underline">
            Ver los próximos encuentros
          </Link>
          .
        </p>

        <h2 className="mt-10 text-xl font-semibold text-gray-900">
          ¿Cómo puede un artista vender en 140d?
        </h2>
        <p className="mt-3 text-base text-gray-600">
          Los artistas solicitan el alta desde la{' '}
          <Link href="/contacto" className="font-medium text-gray-900 underline">
            página de contacto
          </Link>
          . Una vez aprobados, publican y gestionan su obra directamente, fijan sus
          precios y configuran sus envíos; los cobros se liquidan por transferencia a
          través de Stripe Connect y la galería aplica una comisión sobre cada venta.{' '}
          <Link
            href="/guias/como-vender-tu-obra-en-una-galeria-online"
            className="font-medium text-gray-900 underline"
          >
            Más detalle en la guía para artistas
          </Link>
          .
        </p>

        <h2 className="mt-10 text-xl font-semibold text-gray-900">
          ¿Quién está detrás de 140d?
        </h2>
        <p className="mt-3 text-base text-gray-600">
          140d la impulsa {SITE.founder}, programador de profesión y apasionado del arte,
          que decidió dar un giro a su carrera y poner su perfil técnico al servicio de
          la difusión del arte en España. La galería nace en {SITE.foundingCity} en{' '}
          {SITE.foundingDate} y opera exclusivamente online, sin espacio físico.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-gray-900">
          ¿A dónde se envía?
        </h2>
        <p className="mt-3 text-base text-gray-600">
          A todo el territorio español, incluidas Baleares, Canarias, Ceuta y Melilla,
          con la tarifa que corresponda a cada destino. La expansión a Europa está
          prevista para fases posteriores.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-gray-900">Contacto</h2>
        <p className="mt-3 text-base text-gray-600">
          Escríbenos a{' '}
          <a href={`mailto:${SITE.email}`} className="font-medium text-gray-900 underline">
            {SITE.email}
          </a>{' '}
          o desde la{' '}
          <Link href="/contacto" className="font-medium text-gray-900 underline">
            página de contacto
          </Link>
          . También estamos en{' '}
          <a href={SITE.social[1]} className="font-medium text-gray-900 underline">
            Instagram
          </a>
          .
        </p>

        <p className="mt-12 text-sm text-gray-500">
          ¿Te quedan dudas? Están respondidas en las{' '}
          <Link href="/preguntas-frecuentes" className="underline">
            preguntas frecuentes
          </Link>{' '}
          y en las{' '}
          <Link href="/guias" className="underline">
            guías
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
