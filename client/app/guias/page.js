import Link from 'next/link'
import { buildOpenGraph, buildTwitter } from '@/lib/metadata'
import JsonLd from '@/components/JsonLd'
import { buildItemList, buildBreadcrumb } from '@/lib/schema'
import { GUIDES } from '@/lib/guides'

export const metadata = {
  title: 'Guías',
  // 142 caracteres, desde 169.
  description:
    'Guías de 140d para comprar y vender arte: cómo comprar obra original online, ' +
    'qué es una edición limitada y cómo se autentica una obra con NFC.',
  alternates: { canonical: '/guias' },
  openGraph: buildOpenGraph({
    title: 'Guías | 140d',
    description: 'Cómo comprar arte original online, ediciones limitadas, autenticidad y venta de obra.',
    path: '/guias',
  }),
  twitter: buildTwitter({
    title: 'Guías | 140d',
    description: 'Cómo comprar arte original online, ediciones limitadas, autenticidad y venta de obra.',
  }),
}

export default function GuiasPage() {
  const listSchema = buildItemList({
    name: 'Guías de 140d',
    items: GUIDES.map((g) => ({ url: `/guias/${g.slug}`, name: g.title })),
  })

  const breadcrumbSchema = buildBreadcrumb([
    { name: 'Inicio', url: '/' },
    { name: 'Guías' },
  ])

  return (
    <div className="bg-white">
      <JsonLd data={listSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          Guías
        </h1>
        <p className="mt-4 text-base text-gray-600">
          Lo que conviene saber antes de comprar —o de vender— una obra de arte.
          Explicado sin tecnicismos y sin dar nada por sabido.
        </p>

        <ul role="list" className="mt-12 space-y-10">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <h2 className="text-xl font-semibold text-gray-900">
                <Link href={`/guias/${guide.slug}`} className="hover:text-gray-600">
                  {guide.title}
                </Link>
              </h2>
              <p className="mt-2 text-base text-gray-600">{guide.summary}</p>
              <Link
                href={`/guias/${guide.slug}`}
                className="mt-3 inline-block text-sm font-medium text-gray-900"
              >
                Leer la guía <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
