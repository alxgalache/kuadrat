## Why

Los eventos en directo de 140d (charlas, masterclasses, entrevistas, reuniones) desaparecen al terminar: no queda ni el vídeo ni el audio para consultarlos después ni para reutilizarlos como contenido. Agora ofrece de fábrica un servicio de grabación en la nube (**Cloud Recording**) que se gobierna por REST desde el servidor, no necesita infraestructura de codificación propia y escribe directamente en un bucket S3 nuestro. Con la decisión de que la pizarra y el chat no interesan —sólo audio y vídeo—, ese servicio cubre el 100 % del requisito en los dos modos de interacción sin salir de Agora.

## What Changes

- **Nueva casilla por evento «Grabar el evento (audio y vídeo)»** (`events.recording_enabled`, `DEFAULT 0` sin backfill), visible sólo con `provider='agora'` y `format='live'`, en los dos `interaction_mode`. El modo de grabación no se elige: lo decide el `interaction_mode`.
- **`broadcast` → modo `mix` (composite)**: un solo vídeo con **todo lo que se publica en escena** —cámara del host, pantalla compartida (uid 2), co-presentador y promovidos con cámara— y el audio de todos mezclado. Salida MP4 + HLS a 1920×1080, audio 48 kHz mono 128 kbps. Diseño adaptativo que pasa a vertical con la **pantalla compartida en grande** mientras el host la comparte.
- **`meeting` → modo `individual`**: una pista de audio y otra de vídeo **por cada participante (uid)**, incluidos los que entran tarde. Como el cliente publica VP8, la salida por uid es índice MPD + segmentos WebM (Agora no produce MP4 en este modo); la conversión a MP4, si algún día se necesita, se hace fuera de la aplicación con el script de Agora en una máquina x86.
- **Almacenamiento en un bucket S3 dedicado por entorno** (región `eu-west-1`; producción y preproducción, cada uno con su bucket y su llave, compartiendo el mismo proyecto de Agora), privado. Agora escribe con un usuario IAM de **sólo `s3:PutObject`**; la aplicación lee con el rol de la instancia.
- **Conservación de 30 días naturales**, aplicada por una regla de ciclo de vida del propio bucket (como `daily/` en las copias de la base de datos): la aplicación nunca borra. En producción, la api comprueba al arrancar que la regla existe y avisa por los tres canales si falta o es más larga. El panel de admin muestra hasta qué fecha está disponible cada grabación: **para reutilizarla hay que descargarla antes**.
- **Un reconciliador en el servidor** (nuevo scheduler, cada 30 s) es la autoridad del ciclo de vida: arranca la grabación cuando el evento pasa a `active`, la detiene cuando termina, la reanuda si se interrumpe, ajusta el diseño cuando cambia la pantalla compartida y la corta a los **180 minutos**. Las transiciones de inicio y fin del evento lo invocan al momento para no esperar al siguiente ciclo.
- **Alertas por tres canales** (log + Sentry + email a `BUSINESS_EMAIL`) si una grabación no arranca, se interrumpe o se abandona tras agotar los reintentos.
- **Sección «Grabaciones» en la ficha de admin del evento**: estado de cada tarea, descarga de los MP4 del stream con URL prefirmada de vida corta, y en reuniones la lista de participantes (uid → nombre) con el comando exacto para descargar sus pistas.
- **Aviso RGPD**: insignia «Grabando» en todas las presentaciones de la sala mientras el evento esté activo, aviso en la ficha y en el modal de acceso antes de entrar (con el plazo de 30 días), apartado nuevo en la política de privacidad (qué se graba, finalidad, base legal, encargados, conservación de 30 días naturales y derechos) y mención en las normas de los eventos.
- **Corrección de paso en el cliente**: el host vuelve a emitir `screen_share` tras cada (re)unión a la sala, para que la presencia —y con ella el diseño de la grabación— sobreviva a un reinicio de la api.

## Non-goals

- Grabar la pizarra o el chat (decisión explícita: sólo audio y vídeo). Por eso se descarta el modo de grabación de página web.
- Grabar eventos LiveKit o pases de vídeo (`format='video'`, que ya tienen su fichero).
- Reproducir las grabaciones dentro de la web, publicarlas a compradores o convertirlas a MP4 dentro de la aplicación. Esta fase sólo las guarda y las entrega al admin.
- Una mezcla global de audio en `meeting` (sólo pistas por participante).
- Replicar en la grabación el diseño exacto de `BroadcastStage` (split/pip elegido por el co-presentador).
- Borrado de grabaciones desde la aplicación: la caducidad la aplica el bucket y la supresión anticipada que pida un participante se hace a mano, siguiendo `docs/grabaciones-eventos.md`.
- Avisar por email de que una grabación está a punto de caducar.
- Estado de grabación en vivo para el host o los asistentes: la insignia refleja la configuración del evento; los fallos se avisan al admin por las alertas.

## Capabilities

### New Capabilities
- `agora-cloud-recording`: grabación en la nube de los eventos Agora — casilla por evento, predicado único de grabación, configuración de cada modo (`mix` para `broadcast`, `individual` para `meeting`), almacenamiento S3 y credencial delegada, reconciliador con techo de 180 minutos, reanudación acotada, diseño según la pantalla compartida, alertas y aislamiento en test.
- `event-recording-access`: acceso del admin a las grabaciones — disponibilidad por entorno, listado por tarea leído del bucket, descarga prefirmada de los MP4, correspondencia uid → participante y comandos de descarga de las pistas de una reunión.
- `event-recording-disclosure`: información a los participantes — insignia «Grabando» en la sala, aviso antes del acceso por modo de interacción y textos legales.

### Modified Capabilities
<!-- Ninguna: la señal `screen_share` no tiene hoy requisito propio en openspec/specs; su reemisión tras la unión queda especificada en `agora-cloud-recording`. -->

## Impact

- **Capas**: backend y frontend. Deben desplegarse juntos sólo en lo que toca a la casilla del formulario; el resto es aditivo.
- **Esquema de base de datos** (`api/config/database.js`, alto riesgo): columna `events.recording_enabled` (en el `CREATE TABLE` y con `safeAlter`) y tabla nueva `event_recordings` con un índice único parcial que impide dos tareas vivas por evento.
- **Backend**: `api/services/agoraRecordingService.js` (nuevo), `api/scheduler/recordingScheduler.js` (nuevo, arrancado desde `api/server.js`), `api/services/agoraService.js` (uids reservados del grabador y cabecera REST compartida), `api/services/s3Service.js` (listado y URL prefirmada), `api/services/emailService.js` (alerta), `api/config/env.js`, `api/validators/eventSchemas.js`, `api/services/eventService.js`, `api/controllers/eventAdminController.js`, `api/controllers/eventController.js`, `api/socket/eventSocket.js`, `api/routes/admin/eventRoutes.js`.
- **Frontend**: `client/app/admin/espacios/nuevo/page.js`, `client/app/admin/espacios/[id]/page.js`, `client/lib/eventRecording.js` (nuevo), `client/lib/constants.js`, la sala (`client/components/AgoraLiveRoom.js`, `client/app/live/[slug]/EventDetail.js`, barra compacta, cromo horizontal, consola del host), `client/components/EventAccessModal.js`, `client/app/legal/politica-de-privacidad/page.js`, `client/app/legal/normas-eventos/page.js`.
- **Dependencia nueva**: `@aws-sdk/s3-request-presigner` en `api/`.
- **Integración externa**: Agora Cloud Recording REST (`/v1/apps/{appid}/cloud_recording/...`), con las credenciales de cliente que ya usa la moderación. Requiere activar Cloud Recording en la consola de Agora.
- **Infraestructura AWS**: bucket de grabaciones por entorno (Block Public Access, sin versionado, regla de ciclo de vida de 30 días y de limpieza de subidas multiparte incompletas), usuario IAM por entorno con `s3:PutObject` sólo sobre su bucket, y `s3:ListBucket` + `s3:GetObject` + `s3:GetLifecycleConfiguration` añadidos al rol de la instancia de producción. Preproducción no tiene rol: allí el panel muestra bucket y prefijo, y los ficheros y la regla se comprueban en la consola de S3. Variables nuevas: `AGORA_RECORDING_S3_BUCKET`, `AGORA_RECORDING_S3_REGION`, `AGORA_RECORDING_S3_ACCESS_KEY`, `AGORA_RECORDING_S3_SECRET_KEY`. Ninguna `NEXT_PUBLIC_*`.
- **Coste** (90 min, tarifas publicadas por Agora por 1.000 min): `broadcast` host solo $0,54; con co-presentador $1,21; con pantalla compartida $2,16; `meeting` de 8 cámaras $1,21 y de 17 cámaras $4,86. Comparte los 10.000 min gratuitos mensuales con el RTC. Almacenamiento S3 del orden de céntimos por evento, acotado a 30 días.
