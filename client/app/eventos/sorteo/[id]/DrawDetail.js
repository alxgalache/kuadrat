'use client'

import { useState, useEffect, use } from 'react'
import Image from 'next/image'
import { drawsAPI, authorsAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'
import useDrawSocket from '@/hooks/useDrawSocket'
import DrawParticipationModal from '@/components/DrawParticipationModal'
import DrawHowWorksModal from '@/components/DrawHowWorksModal'
import AuthorModal from '@/components/AuthorModal'
import Breadcrumbs from '@/components/Breadcrumbs'
import {SafeProductDescription} from "@/components/SafeHTML";

export default function DrawDetail({ params }) {
  const unwrappedParams = use(params)
  const [draw, setDraw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [howWorksOpen, setHowWorksOpen] = useState(false)
  const [selectedAuthor, setSelectedAuthor] = useState(null)
  const [authorModalOpen, setAuthorModalOpen] = useState(false)
  const { showBanner } = useBannerNotification()

  const { drawEnded, timeRemaining } = useDrawSocket(
    draw?.id,
    draw?.end_datetime
  )

  useEffect(() => {
    loadDraw()
  }, [])

  const loadDraw = async () => {
    try {
      const data = await drawsAPI.getById(unwrappedParams.id)
      setDraw(data.draw)
    } catch {
      setError('No se pudo cargar el sorteo')
    } finally {
      setLoading(false)
    }
  }

  const handleViewAuthorBio = async () => {
    if (!draw?.seller_slug) {
      console.warn('No seller_slug available for this draw')
      return
    }

    try {
      const authorData = await authorsAPI.getBySlug(draw.seller_slug)
      if (authorData?.author) {
        setSelectedAuthor(authorData.author)
        setAuthorModalOpen(true)
      } else {
        console.error('No author data received')
      }
    } catch (err) {
      console.error('Failed to load author:', err)
      showBanner('No se pudo cargar la información del autor')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
      </div>
    )
  }

  if (error || !draw) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-gray-500">{error || 'Sorteo no encontrado'}</p>
      </div>
    )
  }

  const imageUrl = draw.basename
    ? (draw.product_type === 'art'
        ? getArtImageUrl(draw.basename)
        : getOthersImageUrl(draw.basename))
    : null

  const isFull = draw.participation_count >= draw.max_participations
  const isActive = draw.status === 'active'
  const isFinished = draw.status === 'finished'
  const isCancelled = draw.status === 'cancelled'

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const formatDrawDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const dayName = date.toLocaleDateString('es-ES', { weekday: 'long' })
    const day = date.getDate()
    const month = date.toLocaleDateString('es-ES', { month: 'long' })
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${day} de ${month} – ${hours}:${minutes} CET`
  }

  let buttonText = 'Inscribirse en el sorteo'
  let buttonDisabled = false
  if (isFull) {
    buttonText = 'Sorteo completo'
    buttonDisabled = true
  } else if (isFinished || drawEnded) {
    buttonText = 'Sorteo finalizado'
    buttonDisabled = true
  } else if (isCancelled) {
    buttonText = 'Sorteo cancelado'
    buttonDisabled = true
  } else if (!isActive) {
    buttonText = 'Sorteo no disponible'
    buttonDisabled = true
  }

  return (
    <div className="bg-white">
        <Breadcrumbs
          items={[
            { name: 'Eventos', href: '/eventos' },
            { name: draw.name },
          ]}
        />

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12 lg:max-w-7xl lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          {/* Image column */}
          <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-200 relative">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={draw.product_name || draw.name}
                fill
                priority
                className="object-contain object-center"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-gray-400 text-sm">Sin imagen</span>
              </div>
            )}
          </div>

          {/* Details column */}
          <div className="mt-10 px-4 sm:mt-16 sm:px-0 lg:mt-0">
            {/* Product name */}
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              {draw.product_name || draw.name}
            </h1>

            {/* Price */}
            <div className="mt-3">
              <p className="text-3xl tracking-tight text-gray-900">€{Number(draw.price).toFixed(2)}</p>
            </div>

            {/* Draw badge */}
            <div className="mt-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-gray-200 px-3.5 py-1.5 text-sm font-medium text-gray-900">
                <Image src="/brand/icons/dice.png" alt="Sorteo" width={16} height={16} className="object-contain" />
                Sorteo
              </span>
            </div>

            {/* Description */}
            {draw.product_description && (
                <div className="mt-6">
                  <h3 className="sr-only">Descripción</h3>
                  <SafeProductDescription
                      html={draw.product_description}
                      className="space-y-6 text-base text-gray-700 prose prose-sm max-w-none"
                  />
                </div>
            )}

            {/* Author */}
            {draw.seller_name && (
              <div className="mt-6">
                <p className="text-lg text-gray-700 mt-1">
                  <span className="font-medium">Autor:</span>{' '}
                  {draw.seller_name}
                  <button
                    onClick={handleViewAuthorBio}
                    className="text-sm ml-2 text-gray-700 hover:text-gray-500 hover:underline"
                  >
                    (más información)
                  </button>
                </p>
              </div>
            )}

            {/* Draw entry section */}
            <section className="relative flex flex-col items-center rounded-sm border border-divider/20 bg-white p-6 mt-6">
              <div className="mb-6 flex w-full flex-col space-y-3 text-center">
                <div>
                  <p className="w-full font-bold">Sorteo cierra el</p>
                  <p className="w-full">
                    <span title={formatDrawDate(draw.end_datetime)}>
                      {formatDrawDate(draw.end_datetime)}
                    </span>
                  </p>
                </div>
                {timeRemaining && !drawEnded && (
                  <p className="w-full text-lg font-mono font-semibold text-gray-900">
                    {String(timeRemaining.hours).padStart(2, '0')}:{String(timeRemaining.minutes).padStart(2, '0')}:{String(timeRemaining.seconds).padStart(2, '0')}
                  </p>
                )}
                {drawEnded && (
                  <p className="w-full text-sm font-medium text-red-600">
                    El sorteo ha terminado
                  </p>
                )}
                <p className="w-full text-neutral-400">
                  {draw.units === 1 ? 'Edición única' : `Edición de ${draw.units} unidades`}. Mínimo {draw.min_participants} participantes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={buttonDisabled}
                className={`p-4 rounded-sm w-full text-white ${
                  buttonDisabled
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gray-900 hover:bg-gray-800'
                }`}
              >
                <span className="px-1">{buttonText}</span>
              </button>
              <button className="mt-3 text-sm underline" type="button" onClick={() => setHowWorksOpen(true)}>
                Cómo funcionan los sorteos
              </button>
            </section>
          </div>
        </div>
      </div>

      {/* Author bio modal */}
      <AuthorModal
        author={selectedAuthor}
        open={authorModalOpen}
        onClose={() => setAuthorModalOpen(false)}
      />

      {/* How draws work modal */}
      <DrawHowWorksModal
        isOpen={howWorksOpen}
        onClose={() => setHowWorksOpen(false)}
      />

      {/* Participation modal */}
      <DrawParticipationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        draw={draw}
        drawEnded={drawEnded}
        onEntryComplete={() => loadDraw()}
      />
    </div>
  )
}
