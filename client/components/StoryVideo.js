'use client'

import { useState } from 'react'

export default function StoryVideo({ videos }) {
  const [video] = useState(() => {
    if (!videos || videos.length === 0) return null
    return videos[Math.floor(Math.random() * videos.length)]
  })

  if (!video) return null

  return (
    <div className="overflow-hidden rounded-2xl aspect-[1/1] max-h-[100vh] w-auto">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="h-full w-full object-cover pointer-events-none"
        src={video.url}
      />
    </div>
  )
}
