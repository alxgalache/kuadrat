---
paths:
  - "api/utils/stageCovers.js"
  - "client/lib/stageCovers.js"
  - "client/components/events/{StageCoverMenu,StageCoverOptions}.js"
  - "client/public/cortinillas/**"
  - "api/tests/eventSocketStageCover.test.js"
---

## Portadas de la escena de un stream (`agora-stage-covers`)

Tres imágenes fijas («Inicio», «Intermedio», «Final») que tapan la escena entera de un evento Agora `broadcast`: antes de empezar, en un descanso y al terminar. Las ponen el host o el co-presentador desde el menú «Portadas», junto a «Efectos», y el inicio del evento pone «Inicio». Guía para el operador: `docs/eventos-portadas.md`.

* **Una superposición en cada navegador, no una pista publicada.**
  * La portada es un estado de la sala (`eventStageCovers` en `eventSocket.js`, con el ciclo de vida de la disposición de cámaras: mensaje `stage_cover`, ACK de unión y borrado al terminar). Cada navegador la pinta encima de la escena.
  * Publicar un `<canvas>` exigiría al host conectado, cuando «Inicio» debe verse antes de que llegue, y facturaría una imagen fija como vídeo HD por espectador.
  * Un reinicio de la API pierde la portada, como la pizarra: el host la vuelve a poner.
* **Solo en `broadcast` de Agora en directo** (`supportsStageCovers`, uno por lado): `meeting` es una rejilla con grabación individual, LiveKit no tiene escena y un pase de vídeo reproduce un fichero. El servidor ignora `stage_cover` fuera de ahí, y de quien no sea host o co-presentador.
* **`BroadcastStage` la pinta como último hijo**, `z-[15]`: encima de los recuadros (`z-10`), debajo del botón del teatro (`z-20`), en `object-contain` sobre blanco, que es el fondo de las portadas. No desmonta ni mueve ninguna capa: la pizarra sigue siendo el primer hijo y ningún `AgoraVideo` se vuelve a montar. La consola del host la pinta **sobre** su vídeo, no en su lugar, por la misma razón.
* **Elegir una portada solo la emite; vaciar la escena es la reacción al eco** (`stageCoverSignal` de `useEventRoomSocket`, en `useHostMediaControls`).
  * Cuando la pone el co-presentador, es el navegador del host el que tiene que apagar su cámara, su pantalla y la pizarra. Un solo camino de código cubre los dos casos.
  * La señal **solo** cambia con el evento, nunca con el ACK: recargar con una portada puesta no apaga nada, porque al unirse no se publica nada.
  * **Los micrófonos también se apagan (decisión del operador).** Olvidarlo abierto en un intermedio emite y graba una conversación privada sin que el host lo note. Volver a abrirlo para hablar sobre «Final» cuesta un clic, y encender el micrófono **no** quita la portada.
* **Una acción de vídeo quita la portada, y solo si sale bien**: encender la cámara, empezar a compartir pantalla o activar la pizarra emite `stage_cover { cover: null }` después. Una cámara que no arranca no deja la escena vacía y sin portada. La cámara es RTC y el servidor no la ve, así que la regla vive en el cliente de quien actúa, en `useHostMediaControls` (la pizarra, en el `handleWhiteboardToggle` de la sala).
* **Excepción razonada en el co-presentador.** Tiene «Portadas», aunque la pizarra, los efectos y la calidad siguen siendo solo del host: la portada es un único valor en el servidor y gana el último, así que no hay estados incompatibles.
* **Grabación** (detalle en `.claude/rules/agora/recording.md`):
  * con portada, `mixLayoutFor` usa el diseño 3 con 17 regiones transparentes de lienzo completo y la portada como `backgroundImage`, de modo que nadie se ve delante y el audio sigue en la mezcla;
  * todo diseño lleva `backgroundImage` explícito, aunque sea el negro neutro;
  * lo aplicado se guarda en `applied_cover`, una columna aparte porque el `CHECK` de `applied_layout` no se amplía en producción;
  * el inicio fija «Inicio» antes de reconciliar, así que la primera tarea ya arranca con ella.
* **Las imágenes son JPG versionados en `client/public/cortinillas/`**, servidos desde `CLIENT_URL`. El proxy de Next no toca `*.jpg`, y así Agora los descarga también en preproducción. Agora documenta JPG y BMP, no PNG.
  * Las fuentes PNG están en `docs/cortinillas/`.
  * **Un fichero publicado nunca se sobrescribe**: un diseño nuevo se publica como `-v2` y se cambian a la vez los dos catálogos, `api/utils/stageCovers.js` y `client/lib/stageCovers.js`. Ningún test puede cruzarlos, porque el contenedor `api` no ve el cliente.
* **Punto ciego conocido:** `client/` no tiene runner. La escena, el menú, el vaciado, la consola y, sobre todo, **la geometría real de la grabación** se verifican a mano (`tasks.md` §8): la primera grabación en preproducción confirma las regiones transparentes. Si fallan, el respaldo es el diseño flotante con el mismo fondo (Decisión 3 del diseño). La API está cubierta por `eventSocketStageCover.test.js`, `agoraRecording.test.js` y `eventAutoStart.test.js`.
