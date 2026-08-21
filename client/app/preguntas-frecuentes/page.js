import Link from 'next/link'
import JsonLd from '@/components/JsonLd'
import { buildFaqPage, buildBreadcrumb } from '@/lib/schema'
import { SITE_URL } from '@/lib/siteInfo'

export const metadata = {
  title: 'Preguntas Frecuentes',
  description:
    'Resuelve tus dudas sobre 140d: cómo comprar arte original, envíos y devoluciones, ' +
    'certificado de autenticidad, ediciones limitadas, subastas, sorteos, encuentros en ' +
    'directo y cómo vender tu obra.',
  alternates: {
    canonical: '/preguntas-frecuentes',
  },
  openGraph: {
    title: 'Preguntas Frecuentes | 140d',
    description:
      'Comprar arte original, envíos, devoluciones, autenticidad, ediciones limitadas, ' +
      'subastas y venta de obra.',
    url: `${SITE_URL}/preguntas-frecuentes`,
  },
}

// La FAQ está organizada en SECCIONES, no en una lista plana.
//
// El spec `draws-faq` ya lo exigía («The page SHALL organize FAQs into clearly
// labeled sections») y la implementación no lo cumplía: era un único array
// recorrido de arriba abajo, sin un solo encabezado de sección. Además de ser
// deuda con el propio spec, es lo que permite que cada bloque se extraiga como
// respuesta a su tema en lugar de como un trozo de una página larga.
//
// Nada de lo que se afirma aquí puede contradecir a las páginas legales. Donde
// la respuesta depende de las condiciones publicadas —devoluciones, sobre todo—
// se remite a ellas en lugar de repetir un plazo que podría quedar desfasado.
const faqSections = [
  {
    id: 'general',
    heading: 'Sobre 140d',
    items: [
      {
        question: '¿Qué es 140d?',
        answer:
          '140d es una galería de arte online española, con sede en Salamanca y activa ' +
          'desde 2026, especializada en arte contemporáneo emergente. Vendemos obra ' +
          'original de artistas jóvenes españoles y organizamos encuentros en directo ' +
          'que acercan al público el proceso de creación. Creemos que el gusto personal ' +
          'debe primar sobre la influencia de una industria al alcance de unos pocos.',
      },
      {
        question: '¿Qué tipo de obra puedo encontrar?',
        answer:
          'Arte contemporáneo de artistas emergentes y jóvenes que trabajan en España. ' +
          'No aplicamos un criterio de disciplina: pintura, ilustración, fotografía, ' +
          'obra gráfica, arte digital o cualquier otra práctica tienen cabida. Al ' +
          'predominar el arte emergente, los precios cubren un rango amplio pero suelen ' +
          'ser asequibles para un público general.',
      },
      {
        question: '¿140d tiene espacio físico?',
        answer:
          'No. 140d opera exclusivamente online. Eso nos permite llegar a todo el ' +
          'territorio español sin los costes de una sala, que son los que suelen ' +
          'encarecer la obra de un artista emergente.',
      },
    ],
  },
  {
    id: 'comprar',
    heading: 'Comprar arte',
    items: [
      {
        question: '¿Cómo puedo comprar arte en 140d?',
        answer:
          'Explora la galería, selecciona la obra que te guste y añádela a tu cesta. ' +
          'Podrás elegir el método de envío y completar tu compra de forma segura. ' +
          'Recibirás una confirmación por email con los detalles de tu pedido.',
      },
      {
        question: '¿Cómo se realiza el pago y es seguro?',
        answer:
          'Los pagos se procesan a través de Stripe, uno de los proveedores de pago más ' +
          'extendidos. 140d no almacena en ningún momento los datos de tu tarjeta.',
      },
      {
        question: '¿Puedo comprar si no tengo cuenta?',
        answer:
          'Sí. La compra no requiere crear una cuenta: basta con los datos de envío y ' +
          'de pago. Recibirás por email el acceso al seguimiento de tu pedido.',
      },
    ],
  },
  {
    id: 'envios',
    heading: 'Envíos y devoluciones',
    items: [
      {
        question: '¿A dónde enviáis y cuánto cuesta el envío?',
        answer:
          'Enviamos a todo el territorio español, incluidas Baleares, Canarias, Ceuta y ' +
          'Melilla. El coste depende del destino y del tamaño y peso del embalaje de ' +
          'cada obra, y se calcula y se muestra antes de que confirmes el pedido, nunca ' +
          'después. La expansión a Europa está prevista para más adelante.',
      },
      {
        question: '¿Cómo viaja la obra?',
        answer:
          'Cada obra se embala de forma específica para su tamaño y su técnica, y viaja ' +
          'asegurada por su valor. Si el paquete llegara dañado, escríbenos lo antes ' +
          'posible con fotografías del embalaje y de la obra para que podamos ' +
          'gestionarlo con el transportista.',
      },
      {
        question: '¿Puedo devolver una obra?',
        answer:
          'Las condiciones de desistimiento y devolución, incluidos plazos y ' +
          'excepciones, son las que figuran en nuestros términos y condiciones. Antes ' +
          'de comprar, consúltalos; si tienes cualquier duda sobre un caso concreto, ' +
          'escríbenos y te lo aclaramos antes de que hagas el pedido.',
      },
    ],
  },
  {
    id: 'autenticidad',
    heading: 'Autenticidad y ediciones',
    items: [
      {
        question: '¿Cómo sé que la obra es auténtica?',
        answer:
          'Cada obra se entrega con un certificado de autenticidad en papel que lleva ' +
          'un chip NFC. Al acercar cualquier móvil, el chip genera un código distinto en ' +
          'cada lectura que nuestro servidor verifica criptográficamente, de modo que el ' +
          'certificado no se puede duplicar ni reutilizar: copiar el papel no sirve de ' +
          'nada sin el chip, y el chip nunca repite la misma respuesta.',
      },
      {
        question: '¿Qué significa que una obra sea de edición limitada?',
        answer:
          'Que existe en un número fijo de ejemplares, decidido por el artista antes de ' +
          'producirla y que no se amplía después. Cada ejemplar es original, va numerado ' +
          'y lleva su propio certificado de autenticidad. En la ficha de la obra se ' +
          'indica de cuántos ejemplares consta la edición.',
      },
      {
        question: '¿Puedo comprar más de un ejemplar de la misma edición?',
        answer:
          'Dentro de un mismo pedido solo puedes añadir un ejemplar de cada obra, pero ' +
          'nada impide que compres otro ejemplar en un pedido posterior mientras queden ' +
          'disponibles.',
      },
    ],
  },
  {
    id: 'subastas',
    heading: 'Subastas',
    items: [
      {
        question: '¿Qué son las subastas de 140d?',
        answer:
          'Son subastas de arte online en tiempo real donde puedes pujar por obras ' +
          'únicas. Las subastas tienen una fecha y hora de inicio y fin, y puedes seguir ' +
          'las pujas en directo. Al finalizar, la puja más alta se lleva la obra.',
      },
    ],
  },
  {
    id: 'sorteos',
    heading: 'Sorteos',
    items: [
      {
        question: '¿Qué son los sorteos de 140d?',
        answer:
          'Los sorteos son una forma de adquirir arte a un precio fijo mediante ' +
          'selección aleatoria. Para participar, debes registrarte con tu email, ' +
          'verificar tu identidad y autorizar un método de pago. Al finalizar el período ' +
          'de inscripción, se seleccionan los ganadores de forma aleatoria. Solo se cobra ' +
          'a los participantes seleccionados como ganadores. Cada persona puede ' +
          'participar una sola vez por sorteo.',
      },
    ],
  },
  {
    id: 'live',
    heading: 'Encuentros en directo',
    items: [
      {
        question: '¿Qué son los encuentros en directo de 140d?',
        answer:
          'Son eventos culturales en directo: masterclasses, charlas, entrevistas, ' +
          'talleres y sesiones AMA con artistas. Algunos son gratuitos y otros de pago. ' +
          'Puedes asistir desde cualquier lugar a través de nuestra plataforma de ' +
          'streaming. La idea es que quien compra arte pueda acompañar el proceso que lo ' +
          'produce, no solo recibir la pieza terminada.',
      },
    ],
  },
  {
    id: 'artistas',
    heading: 'Para artistas',
    items: [
      {
        question: '¿Cómo puedo vender mi arte en 140d?',
        answer:
          'Si eres artista y quieres publicar tus obras, solicita tu registro en nuestra ' +
          'página de contacto. Revisaremos tu solicitud y, si encaja con nuestra ' +
          'galería, te daremos acceso para que puedas publicar y gestionar tus obras ' +
          'directamente.',
      },
      {
        question: '¿Quién fija el precio y cómo cobro?',
        answer:
          'El precio lo fija el artista. Los cobros se liquidan por transferencia a ' +
          'través de Stripe Connect, y la galería aplica una comisión sobre cada venta ' +
          'que se acuerda al dar de alta al artista.',
      },
    ],
  },
]

// El FAQPage se deriva de las mismas secciones que se renderizan, aplanadas.
// No es una segunda lista escrita a mano: si lo fuera, acabarían divergiendo, y
// unos datos estructurados que declaran preguntas que la página no muestra son
// justo lo que los buscadores penalizan.
const faqSchema = buildFaqPage(
  faqSections.flatMap((section) => section.items),
)

const breadcrumbSchema = buildBreadcrumb([
  { name: 'Inicio', url: '/' },
  { name: 'Preguntas frecuentes' },
])

export default function PreguntasFrecuentesPage() {
  return (
    <div className="bg-white">
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Preguntas frecuentes
        </h1>
        <p className="mt-4 text-base text-gray-600">
          Todo lo que suele preguntarse antes de comprar una obra —y antes de
          publicarla—. Si algo no está aquí, está en{' '}
          <Link href="/sobre-140d" className="underline">
            Sobre 140d
          </Link>{' '}
          o en las{' '}
          <Link href="/guias" className="underline">
            guías
          </Link>
          .
        </p>

        {faqSections.map((section) => (
          <section key={section.id} className="mt-12">
            <h2 className="text-xl font-semibold tracking-tight text-gray-900">
              {section.heading}
            </h2>
            <dl className="mt-6 space-y-8 divide-y divide-gray-200">
              {section.items.map((item) => (
                <div key={item.question} className="pt-8 first:pt-0">
                  <dt className="text-base font-semibold text-gray-900">
                    {item.question}
                  </dt>
                  <dd className="mt-2 text-base text-gray-600">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <p className="mt-16 text-sm text-gray-500">
          ¿Sigues con dudas?{' '}
          <Link href="/contacto" className="underline">
            Escríbenos
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
