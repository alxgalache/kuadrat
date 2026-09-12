'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IMAGE_LOADER_DELAY } from '@/lib/constants'

/**
 * Estado de carga de una imagen, para pintar un indicador sobre el hueco gris
 * mientras llega. Único sitio donde vive esta lógica: la usan las diez
 * superficies del escaparate y ninguna la repite.
 *
 * `imageKey` identifica la imagen que se está mirando (su `basename` o su URL).
 * Cuando cambia —el carrusel avanza, el visor pasa a la siguiente— el estado se
 * reevalúa, porque la imagen nueva puede no estar descargada. Pasar `null`
 * desactiva el hook por completo, que es lo que necesita una superficie sin
 * imagen que pintar: así se puede llamar incondicionalmente, como exigen las
 * reglas de los hooks, sin que un hueco «Sin imagen» acabe girando.
 *
 * Devuelve `{ ref, showLoader, onLoad, onError }`, los tres últimos para el
 * mismo `<Image>`. La `ref` llega al `<img>` real: `next/image` la fusiona con
 * la suya (`useMergedRef(forwardedRef, ownRef)`, comprobado en el bundle
 * instalado, next 16.2.12).
 */
export default function useImageLoaded(imageKey) {
  const ref = useRef(null)
  const [showLoader, setShowLoader] = useState(false)

  // Fuera del estado de React a propósito: el temporizador necesita consultar
  // «¿ya llegó?» en el momento de dispararse, sin reprogramarse ni provocar un
  // render por el camino.
  const doneRef = useRef(false)

  // El estado inicial es «sin indicador» y el retardo vive aquí dentro, en un
  // efecto que no corre en el servidor. Eso resuelve dos cosas con una sola
  // pieza: en caché la imagen está pintada mucho antes de IMAGE_LOADER_DELAY y
  // no se ve ninguna animación, y el HTML servido no contiene indicador, así que
  // no hay desajuste de hidratación posible en las rutas que renderiza el
  // servidor (fichas de autor, de subasta, de sorteo y de evento).
  useEffect(() => {
    doneRef.current = false
    setShowLoader(false)

    if (!imageKey) return

    // `onLoad` es un manejador de React: si la imagen ya estaba completa cuando
    // React lo adjuntó —la vuelta atrás del historial, la segunda visita, la
    // caché de nginx— el evento YA se disparó y no volverá a hacerlo. Sin esta
    // comprobación imperativa el indicador se quedaría encendido para siempre
    // encima de una imagen perfectamente visible.
    //
    // `naturalWidth` no sobra: una imagen fallida también reporta `complete`.
    //
    // Cubre además la carrera inversa —que `onLoad` se dispare entre el commit y
    // este efecto, y que el `doneRef.current = false` de arriba lo borre—,
    // porque en ese caso `complete` ya es true y se vuelve a marcar aquí.
    const node = ref.current
    if (node && node.complete && node.naturalWidth > 0) {
      doneRef.current = true
      return
    }

    let timer = null
    const armar = () => {
      timer = setTimeout(() => {
        if (!doneRef.current) setShowLoader(true)
      }, IMAGE_LOADER_DELAY)
    }

    // El temporizador NO arranca al montar la celda, sino cuando el navegador
    // está a punto de pedir la imagen.
    //
    // `next/image` marca como `loading="lazy"` todo lo que no lleva `priority`,
    // y una imagen lejos del viewport no ha empezado siquiera a descargarse
    // (`currentSrc` vacío). Un indicador ahí no dice «esto viene en camino»:
    // dice una mentira, y se queda girando indefinidamente sobre una celda que
    // nadie está mirando. Medido en /galeria: ocho de doce celdas en ese estado
    // nada más cargar, y con el scroll infinito no se resuelven nunca.
    //
    // El margen de 200 px hace que el indicador esté ya puesto cuando la celda
    // entra en pantalla, en vez de aparecer un cuarto de segundo después.
    if (!node || typeof IntersectionObserver === 'undefined') {
      armar()
      return () => clearTimeout(timer)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        armar()
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)

    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [imageKey])

  // `onError` apaga el indicador igual que `onLoad`. Una animación girando sobre
  // una imagen que no va a llegar nunca es peor que el gris estático: miente.
  const finish = useCallback(() => {
    doneRef.current = true
    setShowLoader(false)
  }, [])

  return { ref, showLoader, onLoad: finish, onError: finish }
}
