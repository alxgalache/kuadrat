import { InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

/**
 * Fila del sidebar en espera de la navegación del filtro (`pending`).
 *
 * Misma caja que la fila real (`p-2`, `gap-x-3`, `items-center`, tipografía
 * incluida), así que mide lo mismo por construcción: un círculo `size-5` donde
 * va el icono, y la barra del nombre con el NOMBRE REAL en texto transparente,
 * recortado igual que el real, de modo que termina donde termina ese nombre. La
 * barra es más baja que la línea y queda centrada en la fila. El hueco `w-6` de
 * la X se conserva.
 *
 * Sin fondo de seleccionado: sobre el `gray-200` de la fila activa, las piezas
 * grises no se verían. `aria-hidden` porque el nombre sólo aporta anchura.
 */
function AuthorRowSkeleton({ name }) {
  return (
    <div
      aria-hidden="true"
      className="flex gap-x-3 rounded-md p-2 text-sm font-semibold items-center w-full select-none"
    >
      <span className="skeleton size-5 flex-shrink-0 rounded-full" />
      <span className="flex items-center flex-1 min-w-0">
        <span className="skeleton truncate h-3 rounded text-transparent">{name}</span>
      </span>
      <div className="w-6 flex-shrink-0" />
    </div>
  )
}

export default function AuthorSidebar({
  authors,
  selectedAuthorSlug,
  onViewAuthorBio,
  onFilterByAuthor,
  onClearFilter,
  pending = false,
}) {
  return (
    <aside className="hidden lg:block w-64 pr-10 flex-shrink-0">
      <div className="sticky top-0 py-12 will-change-scroll">
        <nav aria-label="Sidebar" className="flex flex-1 flex-col">
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            <li>
              <div className="text-xs font-semibold text-gray-400">Autores</div>
              <ul role="list" className="-mx-2 mt-2 space-y-1">
                {authors.map((author) => (
                  <li key={author.id}>
                    {pending ? (
                      <AuthorRowSkeleton name={author.full_name} />
                    ) : (
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
                          aria-label={`Ver información de ${author.full_name}`}
                          className="group/icon flex-shrink-0"
                        >
                          <InformationCircleIcon aria-hidden="true" className="size-5 text-gray-400 group-hover/icon:text-black" />
                        </button>
                        <button
                          type="button"
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
                              <XMarkIcon aria-hidden="true" className="size-5 text-gray-400 group-hover/icon:text-black" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
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
