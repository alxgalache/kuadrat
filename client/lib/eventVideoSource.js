import {
  EVENT_VIDEO_AV1_CONTENT_TYPE,
  EVENT_VIDEO_CDN_PREFIX,
  EVENT_VIDEO_PROBE,
  EVENT_VIDEO_PROBE_TIMEOUT_MS,
} from '@/lib/constants'

/**
 * ¿Decodifica este dispositivo el AV1 del pase por hardware?
 * (event-video-cdn-delivery)
 *
 * `supported` solo dice que el navegador PUEDE decodificarlo, también por
 * software; `powerEfficient` dice que lo hace con el decodificador del equipo.
 * Se exige lo segundo: un AV1 de 10 bits a 1080p por software da tirones en un
 * portátil viejo o un móvil modesto, y en un pase sincronizado cada tirón acaba
 * en un salto hacia delante. Por eso no se usa el orden de <source>, que elegiría
 * AV1 con solo poder decodificarlo.
 */
export async function canPlayAv1Efficiently() {
  if (typeof navigator === 'undefined' || !navigator.mediaCapabilities?.decodingInfo) return false
  try {
    const probe = navigator.mediaCapabilities.decodingInfo({
      type: 'file',
      video: { contentType: EVENT_VIDEO_AV1_CONTENT_TYPE, ...EVENT_VIDEO_PROBE },
    })
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), EVENT_VIDEO_PROBE_TIMEOUT_MS))
    const info = await Promise.race([probe, timeout])
    return Boolean(info?.supported && info?.powerEfficient)
  } catch {
    return false
  }
}

/**
 * Elige la fuente del pase: AV1 si el dispositivo lo decodifica por hardware,
 * el MP4 H.264 en cualquier otro caso.
 * @param {{ mp4: string, av1: string|null }} sources
 * @returns {Promise<{ url: string, codec: 'av1'|'h264' }>}
 */
export async function pickVideoSource({ mp4, av1 }) {
  if (av1 && (await canPlayAv1Efficiently())) return { url: av1, codec: 'av1' }
  return { url: mp4, codec: 'h264' }
}

/**
 * Para el aviso del formulario de admin: ¿está la URL en la carpeta que
 * CloudFront solo sirve firmada? Solo mira la ruta; la autoridad es la API, que
 * además rechaza guardar una URL del CDN fuera de esa carpeta.
 */
export function isProtectedVideoPath(value) {
  if (!value) return true
  try {
    return new URL(value).pathname.startsWith(EVENT_VIDEO_CDN_PREFIX)
  } catch {
    return false
  }
}
