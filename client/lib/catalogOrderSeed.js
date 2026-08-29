import { CATALOG_ORDER_SEED_MAX } from '@/lib/constants'

/**
 * Semilla de ordenación de las rejillas de `/galeria` y `/tienda`.
 *
 * La API entrelaza los artistas de forma determinista a partir de esta semilla:
 * la misma semilla produce siempre el mismo orden, y por eso las páginas 2, 3…
 * del scroll infinito tienen que viajar con la MISMA que la página 1, o la
 * ventana de paginación se desplazaría sobre dos ordenaciones distintas y
 * habría obras repetidas y obras que no aparecen en ninguna página.
 *
 * El sorteo y la validación viven juntos aquí —y no repartidos entre el hook
 * que sortea y el que valida la instantánea— por la misma razón que
 * `lib/cookieConsent.js` reúne su script y su clave: dos lectores del mismo
 * valor que pueden desincronizarse en silencio.
 *
 * IMPORTANTE: `drawOrderSeed()` NO puede llamarse durante el render. Ambas
 * rutas se prerrenderizan, y un valor aleatorio calculado en el servidor no
 * coincidiría con el del cliente — es el fallo de hidratación que ya costó el
 * vídeo de la portada. Se llama desde un efecto.
 */
export function drawOrderSeed() {
  return Math.floor(Math.random() * (CATALOG_ORDER_SEED_MAX + 1))
}

export function isValidOrderSeed(value) {
  return Number.isInteger(value) && value >= 0 && value <= CATALOG_ORDER_SEED_MAX
}
