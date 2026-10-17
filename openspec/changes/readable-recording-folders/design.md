## Context

**Cómo se forma hoy la ruta.** `startTask` (`api/services/agoraRecordingService.js`) genera el id de la tarea y llama a `buildFileNamePrefix(event.id, id)`. Esta función devuelve `['eventos', <id del evento sin guiones>, <id de la tarea sin guiones>]`. Agora recibe el array en `storageConfig.fileNamePrefix` y escribe ahí los ficheros, y la fila guarda la ruta unida en `event_recordings.s3_prefix`. Nada vuelve a construirla:

- el panel lista con `s3_prefix`;
- la descarga firma `s3_prefix + fichero`;
- el comando AWS CLI del panel parte de `bucket + prefix`;
- la regla de retención mira solo `eventos/`.

**La restricción de Agora.** Cada elemento de `fileNamePrefix` admite solo `a-z`, `A-Z` y `0-9`, y el prefijo entero, con barras, no puede pasar de 128 caracteres. La documentación prohíbe expresamente barras, guiones bajos y paréntesis. Por eso los UUID ya se usan sin guiones.

**Los datos disponibles.**

- `events.slug` es `NOT NULL UNIQUE` y lo produce siempre `generateSlug` (`api/services/eventService.js`): `slugify(título, { lower, strict })` + `-` + 8 hex aleatorios.
- El slug no cambia una vez publicado el evento (`event-slug-stability`), y `startEvent` solo arranca eventos `scheduled`. Por eso el slug ya está fijo en cualquier evento que se graba.
- `events.event_datetime` es hora de pared de Madrid sin zona. Solo `api/utils/eventTime.js` la interpreta (invariante de `CLAUDE.md`).
- Un evento tiene como mucho 10 tareas (`attempt` 0…9), y el índice único `(event_id, attempt)` impide repetir un intento.

**Quién lo usa.** El operador, en la consola de S3 o con AWS CLI, para descargar o borrar a mano (§9 y §11 de `docs/grabaciones-eventos.md`). Por la retención de 30 días, el bucket nunca contiene más de un mes de eventos.

## Goals / Non-Goals

**Goals:**

- Que el nombre de cada carpeta diga, sin abrir la base de datos, de qué evento es, de qué día y qué parte.
- Que las carpetas salgan en orden cronológico en la consola de S3.
- Que todas las partes de un evento queden bajo la misma carpeta de evento.
- Que el nombre nunca pueda costar una grabación: ni un 400 de Agora ni una excepción.

**Non-Goals:** los de la propuesta: no se renombra lo existente, no hay usuarios en la ruta, los ficheros de Agora mantienen su nombre y el panel no cambia.

## Decisions

### 1. Sin separadores: la fecha en dígitos y el slug en CamelCase

**Decisión:** la carpeta del evento es `<AAAAMMDD><Palabras del slug en CamelCase>`, por ejemplo `20261017ConversacionConMariaGarcia1f3a9c2e`.

Al no poder usar `_` ni `-`, el corte entre partes lo marcan los cambios de tipo de carácter:

- de los dígitos de la fecha a la mayúscula de la primera palabra;
- de una palabra a la siguiente, por la mayúscula;
- de las palabras al sufijo, que también lleva su primera letra en mayúscula o empieza por un dígito.

**Alternativas descartadas:**

- **`<id>_<slug>`** (la idea inicial): Agora la rechaza con un 400 en el `start` y el evento se queda sin grabar.
- **`<id><slug>` sin separador:** el id es lo primero que se lee y no dice nada. Además, el orden de las carpetas sigue siendo aleatorio.
- **El slug en minúsculas y sin guiones** (`conversacionconmariagarcia1f3a9c2e`): las palabras se funden y cuesta leerlas.
- **Una palabra como separador** (`…GarciaIdab12…`, `…X…`): añade ruido sin ganar claridad frente a CamelCase.

### 2. La fecha del evento, no la de la grabación

**Decisión:** la fecha es la de `event_datetime`, calculada con `eventDateStamp(event)`, una función nueva de `eventTime.js`. Pasa `eventStartUtc(event)` por el formateador de partes en `Europe/Madrid` que ya existe en ese módulo, así que también lee bien un valor con zona. Si `event_datetime` es ilegible, devuelve `null`.

- **Distingue eventos con el mismo título.** Un taller semanal deja carpetas que solo se diferencian por la fecha y el sufijo, y la fecha es lo que el operador reconoce.
- **Es la fecha que el admin ve** en la lista de eventos y en la ficha pública.
- **Coincide con la de la grabación** en la práctica: el inicio automático arranca el evento a su hora.

**Alternativa descartada:** la fecha de la primera tarea, en hora de Madrid. Separaría las partes de un evento de las 23:30 si la primera falla y la segunda arranca pasada la medianoche, y obliga a buscar la primera tarea antes de nombrar la siguiente. La ventaja que tenía, ser inmune a un cambio de fecha a mitad del directo, cubre un caso que no se da (riesgos, abajo).

### 3. El slug, no el título, como identidad del evento

**Decisión:** las palabras salen de `events.slug`, que ya es ASCII, único, fijo antes de que se pueda grabar, y termina en un sufijo aleatorio.

- **Título:** lleva tildes, eñes, espacios y símbolos que habría que limpiar con otra regla, puede cambiar después de publicar el evento y no es único.
- **Unicidad:** que dos eventos compartan carpeta exige el mismo slug. Mientras existan los dos es imposible (`UNIQUE`). Con un evento borrado haría falta el mismo título, los mismos 32 bits aleatorios y el mismo día. Por eso el id del evento no hace falta en el nombre y solo se usa como alternativa (decisión 6).
- **Localizar el evento:** el sufijo del nombre sirve para buscarlo en la base de datos (`slug LIKE '%-1f3a9c2e'`) o en la URL `/live/<slug>`.

### 4. `parteNN` en lugar del id de la tarea

**Decisión:** la carpeta de la parte es `parte` + `String(attempt + 1).padStart(2, '0')`.

- Es la palabra y el número que ya usan el panel («Parte 1») y la guía (`./grabacion-parte-1`).
- Es única dentro del evento por el índice `(event_id, attempt)`: si dos procesos intentan crear el mismo intento, el `INSERT` del segundo falla antes de llegar a Agora.
- Dos cifras porque el tope son 10 partes, y así `parte10` va detrás de `parte09` en el orden por nombre.
- Una tarea que falla al arrancar (`failed`) también consume su número. Si su carpeta no tiene ficheros, simplemente no aparece en S3, porque S3 no tiene carpetas vacías.

### 5. Longitud: 64 caracteres para la carpeta del evento, con el sufijo siempre entero

**Decisión:** la carpeta del evento se forma así:

1. La fecha: 8 caracteres, o ninguno si no se puede leer.
2. Las palabras anteriores al último segmento, cortadas para que todo quepa en 64 caracteres.
3. El último segmento, entero.
4. Si el resultado aún pasa de 64 (un slug sin guiones demasiado largo, que `generateSlug` nunca produce), se corta a 64.

El prefijo máximo es `eventos/` (8) + 64 + `/` + `parte10` (7) + `/` = 81 caracteres, lejos del límite de 128 de Agora.

64 es un tope de legibilidad, no del límite de Agora. Quedan 48 caracteres para las palabras, suficientes para casi cualquier título. El corte puede caer a mitad de palabra. Es intencionado, porque recortar por palabras completas añade lógica para un caso cosmético.

### 6. El nombre nunca impide grabar

`buildFileNamePrefix` se llama en `startTask` antes del `try`, así que una excepción ahí saldría del reconciliador sin dejar fila ni alerta. Por eso la construcción del nombre no lanza:

- **Slug sin segmentos o nombre no válido:** si el slug no deja ningún segmento o el resultado no cumple `^[A-Za-z0-9]{1,64}$`, la carpeta del evento es el id sin guiones, como hoy.
- **Comprobaciones finales:** las validaciones que ya existen (cada elemento alfanumérico y como mucho 128 caracteres) se mantienen como red de seguridad, pero con la alternativa nunca llegan a fallar.

### 7. Dónde vive cada pieza

- **El nombre**, en `agoraRecordingService.js`:
  - `buildFileNamePrefix(event, attempt)`, con su ayudante `eventFolderFor(event)`, sigue exportada para los tests;
  - `loadEvent` añade `slug, event_datetime` a su `SELECT`;
  - `startTask` pasa `attempt` en lugar del id de la tarea.

  El id de la tarea sigue generándose igual: es la clave de la fila y la referencia del panel y de las alertas.
- **La fecha**, en `eventTime.js`, el único módulo que interpreta `event_datetime`. Así no aparece otra lectura de esa columna en línea, que es lo que prohíbe el invariante.

### 8. Sin migración de lo existente

Las filas antiguas conservan su `s3_prefix`. Mover sus objetos exigiría:

- `CopyObject` y `DeleteObject`, permisos que el rol de la instancia no tiene a propósito: solo lee, y la aplicación no borra grabaciones;
- reescribir cada `s3_prefix`;
- y aun así se perdería el `Last-Modified` original de los objetos, que es la fecha que usa la regla de retención.

Las carpetas antiguas desaparecen solas en 30 días como mucho.

## Risks / Trade-offs

- **[Agora no acepta las mayúsculas en la práctica]** → La documentación de `start`, `update` y `acquire` admite `A-Z` explícitamente. La primera grabación de preproducción tras el despliegue lo confirma; si fallara, la alerta `start_failed` llega por los tres canales con el código de Agora.
- **[Las partes de un evento quedan en dos carpetas si el admin cambia su fecha a mitad del directo]** → El panel no se ve afectado, porque lee cada parte por su `s3_prefix`, y la retención tampoco, porque todo sigue bajo `eventos/`. Se acepta: es un caso que no se da, y evitarlo exigiría leer la carpeta de la primera tarea.
- **[Convivencia de dos formatos durante 30 días]** → La guía lo explica: una carpeta de 32 caracteres hexadecimales es del formato anterior. El panel funciona con los dos.
- **[Un evento en directo durante el despliegue]** → Su parte en curso sigue en la carpeta antigua, y una reanudación posterior irá a la nueva. Las dos aparecen en el panel como partes del mismo evento.
- **[Corte a mitad de palabra en títulos largos]** → Solo afecta a la lectura. La fecha y el sufijo siguen identificando el evento.
- **[El título queda a la vista en el nombre de la carpeta]** → El bucket es privado (Block Public Access) y el título ya es público en la ficha del evento.

## Migration Plan

1. Desplegar la api (`./deploy/deploy.sh`). No hay que cambiar el esquema, el IAM ni la regla de ciclo de vida: la regla sigue en `eventos/` y la política de Agora cubre `140d-event-recordings-pro/*`.
2. Comprobar en preproducción, con un evento de prueba grabado, que la carpeta aparece con el formato nuevo y que el panel lista y descarga la parte.
3. **Vuelta atrás:** revertir el código. Las filas creadas con el formato nuevo siguen funcionando, porque cada una guarda su `s3_prefix`.

## Open Questions

Ninguna técnica. El formato del nombre es una preferencia del operador: si se prefiere otro orden (slug antes que fecha) u otro tope de longitud, solo cambia la decisión 1 o la 5, antes de implementar.
