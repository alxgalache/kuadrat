import Image from 'next/image'

export default function EventBadge({ type = 'auction' }) {
  const isAuction = type === 'auction'
  const label = isAuction ? 'Subasta' : 'Sorteo'

  return (
    <div className="absolute top-2 left-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-900 shadow-sm">
      {isAuction ? (
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
      ) : (
        <Image src="/brand/icons/dice.png" alt="Sorteo" width={14} height={14} className="object-contain" />
      )}
      {label}
    </div>
  )
}
