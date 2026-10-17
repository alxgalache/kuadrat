## 1. Fecha del evento (`api/utils/eventTime.js`; módulo compartido: solo se añade una función)

- [x] 1.1 Añadir y exportar `eventDateStamp(event)`. Devuelve la fecha de `eventStartUtc(event)` en `EVENT_TIME_ZONE` como `AAAAMMDD`, con `partsFormatter.formatToParts`, o `null` si la fecha es ilegible. Nunca lanza. El comentario explica que es la fecha de pared del evento y que la usa la carpeta de las grabaciones.
- [x] 1.2 Añadir casos a `api/tests/eventTime.test.js`:
  - un valor sin zona en los dos formatos guardados (`2026-10-17T19:00` y `2026-10-17 19:00:00`), que da `20261017`;
  - un valor con `Z` que en Madrid ya es el día siguiente (`2026-10-17T23:30:00Z`), que da `20261018`;
  - un valor ilegible y uno ausente, que dan `null`;
  - el mismo resultado con otra `TZ` del proceso.

## 2. Nombre de las carpetas (`api/services/agoraRecordingService.js`)

- [x] 2.1 Añadir las constantes `EVENT_FOLDER_MAX = 64` y `RECORDING_PART_PREFIX = 'parte'`, junto a `RECORDING_PREFIX_ROOT`, con un comentario: 64 es un tope de legibilidad, no el límite de 128 de Agora.
- [x] 2.2 Añadir `eventFolderFor(event)`, que forma la carpeta del evento:
  1. Parte el slug por guiones, deja en cada segmento solo `[A-Za-z0-9]`, descarta los vacíos y pone en mayúscula la primera letra de cada uno.
  2. Pone delante `eventDateStamp(event)`, o nada si es `null`.
  3. Corta las palabras anteriores al último segmento para que el total quepa en 64, conserva el último segmento entero y, al final, corta el resultado a 64.

  Si el resultado no cumple `^[A-Za-z0-9]{1,64}$`, también con el slug ausente o sin segmentos, devuelve `alphanumeric(event.id)`.
- [x] 2.3 Añadir `partFolderFor(attempt)`, que devuelve `parte` + `String(attempt + 1).padStart(2, '0')`.
- [x] 2.4 Cambiar `buildFileNamePrefix(eventId, recordingId)` por `buildFileNamePrefix(event, attempt)`, que devuelve `['eventos', eventFolderFor(event), partFolderFor(attempt)]`.
  - Las dos validaciones actuales (cada elemento alfanumérico y como mucho 128 caracteres) se mantienen como red de seguridad.
  - Actualizar su comentario con el formato, el ejemplo y por qué no hay separadores: Agora prohíbe `_`, `-` y cualquier símbolo.
- [x] 2.5 `loadEvent`: añadir `slug, event_datetime` al `SELECT`.
- [x] 2.6 `startTask`: llamar a `buildFileNamePrefix(event, attempt)`. El id de la tarea (`randomUUID()`) se sigue generando como clave de la fila. Exportar `eventFolderFor` y `partFolderFor` para los tests.
- [x] 2.7 Comprobar con `grep` que nada más llama a `buildFileNamePrefix` con la firma antigua ni reconstruye la ruta. El panel y la descarga leen `s3_prefix`.

## 3. Tests

- [x] 3.1 `api/tests/agoraRecording.test.js`: el `createEvent` de los fixtures acepta `slug` y `event_datetime` en `overrides`. Su slug por defecto pasa a tener la forma de `generateSlug`: `charla-grabada-<8 hex>`.
- [x] 3.2 Sustituir el test «fileNamePrefix drops the UUID hyphens…» por uno por escenario de la spec:
  - carpeta legible: el ejemplo exacto, con su `s3PrefixFor`;
  - ningún símbolo, con slug y UUID con guiones;
  - `parte10` para el intento 9;
  - título largo: exactamente 64 caracteres, empieza por la fecha y acaba en el sufijo entero;
  - slug sin letras ni dígitos: da el id sin guiones;
  - fecha ilegible: da solo las palabras;
  - slug `null`: no lanza y da el id.
- [x] 3.3 Tests del reconciliador:
  - el `toMatch` del primer arranque pasa a `^eventos\/20261001CharlaGrabada[0-9a-f]{8}\/parte01\/$`;
  - en «a recorder that died…», las dos tareas comparten la carpeta del evento y terminan en `parte01/` y `parte02/`, además de ser distintas.
- [x] 3.4 `api/tests/eventRecordingAdmin.test.js`: sus filas de prueba guardan un `s3_prefix` del formato anterior (`eventos/<id>/<id>/`). Dejarlas así y añadir un comentario: cubren el escenario «Tarea con el formato anterior» (listar y firmar la descarga desde el `s3_prefix` guardado).
- [x] 3.5 Ejecutar la suite completa desde `api/` (`npm test` o `docker compose exec api npm test`), con `testEnvironmentIsolation.test.js` y `dbDump.test.js` en verde.

## 4. Documentación y regla

- [x] 4.1 `docs/grabaciones-eventos.md`:
  - en §9, una subsección «Cómo se llaman las carpetas», con el formato, el ejemplo y cómo encontrar el evento por el sufijo del slug (`/live/<slug>` o `slug LIKE '%-<sufijo>'`). También explica que una carpeta de 32 caracteres hexadecimales es del formato anterior y que esas carpetas desaparecen en 30 días como mucho;
  - en §9 y §11, actualizar los comandos `aws s3 sync` y `aws s3 rm` de ejemplo con `eventos/<AAAAMMDD><Evento>/parteNN/`.
- [x] 4.2 `.claude/rules/agora/recording.md`: sustituir el punto «`fileNamePrefix` sólo admite…» por el formato nuevo y su porqué:
  - sin separadores, porque Agora prohíbe `_` y `-`;
  - el slug como identidad (único, fijo antes de poder grabar, con sufijo aleatorio);
  - la fecha leída con `eventDateStamp`;
  - `parteNN` como intento + 1;
  - el tope de 64;
  - el id como alternativa y por qué el nombre nunca lanza;
  - por qué no se migra lo existente (el rol solo lee y una copia reiniciaría el plazo de 30 días).
- [x] 4.3 `.claude/rules/events/confirmation-calendar-links.md`: en el punto sobre `eventTime.js`, añadir que `eventDateStamp` también da el nombre de la carpeta de las grabaciones, para que un cambio en el módulo lo tenga en cuenta.
- [x] 4.4 Ejecutar `node scripts/check-claude-rules.mjs` y corregir lo que señale.

## 5. Verificación en preproducción (manual)

- [ ] 5.1 Tras desplegar en preproducción, grabar un evento Agora `broadcast` de prueba. Comprobar tres cosas:
  - en la consola de S3, la carpeta aparece como `eventos/<AAAAMMDD><Evento>/parte01/`;
  - Agora la acepta, sin alerta `start_failed`;
  - el panel de admin lista la parte y descarga su MP4.
