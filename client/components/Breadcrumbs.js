'use client'

import Link from 'next/link'
import { ChevronRightIcon, HomeIcon } from '@heroicons/react/20/solid'

export default function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
      <ol role="list" className="flex items-center space-x-2 text-sm">
        <li>
          <Link href="/" className="text-gray-400 hover:text-gray-500">
            <HomeIcon aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only">Inicio</span>
          </Link>
        </li>
        {items.map((item) => (
          <li key={item.name} className="flex items-center">
            <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-gray-300" />
            {item.href ? (
              <Link
                href={item.href}
                className="ml-2 text-gray-500 hover:text-gray-700"
              >
                {item.name}
              </Link>
            ) : (
              <span className="ml-2 text-gray-700 font-medium" aria-current="page">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
