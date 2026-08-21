import Link from 'next/link'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { buildArticle, buildBreadcrumb, buildFaqPage } from '@/lib/schema'
import { GUIDES, getGuide } from '@/lib/guides'
import { getGuideContent, isPlaceholder } from '@/lib/guideContent'
import { renderInlineLinks, stripInlineLinks } from '@/lib/inlineLinks'
import { SITE_URL } from '@/lib/siteInfo'

// Las guías son contenido estático: se prerenderizan todas en el build. A
// diferencia de las fichas de obra, aquí sí se puede —el catálogo de guías es
// un módulo del propio repositorio, así que no hace falta que la API esté
// levantada durante `docker build`.
export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }))
}

// `true`, no `false`. Con `false`, cualquier ruta que no salga de
// `generateStaticParams` la resuelve el propio framework con un 404 interno
// (NoFallbackError) antes de llegar a esta página — y en desarrollo eso hacía
// que las cuatro guías dieran 404 pese a estar en el catálogo.
//
// No se pierde nada: un slug inexistente lo rechaza `getGuide()` con notFound()
// unas líneas más abajo, que es el mismo 404 pero decidido por nuestro código y
// no por una condición de carrera del prerenderizado.
export const dynamicParams = true

export async function generateMetadata({ params }) {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) return { title: 'Guía no encontrada', robots: { index: false } }

  const draft = isPlaceholder(getGuideContent(slug))

  return {
    title: guide.title,
    description: guide.summary,
    keywords: guide.keywords,
    alternates: { canonical: `/guias/${guide.slug}` },
    openGraph: {
      type: 'article',
      title: `${guide.title} | 140d`,
      description: guide.summary,
      url: `${SITE_URL}/guias/${guide.slug}`,
    },
    // Una guía todavía sin redactar no se indexa. Ver isPlaceholder() en
    // lib/guideContent.js: publicar una página con texto de marcador es peor
    // que no publicarla.
    ...(draft ? { robots: { index: false, follow: true } } : {}),
  }
}

export default async function GuidePage({ params }) {
  const { slug } = await params
  const guide = getGuide(slug)
  const content = getGuideContent(slug)

  if (!guide || !content) notFound()

  const draft = isPlaceholder(content)

  const articleSchema = buildArticle({
    headline: guide.title,
    description: guide.summary,
    url: `/guias/${guide.slug}`,
    datePublished: guide.publishedAt,
  })

  // Cada sección con encabezado en forma de pregunta se declara además como
  // par pregunta/respuesta. Es lo que permite que la sección se devuelva como
  // respuesta directa, en lugar de como un enlace a la página entera.
  //
  // Mientras la guía sea un marcador de posición no se emite: un FAQPage cuyas
  // respuestas dicen «[PENDIENTE DE REDACCIÓN]» es una afirmación falsa servida
  // en el formato que los buscadores tratan como estructurado y fiable.
  const questionSections = (content.sections || []).filter((s) => s.heading.includes('¿'))
  const faqSchema =
    !draft && questionSections.length > 0
      ? buildFaqPage(
          questionSections.map((s) => ({
            question: s.heading,
            // `stripInlineLinks` es obligatorio aquí: sin él, un
            // `[texto](/ruta)` viajaría literal dentro del FAQPage, es decir,
            // se le serviría sintaxis en crudo a Google y a los motores de IA
            // en el formato que tratan como estructurado y fiable.
            answer: (s.paragraphs || []).map(stripInlineLinks).join(' '),
          })),
        )
      : null

  const breadcrumbSchema = buildBreadcrumb([
    { name: 'Inicio', url: '/' },
    { name: 'Guías', url: '/guias' },
    { name: guide.title },
  ])

  return (
    <div className="bg-white">
      {!draft && <JsonLd data={articleSchema} />}
      {faqSchema && <JsonLd data={faqSchema} />}
      <JsonLd data={breadcrumbSchema} />

      <article className="mx-auto max-w-3xl px-6 py-16 sm:py-24 lg:px-8">
        <nav aria-label="Migas" className="text-sm text-gray-500">
          <Link href="/guias" className="hover:text-gray-700">
            Guías
          </Link>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          {guide.title}
        </h1>

        {draft && (
          <p className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Esta guía está pendiente de redacción. No se indexa hasta que se
            complete: edita <code>client/lib/guideContent.js</code>.
          </p>
        )}

        <p className="mt-6 text-lg text-gray-700">{renderInlineLinks(content.lead)}</p>

        {(content.sections || []).map((section) => (
          <section key={section.heading}>
            <h2 className="mt-10 text-xl font-semibold text-gray-900">
              {section.heading}
            </h2>
            {(section.paragraphs || []).map((paragraph, i) => (
              <p key={i} className="mt-3 text-base text-gray-600">
                {renderInlineLinks(paragraph)}
              </p>
            ))}
          </section>
        ))}

        <hr className="mt-12 border-gray-200" />
        <p className="mt-6 text-sm text-gray-500">
          ¿Sigues con dudas? Mira las{' '}
          <Link href="/preguntas-frecuentes" className="underline">
            preguntas frecuentes
          </Link>{' '}
          o explora la{' '}
          <Link href="/galeria" className="underline">
            galería
          </Link>
          .
        </p>
      </article>
    </div>
  )
}
