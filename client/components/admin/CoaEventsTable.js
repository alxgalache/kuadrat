'use client'

import StatusBadge from './StatusBadge'

function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function truncate(value, max) {
  if (!value) return ''
  return value.length > max ? value.slice(0, max) + '…' : value
}

export default function CoaEventsTable({ events }) {
  if (!events || events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        Sin eventos de verificación registrados todavía.
      </p>
    )
  }

  return (
    <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
      <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
        <table className="min-w-full divide-y divide-gray-300">
          <thead>
            <tr>
              <th scope="col" className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-gray-900 sm:pl-0">
                Fecha
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-gray-900">
                Estado
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-gray-900">
                Counter
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-gray-900">
                IP (hash)
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-gray-900">
                User-Agent
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {events.map((event) => (
              <tr key={event.id}>
                <td className="whitespace-nowrap py-3 pl-4 pr-3 text-xs text-gray-700 sm:pl-0">
                  {formatDateTime(event.occurred_at)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs">
                  <StatusBadge type="event" value={event.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-700 font-mono">
                  {event.counter ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-700 font-mono" title={event.ip_hash || ''}>
                  {event.ip_hash ? event.ip_hash.slice(0, 8) + '…' : '—'}
                </td>
                <td className="px-3 py-3 text-xs text-gray-500 max-w-md" title={event.user_agent || ''}>
                  {truncate(event.user_agent || '—', 60)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
