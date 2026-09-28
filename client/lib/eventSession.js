// La sesión de asistente a un evento guardada en el navegador:
// { attendeeId, accessToken, firstName, lastName }.
//
// Un solo módulo para la clave y el formato. Antes había cuatro copias
// (EventAccessModal, EventDetail, AgoraLiveRoom, EventLiveRoom), y la sesión
// de admin tenía que imitar a mano la forma que escribía el modal.
//
// Que exista una sesión aquí NO significa que dé acceso: el token puede
// haberse sustituido desde otro dispositivo, o el asistente puede estar
// expulsado. EventDetail lo pregunta al servidor (POST /session) antes de
// decir «Ya tienes acceso» (enforce-verification-gates).

const keyFor = (eventId) => `event_attendee_${eventId}`

export function getStoredSession(eventId) {
  if (typeof window === 'undefined' || !eventId) return null
  try {
    const raw = localStorage.getItem(keyFor(eventId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function storeSession(eventId, session) {
  if (typeof window === 'undefined' || !eventId) return
  try {
    localStorage.setItem(keyFor(eventId), JSON.stringify(session))
  } catch {
    // Almacenamiento bloqueado (modo privado estricto): la sesión dura lo que
    // la pestaña, que es lo único posible sin localStorage.
  }
}

export function clearStoredSession(eventId) {
  if (typeof window === 'undefined' || !eventId) return
  try {
    localStorage.removeItem(keyFor(eventId))
  } catch {
    // Ignorado: no hay nada que borrar si el almacenamiento no está disponible
  }
}
