## Why

Las grabaciones de Agora se guardan en S3 bajo `eventos/<id del evento>/<id de la tarea>/`, dos UUID sin guiones. En la consola de S3 no se sabe qué evento es cada carpeta sin consultar la base de datos, y el orden alfabético de los UUID es aleatorio.

Comprobado en el código (`buildFileNamePrefix` en `api/services/agoraRecordingService.js`), la ruta del ejemplo se compone así:

- `148cee81ceac4375a04ddded5fa0d84c` es el **id del evento** (`events.id`), no el de un usuario.
- `530a1c9291c74d0eb45bc4e3ab6ced57` es el **id de la tarea de grabación** (`event_recordings.id`). Es lo que el panel de admin llama «Parte»: un evento tiene una parte por cada arranque del grabador. Si el grabador muere, se reanuda en una parte nueva.
- Ninguna carpeta lleva el id de un usuario.

La propuesta de añadir `_<slug>` choca con una restricción de Agora: cada elemento de `fileNamePrefix` solo admite `a-z`, `A-Z` y `0-9`. La documentación prohíbe expresamente barras, guiones bajos, paréntesis y cualquier otro símbolo. Un guion bajo o los guiones del slug darían un 400 en el `start` y el evento se quedaría sin grabar. El nombre legible tiene que construirse solo con letras y dígitos.

## What Changes

- **Carpeta del evento legible.** Pasa a ser `<AAAAMMDD><slug en CamelCase>`. La fecha es la del evento y las palabras del slug van con su inicial en mayúscula. El slug conserva su sufijo aleatorio final. Ejemplo para «Conversación con María García» el 17/10/2026, con slug `conversacion-con-maria-garcia-1f3a9c2e`:

  ```
  eventos/20261017ConversacionConMariaGarcia1f3a9c2e/parte01/
  ```

  - **Fecha delante:** la consola de S3 ordena las carpetas por nombre, así que salen en orden cronológico. Además, «Buscar por prefijo» funciona con `202610`.
  - **El slug identifica el evento:** es único en la base de datos y no cambia una vez publicado el evento, y solo se graba un evento iniciado. Su sufijo distingue dos eventos con el mismo título el mismo día.
  - **Longitud acotada:** la carpeta del evento mide 64 caracteres como máximo. Si el título es largo se acortan sus palabras, nunca el sufijo.
- **Carpeta de la parte legible.** Pasa a ser `parte01`, `parte02`… hasta `parte10`, el mismo número que muestra el panel («Parte 1»). Lleva dos cifras para que `parte10` no salga antes que `parte02`. Es única porque la base de datos ya impide dos tareas con el mismo intento en un evento.
- **El nombre nunca impide grabar.** Si un slug no deja ninguna letra ni dígito, la carpeta del evento vuelve a ser su id sin guiones. Si la fecha no se puede leer, se omite.
- **Las grabaciones existentes no se tocan.** Cada fila guarda su `s3_prefix`, así que el panel sigue listando y descargando las carpetas antiguas igual que hoy. Estas carpetas caducan solas por la regla de 30 días del bucket.
- **Guía y regla actualizadas.** `docs/grabaciones-eventos.md` explica cómo leer el nombre de una carpeta y actualiza los comandos de ejemplo. `.claude/rules/agora/recording.md` recoge el formato nuevo y por qué no lleva separadores.

Capas afectadas: **solo backend** (`api/services/agoraRecordingService.js`, `api/utils/eventTime.js` y sus tests). El cliente no cambia: el panel muestra la ruta tal como la devuelve la API. **Sin cambios de esquema** (`s3_prefix` ya guarda la ruta completa por fila), sin endpoints nuevos y sin dependencias nuevas. La regla de ciclo de vida sigue cubriendo `eventos/`, y el usuario IAM de Agora conserva `s3:PutObject` sobre el bucket entero.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `agora-cloud-recording`: el requisito «Almacenamiento de las grabaciones» cambia la composición de `fileNamePrefix`. Antes era `['eventos', <eventId sin guiones>, <recordingId sin guiones>]`; ahora es `['eventos', <fecha + slug en CamelCase>, 'parte<NN>']`, con la longitud acotada y el id del evento como alternativa.

## Impact

- `api/services/agoraRecordingService.js`:
  - `buildFileNamePrefix` recibe el evento y el número de intento en lugar de dos ids;
  - `loadEvent` añade `slug` y `event_datetime`;
  - `startTask` pasa el intento.
- `api/utils/eventTime.js`: una función nueva que devuelve la fecha de pared del evento como `AAAAMMDD`, sin convertirla a un instante. Es el único módulo que interpreta `event_datetime`.
- `api/tests/agoraRecording.test.js`: los tests del prefijo y del reconciliador comprueban el formato nuevo. `api/tests/eventRecordingAdmin.test.js` no lo necesita, porque sus filas de prueba escriben su propio `s3_prefix`.
- `docs/grabaciones-eventos.md` (§9 y §11) y `.claude/rules/agora/recording.md`.
- Operación: tras el despliegue convivirán carpetas de los dos formatos en el bucket hasta que caduquen las antiguas, como mucho 30 días.

## Non-goals

- **Renombrar las carpetas ya existentes.** S3 no renombra: habría que copiar y borrar. El rol de la instancia solo lee, y la aplicación no borra grabaciones por diseño. En 30 días desaparecen solas.
- **Añadir el host u otro usuario al nombre.** El título del evento ya suele nombrar al ponente, y la ruta no contiene ningún id de usuario.
- **Cambiar los nombres de los ficheros** que escribe Agora dentro de cada parte (`<sid>_<canal>…`): no son configurables.
- **Más niveles de carpetas** (año, mes). Con 30 días de retención, el bucket solo guarda un mes de eventos y un nivel basta.
- **Cambios en el panel de admin.** Ya muestra la ruta de cada parte y el comando de descarga a partir de `s3_prefix`.
