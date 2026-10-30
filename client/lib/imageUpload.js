// Preparación de las imágenes de producto antes de subirlas.
//
// Todas las imágenes de un producto viajan en UNA petición multipart, y la API
// corta cualquier petición de más de 15 MB (MAX_REQUEST_BYTES). Tres fotos de
// móvil a resolución completa ya la superaban. Aquí cada imagen se reduce a
// PRODUCT_IMAGE_MAX_DIMENSION en su lado largo y se recodifica:
//
// - WebP donde el navegador sabe codificarlo (Chrome, Edge, Firefox).
// - JPEG en Safari. Safari no tiene codificador WebP para canvas: si se le pide
//   `image/webp`, devuelve un PNG sin avisar, más pesado que el original. Tras
//   reducir la imagen, la diferencia entre WebP y JPEG es pequeña comparada con
//   la del tamaño en píxeles, y un codificador WebP en WebAssembly sería una
//   dependencia más para ese margen.
//
// Recodificar también descarta los metadatos (EXIF, incluida la ubicación GPS de
// la cámara). Lo que se sube es lo que queda publicado en el CDN, y la URL del
// original viaja dentro de cada URL de /_next/image.
//
// Los ppp («densidad de píxeles») no se tocan porque no influyen en el peso: son
// una etiqueta para imprimir. El peso depende del número de píxeles y de la
// calidad de compresión.

import {
  PRODUCT_IMAGE_MAX_DIMENSION,
  PRODUCT_IMAGE_MIN_DIMENSION,
  PRODUCT_IMAGE_QUALITY,
} from '@/lib/constants'

// Dimensiones de salida. Reduce el lado largo al máximo, pero nunca deja el lado
// corto por debajo del mínimo que exige la API: una imagen muy alargada pasaría
// aquí y se rechazaría allí. Nunca amplía.
export function targetDimensions(
  width,
  height,
  maxDimension = PRODUCT_IMAGE_MAX_DIMENSION,
  minDimension = PRODUCT_IMAGE_MIN_DIMENSION,
) {
  const longSide = Math.max(width, height)
  const shortSide = Math.min(width, height)
  let scale = Math.min(1, maxDimension / longSide)
  if (shortSide * scale < minDimension) scale = Math.min(1, minDimension / shortSide)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

// Decodifica el fichero en un <img>. `release()` libera la URL temporal: hay que
// llamarla siempre, también si algo falla después.
export function decodeImage(file) {
  const url = URL.createObjectURL(file)
  const image = new Image()
  return new Promise((resolve, reject) => {
    image.onload = () => resolve({
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo decodificar la imagen'))
    }
    image.src = url
  })
}

let webpEncodingSupported
function canEncodeWebp() {
  if (webpEncodingSupported === undefined) {
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    webpEncodingSupported = probe.toDataURL('image/webp').startsWith('data:image/webp')
  }
  return webpEncodingSupported
}

function drawToCanvas(source, width, height, background) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

// Safari en iOS retiene la memoria de un canvas hasta que se recoge, y tiene un
// tope total bajo. Dejarlo a 0×0 la devuelve en el acto.
function releaseCanvas(canvas) {
  canvas.width = 0
  canvas.height = 0
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function render(image, width, height, type) {
  // Si la reducción es de más de la mitad, se pasa antes por un lienzo del doble
  // del tamaño final. Una reducción grande en un solo paso salta píxeles del
  // original y produce dientes de sierra en el detalle fino, que en una foto de
  // obra se nota. El intermedio mide como mucho 4000×4000, dentro del tope de
  // Safari en iOS (16,7 Mpx por lienzo).
  let intermediate = null
  if (image.naturalWidth > width * 2) {
    intermediate = drawToCanvas(image, width * 2, height * 2)
  }
  // JPEG no tiene transparencia, y sin fondo el navegador pinta de negro lo
  // transparente. El sitio es solo de tema claro: fondo blanco.
  const background = type === 'image/jpeg' ? '#ffffff' : null
  const canvas = drawToCanvas(intermediate || image, width, height, background)
  try {
    return await canvasToBlob(canvas, type, PRODUCT_IMAGE_QUALITY)
  } finally {
    releaseCanvas(canvas)
    if (intermediate) releaseCanvas(intermediate)
  }
}

function withExtension(name, extension) {
  const base = (name || 'imagen').replace(/\.[^.]+$/, '') || 'imagen'
  return `${base}.${extension}`
}

// Devuelve el File que se sube: la imagen reducida y recodificada o, si el
// navegador no consigue codificarla, el original sin tocar. La API valida
// igualmente lo que reciba.
export async function optimizeImage(file, image) {
  const { width, height } = targetDimensions(image.naturalWidth, image.naturalHeight)
  const type = canEncodeWebp() ? 'image/webp' : 'image/jpeg'

  let blob = null
  try {
    blob = await render(image, width, height, type)
  } catch {
    blob = null
  }
  // `toBlob` devuelve null si el lienzo supera los topes del navegador, y otro
  // tipo si no sabe codificar el pedido.
  if (!blob || blob.type !== type) return file

  return new File([blob], withExtension(file.name, type === 'image/webp' ? 'webp' : 'jpg'), {
    type,
    lastModified: Date.now(),
  })
}

// Cota superior del cuerpo multipart que generará el navegador para este
// FormData: el contenido de cada parte más su cabecera (límite,
// Content-Disposition con el nombre del campo y del fichero, y Content-Type).
const MULTIPART_PART_OVERHEAD = 256
export function estimateFormDataBytes(formData) {
  const encoder = new TextEncoder()
  let total = 0
  for (const [key, value] of formData.entries()) {
    total += MULTIPART_PART_OVERHEAD + encoder.encode(key).length
    if (typeof value === 'string') {
      total += encoder.encode(value).length
    } else {
      total += value.size + encoder.encode(value.name || '').length
    }
  }
  return total
}
