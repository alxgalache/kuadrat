## 1. Servidor: el instante de la mano

- [x] 1.1 `api/socket/eventSocket.js`: añadir `handRaisedAt` a `publicPresence` y al comentario del mapa de presencia (`eventId → Map<identity, {...}>`).
- [x] 1.2 `hand_raise`: sellar `entry.handRaisedAt = Date.now()` **solo** cuando `!entry.handRaised && raised`; ponerlo a `null` al bajar la mano; no tocarlo si ya estaba levantada.
- [x] 1.3 `notifyPromoted`: limpiar `handRaisedAt` junto a `handRaised`.
- [x] 1.4 Comprobar que la rama `existing` de `join_event_room` sigue sin sobrescribir `handRaised`/`handRaisedAt` (reconexión), y dejarlo escrito en el comentario.
- [x] 1.5 `api/tests/eventHandRaiseOrder.test.js` sobre el `io` falso de `eventSocketCohost.test.js`: (a) tres manos en orden dan `handRaisedAt` creciente; (b) repetir `hand_raise {raised:true}` no cambia el sello; (c) bajar la mano deja `null`; (d) promover limpia mano e instante; (e) reconectar conserva ambos; (f) `publicPresence` incluye el campo en el ACK de `join_event_room`.
- [x] 1.6 `docker compose exec api npm test` en verde.

## 2. Cliente: orden y ventana (funciones puras)

- [x] 2.1 Crear `client/lib/participantRow.js` con `participantRanks(entries, { selfIdentity, activity })`: escalones host → co-presentador → mano levantada sin palabra (por `handRaisedAt` asc., sin sello al final del escalón) → con la palabra (actividad de voz por instante de inicio, luego llegada) → resto por llegada. El propio usuario se excluye del ranking.
- [x] 2.2 Añadir en el mismo módulo `rowWindow({ entries, selfIdentity, capacity })` con la regla de D4: hueco del contador, hueco reservado para el propio, escalones garantizados (host, co-presentador y con la palabra) antes que manos y resto, ventana reordenada por rango y propio al final, `more` = ocultos.
- [x] 2.3 Mover a este módulo `participantStateLabel` (hoy en `CompactParticipantRow.js`) y dejar `participantMediaState` donde está, importándolo.
- [x] 2.4 `client/lib/constants.js`: `BROADCAST_ROW_TILE_W_DESKTOP` (64), `BROADCAST_ROW_GAP_PX` (8), `BROADCAST_ROW_COMPACT_MAX` (20), `BROADCAST_ROW_FALLBACK_CAPACITY` (12), `PARTICIPANT_LIST_MAX_ROWS` (100) y, en `LIVE_ROOM_COPY`, los textos del recuadro de resto, del buscador, del aviso de tope y del título de la lista.
- [x] 2.5 Retirar `sortParticipants` de `ParticipantTile.js` una vez no lo use nadie (o dejarlo solo si algún consumidor ajeno al broadcast lo necesita, comprobándolo con `grep`).

## 3. Cliente: el recuadro de resto y la fila de escritorio

- [x] 3.1 `ParticipantTile.js`: fijar el ancho del elemento de escritorio a `w-16` (64 px) manteniendo el cuadrado en 56 px y la etiqueta con su truncado actual.
- [x] 3.2 Nuevo `MoreParticipantsTile` (mismo fichero o `client/components/events/`): cuadrado gris `bg-gray-50 ring-1 ring-gray-300` con `+N` (techo `+999`), «más» en la línea de etiqueta en escritorio, sin etiqueta en compacto, `aria-label` con la frase completa, tamaños `default` y `compact` como el resto.
- [x] 3.3 `AgoraParticipantGrid` (en `AgoraLiveRoom.js`): sustituir `flex-wrap` por una fila `flex-nowrap` con capacidad medida por `ResizeObserver` (descontando el padding real con `getComputedStyle`, fórmula de la banda del teatro) y `BROADCAST_ROW_FALLBACK_CAPACITY` antes de la primera medida.
- [x] 3.4 Calcular en `BroadcastArea` las identidades que se oyen (mismo criterio que `MeetingArea`: `speakingUids` + `hasAudio`, excluida la propia), pasarlas por `useSpeakerActivity` y alimentar `participantRanks`.
- [x] 3.5 Congelar la ventana de la fila de escritorio con `pointerenter`/`pointerleave` (D7): los que lleguen mientras tanto, al final.
- [x] 3.6 Comprobar que la fila de promovidos con vídeo, la banda del teatro y el modo `meeting` no han cambiado.

## 4. Cliente: la lista completa

- [x] 4.1 `client/components/events/ParticipantList.js`: buscador (`normalize('NFD')` + quitar diacríticos, sin distinguir mayúsculas), filas con inicial, nombre, estado es-ES y botones de acción etiquetados; orden de `participantRanks` con el propio al final; tope de `PARTICIPANT_LIST_MAX_ROWS` con su aviso; sin acciones sobre host, co-presentador y `staff`; no se cierra al actuar.
- [x] 4.2 Envoltorio de escritorio: panel en línea bajo la fila (`ring-1 ring-gray-200`, `max-h-64 overflow-y-auto`), abierto y cerrado por el recuadro de resto y con Escape. Sin portal y sin `ConfirmDialog`.
- [x] 4.3 Envoltorio compacto: `LiveRoomSheet` con título «Participantes (N)», hija del contenedor de la sala como el resto de hojas.
- [x] 4.4 Cablear las acciones a `promoteParticipant` / `demoteParticipant` / `setMicrophoneEnabled(false)`, las mismas que ya usa la hoja de un participante.

## 5. Cliente: la fila compacta

- [x] 5.1 `CompactParticipantRow.js`: usar `participantRanks` + `rowWindow` con `capacity = BROADCAST_ROW_COMPACT_MAX + 1`; conservar el botón de mano fuera del scroll, el `py-2`, el `overscroll-x-contain` y la hoja por cuadrado.
- [x] 5.2 Añadir el recuadro de resto al final del scroll y abrir con él la hoja de la lista completa.
- [x] 5.3 Comprobar que tocar un cuadrado sigue abriendo su hoja y no actúa, y que la fila compacta no congela nada.

## 6. Verificación a mano (no hay runner en `client/`)

- [x] 6.1 Escritorio 1280 px, 8 asistentes: una fila, sin recuadro de resto.
- [x] 6.2 Escritorio, 300 asistentes simulados: una sola altura de fila; cuadrados pintados + ocultos = 300; estrechar la ventana reduce cuadrados y sube el número.
- [x] 6.3 Tres manos levantadas en orden A, B, C: aparecen en ese orden; dar la palabra a A hace avanzar a B y C; B baja la mano y C queda el primero.
- [x] 6.4 Dos promovidos, uno hablando: el que habla va antes dentro de su escalón; con pausas de menos de 6 s no se mueve.
- [x] 6.5 20 manos levantadas y 2 con la palabra en una fila de 8 huecos: los 2 con la palabra siguen visibles.
- [x] 6.6 Cuadrado propio: visible siempre, el último antes del contador, y no salta al levantar la mano uno mismo.
- [x] 6.7 Congelado bajo el puntero: con el ratón sobre la fila, levantar la mano desde otra sesión no mueve nada; al salir el puntero, se reordena.
- [x] 6.8 Lista completa en escritorio: buscar «jose» encuentra «José»; dar la palabra deja la lista abierta; con 312 participantes se pintan 100 y sale el aviso.
- [x] 6.9 Móvil 390 px: 20 cuadrados y «+N más» al final del scroll; abre la hoja de la lista; deslizar al final no navega atrás.
- [x] 6.10 Móvil en horizontal y modo teatro: la banda del teatro y los controles superpuestos siguen igual.
- [x] 6.11 Modo `meeting` (escritorio y compacto) y un evento LiveKit: sin cambios visibles.
- [x] 6.12 Co-presentador (admin en un broadcast): su cuadrado va detrás del host, sin acciones, y la lista no le ofrece ninguna.
- [x] 6.13 Cliente nuevo contra api sin `handRaisedAt` (revertir 1.2 en local): las manos ordenan por llegada y nada falla.

- [x] 6.14 Corregido el recorte de las insignias detectado en preproducción (`py-1` en la fila de escritorio), comprobado con medidas en navegador: recorte 4,0 → 0,0 px, posición y capacidad sin cambios.

## 7. Cierre

- [x] 7.1 `npm run lint` en `client/` y build de producción (`docker compose exec -e NODE_ENV=production client npm run build`).
- [x] 7.2 Actualizar `CLAUDE.md` con la sección de la fila de participantes de broadcast: la regla de «quien tiene la palabra nunca se oculta», el porqué del `handRaisedAt` en servidor, el porqué de reordenar el DOM aquí y no en `meeting`, y el punto ciego de las pruebas.
- [x] 7.3 `openspec/changes/broadcast-participant-row-scaling` listo para `/opsx:archive`.
