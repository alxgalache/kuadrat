import React from 'react'

// Stub for next/image used only by the design-sync bundle. Renders a plain
// <img>, mapping `fill` to absolute cover layout and dropping Next-only props.
export default function Image({
  src,
  alt = '',
  width,
  height,
  fill,
  priority,
  quality,
  placeholder,
  blurDataURL,
  loader,
  sizes,
  unoptimized,
  onLoadingComplete,
  loading,
  fetchPriority,
  style,
  ...rest
}) {
  const raw = typeof src === 'string' ? src : (src && (src.src || src.default)) || ''
  // Local /public assets (logo, icons) aren't served in the design renderer —
  // resolve them against the production origin so real brand images load.
  const s = raw.startsWith('/') ? 'https://140d.art' + raw : raw
  const st = fill
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...style }
    : style
  return (
    <img
      src={s}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={loading}
      style={st}
      {...rest}
    />
  )
}
