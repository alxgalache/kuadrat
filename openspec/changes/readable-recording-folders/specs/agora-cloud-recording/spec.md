## MODIFIED Requirements

### Requirement: Almacenamiento de las grabaciones

Toda tarea SHALL escribir en el bucket configurado (`vendor: 1`, `region` según la tabla de regiones de Agora para `AGORA_RECORDING_S3_REGION`) bajo `fileNamePrefix: ['eventos', <carpeta del evento>, <carpeta de la parte>]`, construido por `buildFileNamePrefix(event, attempt)` en `api/services/agoraRecordingService.js`. Cada elemento SHALL cumplir `^[A-Za-z0-9]+$` y el prefijo completo, con separadores, SHALL medir como máximo 128 caracteres. El bucket y el prefijo resultante SHALL guardarse en la fila de la tarea (`s3_bucket`, `s3_prefix`).

La **carpeta del evento** SHALL ser legible por una persona y SHALL componerse solo de letras y dígitos:

- **Fecha:** la fecha del evento como `AAAAMMDD`. SHALL obtenerse con `eventDateStamp(event)` de `api/utils/eventTime.js`, que la lee en hora de `Europe/Madrid`, y nunca con `new Date()` sobre `event_datetime`. Si la fecha no se puede leer, SHALL omitirse.
- **Palabras del slug:** cada segmento del slug del evento (separado por guiones), sin ningún carácter fuera de `[A-Za-z0-9]`, con la primera letra en mayúscula y en el mismo orden.
- **Longitud:** la carpeta SHALL medir como máximo 64 caracteres. Si no cabe, se acortan las palabras anteriores al último segmento del slug, que es su sufijo aleatorio y SHALL conservarse entero.
- **Alternativa:** si el slug no deja ningún segmento, la carpeta del evento SHALL ser el id del evento sin guiones.

La **carpeta de la parte** SHALL ser `parte` seguido del número de intento más uno, con dos cifras (`parte01` … `parte10`): el mismo número que el panel de admin muestra como «Parte N».

Construir el nombre NO SHALL lanzar un error ni impedir el arranque de una grabación. El nombre solo afecta a la carpeta: la aplicación lee cada parte por el `s3_prefix` guardado en su fila y nunca reconstruye la ruta. Por eso una tarea creada con un formato anterior SHALL seguir listándose y descargándose desde su `s3_prefix` original.

Una región sin código de Agora conocido SHALL hacer fallar el arranque de la api cuando la grabación esté configurada.

Cada entorno (producción y preproducción) SHALL tener su propio bucket y su propio usuario IAM. El bucket SHALL tener Block Public Access activado y el versionado desactivado.

#### Scenario: Carpeta legible
- **WHEN** se construye el `storageConfig` de la primera tarea de un evento con slug `conversacion-con-maria-garcia-1f3a9c2e` y `event_datetime` `2026-10-17T19:00`
- **THEN** `fileNamePrefix` SHALL ser `['eventos', '20261017ConversacionConMariaGarcia1f3a9c2e', 'parte01']`
- **AND** el `s3_prefix` guardado en la fila SHALL ser `eventos/20261017ConversacionConMariaGarcia1f3a9c2e/parte01/`

#### Scenario: Ningún símbolo en el prefijo
- **WHEN** se construye el `storageConfig` de un evento cuyo id es un UUID con guiones y cuyo slug lleva guiones
- **THEN** ningún elemento de `fileNamePrefix` SHALL contener guiones, guiones bajos ni ningún otro carácter fuera de `[A-Za-z0-9]`

#### Scenario: Reanudación
- **WHEN** un evento tiene dos tareas por una interrupción
- **THEN** cada una SHALL tener su propia carpeta
- **AND** las dos SHALL compartir la carpeta del evento, con `parte01` y `parte02`

#### Scenario: Décima parte
- **WHEN** se construye el prefijo del intento 9, el último permitido
- **THEN** la carpeta de la parte SHALL ser `parte10`

#### Scenario: Título largo
- **WHEN** el slug del evento tiene más letras de las que caben en 64 caracteres junto con la fecha
- **THEN** la carpeta del evento SHALL medir exactamente 64 caracteres
- **AND** SHALL empezar por la fecha y terminar por el sufijo del slug, entero

#### Scenario: Slug sin letras ni dígitos
- **WHEN** el slug del evento no deja ningún segmento tras quitar los caracteres no admitidos
- **THEN** la carpeta del evento SHALL ser el id del evento sin guiones
- **AND** la grabación SHALL arrancar igual

#### Scenario: Fecha ilegible
- **WHEN** `event_datetime` no se puede leer
- **THEN** la carpeta del evento SHALL ser solo las palabras del slug
- **AND** la grabación SHALL arrancar igual

#### Scenario: Tarea con el formato anterior
- **WHEN** el panel de admin lista un evento cuya tarea se guardó con `s3_prefix` `eventos/<id del evento>/<id de la tarea>/`
- **THEN** SHALL listar y firmar las descargas de esa carpeta igual que antes del cambio
