import Image from 'next/image'
import Link from 'next/link'
import EventBadge from '@/components/EventBadge'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/api'

export default function DrawGridItem({ draw }) {
  const preview = draw.product_preview || {}
  const imageUrl = preview.basename
    ? (preview.product_type === 'art'
        ? getArtImageUrl(preview.basename)
        : getOthersImageUrl(preview.basename))
    : null

  return (
    <li className="inline-flex w-full flex-col text-center">
      <div className="group relative">
        {/* Image area with badge overlay */}
        <div className="relative">
          <EventBadge type="draw" />
          <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-200 relative">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={preview.name || draw.name}
                fill
                className="object-cover object-center"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-gray-400 text-sm">Sin imagen</span>
              </div>
            )}
          </div>
        </div>

        {/* Text area */}
        <div className="mt-6">
          <p className="text-sm text-gray-500">
            {preview.seller_name || 'Autor desconocido'}
          </p>

          <h3 className="mt-1 font-semibold text-gray-900">
            <Link href={`/eventos/sorteo/${draw.id}`}>
              <span className="absolute inset-0" />
              {preview.name || draw.name}
            </Link>
          </h3>

          <p className="mt-1">
            <span className="font-semibold text-gray-900">€{Number(draw.price).toFixed(2)}</span>
          </p>
        </div>
      </div>
    </li>
  )
}
