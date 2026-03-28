'use client'

import { useState } from 'react'

export default function StoryVideo({ videos }) {
  const [video] = useState(() => videos[Math.floor(Math.random() * videos.length)])

  return (
    <div className="overflow-hidden rounded-2xl aspect-[1/1] max-h-[100vh] w-auto">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="h-full w-full object-cover pointer-events-none"
        src={`/video/stories/${video}`}
      />
    </div>
  )
}
