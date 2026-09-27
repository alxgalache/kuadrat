'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminAPI } from '@/lib/api'
import { EVENT_RECORDING_COPY, EVENT_RECORDING_RETENTION_DAYS } from '@/lib/constants'
import { awsSyncCommand, formatBytes } from '@/lib/eventRecording'

const COPY = EVENT_RECORDING_COPY.panel
const LIVE_STATUSES = ['starting', 'recording', 'stopping']
const REFRESH_MS = 30000

const STATUS_CLASS = {
  starting: 'bg-gray-50 text-gray-700',
  recording: 'bg-red-50 text-red-700',
  stopping: 'bg-gray-50 text-gray-700',
  stopped: 'bg-green-50 text-green-700',
  interrupted: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function CopyableCommand({ label, command }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (insecure context): the command stays selectable.
    }
  }
  return (
    <div>
      <p className="text-xs font-medium text-gray-700">{label}</p>
      <div className="mt-1 flex items-start gap-x-2">
        <code className="block flex-1 select-all break-all rounded-md bg-gray-50 px-2 py-1.5 font-mono text-xs text-gray-800 ring-1 ring-inset ring-gray-200">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          {copied ? COPY.copied : COPY.copy}
        </button>
      </div>
    </div>
  )
}

/**
 * «Grabaciones» on the admin event page (agora-event-recording). Lists each
 * cloud recording task of the event as a part, read from the bucket by the
 * api. A stream's MP4 is downloaded through a URL signed on click; a
 * meeting's per-participant tracks through the AWS CLI command shown, because
 * they are thousands of files that only make sense together.
 */
export default function EventRecordingsPanel({ eventId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [preparing, setPreparing] = useState(null)
  const [downloadError, setDownloadError] = useState('')

  const load = useCallback(async () => {
    try {
      const result = await adminAPI.events.getRecordings(eventId)
      setData(result)
      setError('')
    } catch {
      setError(COPY.loadError)
    }
  }, [eventId])

  useEffect(() => { load() }, [load])

  const hasLiveTask = !!data?.recordings?.some((r) => LIVE_STATUSES.includes(r.status))
  useEffect(() => {
    if (!hasLiveTask) return undefined
    const interval = setInterval(load, REFRESH_MS)
    return () => clearInterval(interval)
  }, [hasLiveTask, load])

  const download = async (recording, file) => {
    setDownloadError('')
    setPreparing(`${recording.id}:${file}`)
    try {
      const { url } = await adminAPI.events.getRecordingDownloadUrl(eventId, recording.id, file)
      window.location.assign(url)
    } catch {
      setDownloadError(COPY.downloadError)
    } finally {
      setPreparing(null)
    }
  }

  const retentionDays = data?.retentionDays || EVENT_RECORDING_RETENTION_DAYS

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900">{COPY.title}</h2>
      <p className="mt-1 text-sm text-gray-500">{COPY.retention(retentionDays)}</p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {downloadError && <p className="mt-4 text-sm text-red-600">{downloadError}</p>}

      {data && data.recordings.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">{COPY.empty}</p>
      )}

      {data && data.recordings.length > 0 && (
        <div className="mt-4 space-y-4">
          {data.recordings.map((recording) => {
            const part = recording.attempt + 1
            const expired = recording.availableUntil && new Date(recording.availableUntil) < new Date()
            const emptyListing = recording.listed && recording.objectCount === 0
            const folder = `grabacion-parte-${part}`
            return (
              <div key={recording.id} className="rounded-lg border border-gray-200 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-gray-900">{COPY.part(part)}</span>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[recording.status] || 'bg-gray-50 text-gray-700'}`}>
                    {COPY.status[recording.status] || recording.status}
                  </span>
                  {recording.availableUntil && !expired && (
                    <span className="text-xs text-gray-500">
                      {COPY.availableUntil(formatDate(recording.availableUntil))}
                    </span>
                  )}
                </div>

                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-gray-500 sm:grid-cols-3">
                  <div><dt className="inline">{COPY.started}: </dt><dd className="inline text-gray-700">{formatDateTime(recording.startedAt)}</dd></div>
                  <div><dt className="inline">{COPY.stopped}: </dt><dd className="inline text-gray-700">{formatDateTime(recording.stoppedAt)}</dd></div>
                  {recording.stopReason && (
                    <div><dt className="inline">{COPY.reason}: </dt><dd className="inline text-gray-700">{COPY.stopReason[recording.stopReason] || recording.stopReason}</dd></div>
                  )}
                </dl>

                {recording.error && (
                  <p className="mt-2 text-xs text-red-600">{COPY.error}: {recording.error}</p>
                )}
                {recording.listError && (
                  <p className="mt-2 text-xs text-red-600">{COPY.listError}</p>
                )}

                {emptyListing && !LIVE_STATUSES.includes(recording.status) && (
                  <p className="mt-2 text-sm text-gray-500">{expired ? COPY.expired : COPY.noFiles}</p>
                )}

                {recording.listed && recording.mode === 'mix' && recording.files.length > 0 && (
                  <ul className="mt-3 divide-y divide-gray-100">
                    {recording.files.map((file) => (
                      <li key={file.name} className="flex items-center justify-between py-2">
                        <span className="truncate text-sm text-gray-700">
                          {file.name} <span className="text-gray-400">· {formatBytes(file.bytes)}</span>
                        </span>
                        {!LIVE_STATUSES.includes(recording.status) && (
                          <button
                            type="button"
                            onClick={() => download(recording, file.name)}
                            disabled={preparing === `${recording.id}:${file.name}`}
                            className="ml-3 shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                          >
                            {preparing === `${recording.id}:${file.name}` ? COPY.preparing : COPY.download}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {recording.listed && recording.mode === 'individual' && recording.participants.length > 0 && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-gray-500">{COPY.cliHint}</p>
                    <CopyableCommand
                      label={COPY.sessionCommand}
                      command={awsSyncCommand({ bucket: recording.bucket, prefix: recording.prefix, folder })}
                    />
                    <p className="text-sm font-medium text-gray-900">{COPY.participants}</p>
                    <ul className="space-y-3">
                      {recording.participants.map((p) => (
                        <li key={p.uid} className="rounded-md bg-gray-50/50 px-3 py-2 ring-1 ring-inset ring-gray-100">
                          <p className="text-sm text-gray-900">
                            {p.name}
                            {p.role === 'host' && (
                              <span className="ml-2 inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">{COPY.host}</span>
                            )}
                            {p.role === 'unknown' && (
                              <span className="ml-2 text-xs text-gray-400">{COPY.unknownParticipant}</span>
                            )}
                            <span className="ml-2 text-xs text-gray-500">
                              {p.tracks.map((t) => COPY.tracks[t] || t).join(' · ')} · {formatBytes(p.bytes)}
                            </span>
                          </p>
                          <div className="mt-2">
                            <CopyableCommand
                              label={COPY.participantCommand}
                              command={awsSyncCommand({
                                bucket: recording.bucket,
                                prefix: recording.prefix,
                                folder: `${folder}-uid-${p.uid}`,
                                uid: p.uid,
                              })}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!recording.listed && !data.downloadsAvailable && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500">{COPY.noCredentials}</p>
                    <code className="mt-1 block select-all break-all rounded-md bg-gray-50 px-2 py-1.5 font-mono text-xs text-gray-800 ring-1 ring-inset ring-gray-200">
                      {`s3://${recording.bucket}/${recording.prefix}`}
                    </code>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
