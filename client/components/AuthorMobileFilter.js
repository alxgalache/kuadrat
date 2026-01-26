import { InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function AuthorMobileFilter({
  authors,
  selectedAuthorSlug,
  onViewAuthorBio,
  onFilterByAuthor,
  onClearFilter,
}) {
  return (
    <div className="lg:hidden border-b border-gray-200 py-4 px-6">
      <div className="text-xs font-semibold text-gray-400 mb-3">Autores</div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-hide">
        {authors.map((author) => (
          <div
            key={author.id}
            className={classNames(
              selectedAuthorSlug && selectedAuthorSlug === author.slug
                ? 'bg-gray-200 text-gray-900'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-50 hover:text-gray-900',
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap shrink-0'
            )}
          >
            <button
              type="button"
              onClick={() => onViewAuthorBio(author)}
              className="hover:opacity-80"
            >
              <InformationCircleIcon className="size-4" />
            </button>
            <button
              onClick={() => onFilterByAuthor(author.slug)}
              className="hover:opacity-80"
            >
              {author.full_name}
            </button>
            {selectedAuthorSlug && selectedAuthorSlug === author.slug && (
              <button
                type="button"
                onClick={onClearFilter}
                className="ml-1 hover:opacity-80"
                aria-label="Limpiar filtro de autor"
              >
                <XMarkIcon className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
