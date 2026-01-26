import { InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function AuthorSidebar({
  authors,
  selectedAuthorSlug,
  onViewAuthorBio,
  onFilterByAuthor,
  onClearFilter,
}) {
  return (
    <aside className="hidden lg:block w-64 pr-10 flex-shrink-0">
      <div className="sticky top-0 py-16 will-change-scroll">
        <nav aria-label="Sidebar" className="flex flex-1 flex-col">
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            <li>
              <div className="text-xs font-semibold text-gray-400">Autores</div>
              <ul role="list" className="-mx-2 mt-2 space-y-1">
                {authors.map((author) => (
                  <li key={author.id}>
                    <div
                      className={classNames(
                        selectedAuthorSlug && selectedAuthorSlug === author.slug
                          ? 'bg-gray-200 text-gray-900'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                        'group flex gap-x-3 rounded-md p-2 text-sm font-semibold items-center w-full'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onViewAuthorBio(author)}
                        className="group/icon flex-shrink-0"
                      >
                        <InformationCircleIcon className="size-5 text-gray-400 group-hover/icon:text-black" />
                      </button>
                      <button
                        onClick={() => onFilterByAuthor(author.slug)}
                        className="flex gap-x-3 items-center flex-1 text-left min-w-0"
                      >
                        <span className="truncate">{author.full_name}</span>
                      </button>
                      <div className="w-6 flex-shrink-0 flex items-center justify-center">
                        {selectedAuthorSlug && selectedAuthorSlug === author.slug && (
                          <button
                            type="button"
                            onClick={onClearFilter}
                            aria-label="Limpiar filtro de autor"
                          >
                            <XMarkIcon className="size-5 text-gray-400 group-hover/icon:text-black" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          </ul>
        </nav>
      </div>
    </aside>
  )
}
