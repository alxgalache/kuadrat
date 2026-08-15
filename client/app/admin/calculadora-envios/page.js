'use client'

import { useState, useEffect, useCallback } from 'react'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import ErrorBoundary from '@/components/ErrorBoundary'
import useDebounce from '@/hooks/useDebounce'
import {
  ADMIN_PAGE_SIZE,
  DEBOUNCE_SEARCH,
  ART_SHIPPING_ZONE_GROUPS,
  ART_SHIPPING_ZONE_LABELS,
  ART_SHIPPING_ZONE_POSTAL_CODES,
  ART_SHIPPING_COPY,
  ART_SHIPPING_INSURANCE_CEILING,
  ART_SHIPPING_FILTER_MIN_CHARS,
} from '@/lib/constants'

const euros = (value) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0)

// The project's input and button styles, shared by the filters and the rows so
// the two blocks cannot drift apart. Same strings as app/admin/pedidos and
// app/admin/envios use.
const LABEL_CLASS = 'block text-sm font-medium text-gray-700'
const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 shadow-xs focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6'
const PRIMARY_BUTTON_CLASS =
  'inline-flex w-full items-center justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500'
const SECONDARY_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40'

function formatDate(value) {
  if (!value) return null
  const parsed = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'))
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The four zone blocks of one artwork, with the checkbox selection and its own
 * save button per block. Saving is per block because the semantics are per
 * block: what is stored for a territory is the set currently ticked there.
 */
function ZoneBlock({ group, result, saved, onSave }) {
  const options = result?.options || []
  const noRateOptions = result?.noRateOptions || []

  // Pre-checked from what is already generated for this artwork and group, so
  // the screen shows the stored state instead of an empty selection over live
  // data.
  const [selected, setSelected] = useState(() => new Set((saved || []).map((z) => z.optionCode)))
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    setSelected(new Set((saved || []).map((z) => z.optionCode)))
  }, [saved])

  const toggle = (optionCode) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(optionCode)) next.delete(optionCode)
      else next.add(optionCode)
      return next
    })
    setFeedback('')
    setSaveError('')
  }

  const handleSave = async () => {
    setSaving(true)
    setFeedback('')
    setSaveError('')
    try {
      const selections = options
        .filter((option) => selected.has(option.optionCode))
        .map((option) => ({
          option_code: option.optionCode,
          name: option.name,
          carrier_code: option.carrierCode || null,
          base_cost: option.baseCost,
          estimated_days: option.estimatedDays ?? null,
        }))

      await onSave(group, selections)
      setFeedback(
        selections.length === 0
          ? 'Zona vaciada: esta obra no ofrece envío generado a este territorio.'
          : `Guardadas ${selections.length} opciones para ${ART_SHIPPING_ZONE_LABELS[group]}.`
      )
    } catch (err) {
      setSaveError(err.message || 'No se pudieron guardar las zonas')
    } finally {
      setSaving(false)
    }
  }

  const savedAt = saved?.[0]?.calculatedAt

  return (
    <div className="border-t border-gray-200 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">
          {ART_SHIPPING_ZONE_LABELS[group]}{' '}
          <span className="font-normal text-gray-400">
            (CP {ART_SHIPPING_ZONE_POSTAL_CODES[group]})
          </span>
        </h4>
        {savedAt && (
          <span className="text-xs text-gray-400">Calculado el {formatDate(savedAt)}</span>
        )}
      </div>

      {result?.error ? (
        <p className="mt-2 text-sm text-red-600">{result.error}</p>
      ) : (
        <>
          {options.length === 0 && noRateOptions.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">{ART_SHIPPING_COPY.noOptions}</p>
          )}

          {options.length > 0 && (
            <ul className="mt-3 space-y-2">
              {options.map((option) => (
                <li key={option.optionCode} className="text-sm">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(option.optionCode)}
                      onChange={() => toggle(option.optionCode)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-black shadow-xs focus:ring-2 focus:ring-black"
                    />
                    <span className="flex-1">
                      <span className="font-medium text-gray-900">{option.name}</span>
                      {option.carrierName && (
                        <span className="text-gray-500"> · {option.carrierName}</span>
                      )}
                      <span className="block text-xs text-gray-500">
                        {option.breakdown?.length > 0 && (
                          <>
                            {option.breakdown
                              .map((item) => `${item.label || item.type}: ${euros(item.amount)}`)
                              .join(' + ')}
                            {' = '}
                          </>
                        )}
                        Sendcloud: {euros(option.baseCost)} · {ART_SHIPPING_COPY.vatNote}:{' '}
                        {euros(option.vatAmount)} · Embalaje: {euros(option.packagingCost)}
                      </span>
                    </span>
                    <span className="whitespace-nowrap font-semibold text-gray-900">
                      {euros(option.finalPrice)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {noRateOptions.length > 0 && (
            <ul className="mt-3 space-y-1">
              {noRateOptions.map((option) => (
                <li key={option.optionCode} className="flex items-start gap-3 text-sm text-gray-400">
                  <input
                    type="checkbox"
                    disabled
                    checked={false}
                    readOnly
                    className="mt-1 h-4 w-4 rounded border-gray-200"
                  />
                  <span className="flex-1">
                    <span className="font-medium">{option.name}</span>
                    {option.carrierName && <span> · {option.carrierName}</span>}
                    <span className="block text-xs">{ART_SHIPPING_COPY.noRate}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {options.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={`${PRIMARY_BUTTON_CLASS} w-auto`}
              >
                {saving ? 'Guardando…' : `Guardar ${ART_SHIPPING_ZONE_LABELS[group]}`}
              </button>
              {feedback && <span className="text-sm text-green-700">{feedback}</span>}
              {saveError && <span className="text-sm text-red-600">{saveError}</span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ProductRow({ product, onSaved }) {
  const [dimensions, setDimensions] = useState(product.outside_dimensions || '')
  const [weight, setWeight] = useState(
    product.outside_weight === null || product.outside_weight === undefined
      ? ''
      : String(product.outside_weight)
  )
  const [packaging, setPackaging] = useState(
    product.packaging_cost === null || product.packaging_cost === undefined
      ? ''
      : String(product.packaging_cost)
  )

  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canQuote = dimensions.trim() !== '' && weight.trim() !== ''

  const handleQuote = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await adminAPI.artShipping.quote(product.id, {
        outside_dimensions: dimensions.trim(),
        outside_weight: Number(weight),
        packaging_cost: packaging.trim() === '' ? 0 : Number(packaging),
      })
      setQuote(result)
    } catch (err) {
      setError(err.message || 'No se pudo calcular el envío')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveZones = async (zoneGroup, selections) => {
    await adminAPI.artShipping.saveZones(product.id, { zoneGroup, selections })
    // Reflect the new stored state without re-quoting: the price does not
    // change, only which options are generated.
    setQuote((previous) =>
      previous
        ? {
            ...previous,
            saved: {
              ...previous.saved,
              [zoneGroup]: selections.map((s) => ({
                optionCode: s.option_code,
                baseCost: s.base_cost,
                calculatedAt: new Date().toISOString(),
              })),
            },
          }
        : previous
    )
    if (onSaved) onSaved()
  }

  const overCeiling = Number(product.price) > ART_SHIPPING_INSURANCE_CEILING

  return (
    <div className="border-b border-gray-200 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-900">{product.name}</h3>
          <p className="text-sm text-gray-500">
            {product.author_name || '—'} · {euros(product.price)}
            {product.dimensions && <> · Obra: {product.dimensions} cm</>}
            {product.weight ? <> · {product.weight} g</> : null}
          </p>
          {product.calculated_at && (
            <p className="text-xs text-gray-400">
              {product.generated_zones} zonas generadas · último cálculo{' '}
              {formatDate(product.calculated_at)}
            </p>
          )}
        </div>
      </div>

      {overCeiling && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {ART_SHIPPING_COPY.insuranceCeiling(
            new Intl.NumberFormat('es-ES').format(Number(product.price))
          )}
        </p>
      )}

      {/* Full width of the container: the three fields and the button share the
          row evenly instead of hugging the left edge. */}
      <div className="mt-4 grid w-full grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor={`dimensions-${product.id}`} className={LABEL_CLASS}>
            Dimensiones embalaje (LxAxH cm)
          </label>
          <input
            id={`dimensions-${product.id}`}
            type="text"
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder="70x70x8"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={`weight-${product.id}`} className={LABEL_CLASS}>
            Peso embalaje (g)
          </label>
          <input
            id={`weight-${product.id}`}
            type="number"
            min="1"
            step="1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="5500"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={`packaging-${product.id}`} className={LABEL_CLASS}>
            Coste embalaje (€)
          </label>
          <input
            id={`packaging-${product.id}`}
            type="number"
            min="0"
            step="0.01"
            value={packaging}
            onChange={(e) => setPackaging(e.target.value)}
            placeholder="0"
            className={INPUT_CLASS}
          />
        </div>
        <button
          type="button"
          onClick={handleQuote}
          disabled={!canQuote || loading}
          className={PRIMARY_BUTTON_CLASS}
        >
          {loading ? 'Calculando…' : 'Guardar y calcular envío'}
        </button>
      </div>

      {!canQuote && (
        <p className="mt-2 text-sm text-gray-500">{ART_SHIPPING_COPY.missingPackaging}</p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {quote && (
        <div className="mt-4">
          {ART_SHIPPING_ZONE_GROUPS.map((group) => (
            <ZoneBlock
              key={group}
              group={group}
              result={quote.groups?.[group]}
              saved={quote.saved?.[group]}
              onSave={handleSaveZones}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CalculadoraEnviosContent() {
  const [titleInput, setTitleInput] = useState('')
  const [authorInput, setAuthorInput] = useState('')
  const debouncedTitle = useDebounce(titleInput, DEBOUNCE_SEARCH)
  const debouncedAuthor = useDebounce(authorInput, DEBOUNCE_SEARCH)

  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // A filter applies from three characters, but an emptied field applies too:
  // otherwise clearing the box would leave the list frozen on the last result.
  const effective = (value) =>
    value.trim().length >= ART_SHIPPING_FILTER_MIN_CHARS ? value.trim() : ''
  const titleFilter = effective(debouncedTitle)
  const authorFilter = effective(debouncedAuthor)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await adminAPI.artShipping.listProducts({
        title: titleFilter || undefined,
        author: authorFilter || undefined,
        page,
        limit: ADMIN_PAGE_SIZE,
      })
      setData(result)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las obras')
    } finally {
      setLoading(false)
    }
  }, [titleFilter, authorFilter, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [titleFilter, authorFilter])

  const products = data?.products || []
  const pagination = data?.pagination

  // Same container as the rest of the admin section (app/admin/envios), so the
  // product rows get the width the shipping-method listing has.
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-gray-900">Calculadora de envíos</h1>
      <p className="mt-1 text-sm text-gray-500">
        Cotiza cada obra contra Sendcloud en los cuatro territorios de España y guarda las opciones
        que quieras ofrecer al comprador.
      </p>

      <div className="mt-6 mb-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="filter-title" className={LABEL_CLASS}>
              Título
            </label>
            <input
              id="filter-title"
              type="search"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Buscar por título…"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="filter-author" className={LABEL_CLASS}>
              Artista
            </label>
            <input
              id="filter-author"
              type="search"
              value={authorInput}
              onChange={(e) => setAuthorInput(e.target.value)}
              placeholder="Buscar por artista…"
              className={INPUT_CLASS}
            />
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          El filtro se aplica a partir de {ART_SHIPPING_FILTER_MIN_CHARS} caracteres. Vacía el
          campo para ver toda la lista.
        </p>
      </div>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="mt-8 text-sm text-gray-500">Cargando obras…</p>
      ) : products.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">No hay obras que coincidan con el filtro.</p>
      ) : (
        <div className="mt-6">
          {products.map((product) => (
            <ProductRow key={product.id} product={product} />
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="mt-8 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Página {pagination.page} de {pagination.pages} · {pagination.total} obras
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={pagination.page <= 1}
              className={SECONDARY_BUTTON_CLASS}
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={pagination.page >= pagination.pages}
              className={SECONDARY_BUTTON_CLASS}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CalculadoraEnviosPage() {
  return (
    <AuthGuard requireRole="admin">
      <ErrorBoundary>
        <CalculadoraEnviosContent />
      </ErrorBoundary>
    </AuthGuard>
  )
}
