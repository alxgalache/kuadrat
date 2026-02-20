import JsonLd from '@/components/JsonLd'

export const metadata = {
  title: 'Preguntas Frecuentes',
  description: 'Resuelve tus dudas sobre 140d: cómo comprar arte, cómo vender tus obras, subastas en vivo, eventos culturales y más. Todo lo que necesitas saber sobre nuestra galería de arte online.',
  alternates: {
    canonical: '/preguntas-frecuentes',
  },
  openGraph: {
    title: 'Preguntas Frecuentes | 140d',
    description: 'Todo lo que necesitas saber sobre 140d: comprar arte, vender obras, subastas y eventos culturales.',
  },
}

const faqData = [
  {
    question: '¿Qué es 140d?',
    answer: '140d es una galería de arte online que democratiza el acceso al arte. Conectamos artistas emergentes y consagrados con entusiastas del arte, ofreciendo obras originales, subastas en vivo y eventos culturales. Creemos que el gusto personal debe primar sobre la influencia de una industria al alcance de unos pocos.',
  },
  {
    question: '¿Cómo puedo comprar arte en 140d?',
    answer: 'Explora nuestra galería, selecciona la obra que te guste y añádela a tu cesta. Podrás elegir el método de envío y completar tu compra de forma segura. Recibirás una confirmación por email con los detalles de tu pedido.',
  },
  {
    question: '¿Cómo puedo vender mi arte en 140d?',
    answer: 'Si eres artista y quieres publicar tus obras, solicita tu registro en nuestra página de contacto. Revisaremos tu solicitud y, si encaja con nuestra galería, te daremos acceso para que puedas publicar y gestionar tus obras directamente.',
  },
  {
    question: '¿Qué son las subastas de 140d?',
    answer: 'Son subastas de arte online en tiempo real donde puedes pujar por obras únicas. Las subastas tienen una fecha y hora de inicio y fin, y puedes seguir las pujas en directo. Al finalizar, la puja más alta se lleva la obra.',
  },
  {
    question: '¿Qué son los Espacios de 140d?',
    answer: 'Los Espacios son eventos culturales en directo: masterclasses, charlas, entrevistas y sesiones AMA con artistas. Algunos son gratuitos y otros de pago. Puedes asistir desde cualquier lugar a través de nuestra plataforma de streaming.',
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
}

export default function PreguntasFrecuentesPage() {
  return (
    <div className="bg-white">
      <JsonLd data={faqSchema} />

      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Preguntas frecuentes</h1>
        <dl className="mt-10 space-y-8 divide-y divide-gray-200">
          {faqData.map((item) => (
            <div key={item.question} className="pt-8 first:pt-0">
              <dt className="text-base font-semibold text-gray-900">{item.question}</dt>
              <dd className="mt-2 text-base text-gray-600">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
