# 03 · Configurar AWS: claves, CloudFront, subida y verificación

**Objetivo.** Que los vídeos de `https://cdn.140d.art/eventos-video/…` **solo**
se sirvan con una URL firmada por la API, y comprobarlo antes de subir nada
real.

Todo se hace **una vez**. Después, cada evento solo requiere subir sus vídeos
(paso 8).

---

## Antes de empezar: por qué el bucket es privado y aun así el PDF se ve

Tu captura es correcta: el bucket tiene **«Bloquear todo el acceso público»**.
Comprobado desde fuera:

```console
$ curl -sI https://140d-media-pro-243303976956-eu-south-2-an.s3.eu-south-2.amazonaws.com/guias/configuracion-cuenta-stripe.pdf
HTTP/1.1 403 Forbidden          ← S3 directo: nadie entra

$ curl -sI https://cdn.140d.art/guias/configuracion-cuenta-stripe.pdf
HTTP/2 200                      ← por CloudFront: se sirve
via: 1.1 ….cloudfront.net (CloudFront)
```

No es una contradicción. Hay **dos puertas distintas**:

```
                 Puerta 1: el BUCKET                Puerta 2: la DISTRIBUCIÓN
                 (privado)                          (hoy pública)

 Navegador ──✗──▶ S3                                                    
                                                                        
 Navegador ─────────────────────────▶ CloudFront ──(OAC)──▶ S3          
                       sin preguntar       │     "soy la distribución
                       a nadie             │      E…, déjame leer"      
                                           ▼                            
                                  sirve a quien lo pida                 
```

- **Puerta 1.** «Bloquear todo el acceso público» impide leer el bucket
  directamente. Solo entra quien autoriza la política del bucket: la
  distribución de CloudFront, identificada con *Origin Access Control* (OAC).
  Leer como CloudFront no es «acceso público», así que el bloqueo no lo impide.
- **Puerta 2.** La distribución sirve a cualquiera que pida una URL, porque su
  comportamiento (*behavior*) no pide nada. Eso es lo correcto para las imágenes
  de las obras, la portada y las guías.

**Lo que se va a hacer:** añadir a la distribución una zona, `eventos-video/*`,
en la que CloudFront exige una **URL firmada** con una clave cuya mitad pública
conoce. El resto del CDN sigue igual.

```
cdn.140d.art/art/…, /stories/…, /guias/…   → behavior por defecto → público (sin cambios)
cdn.140d.art/eventos-video/…               → behavior nuevo       → SOLO con URL firmada
                                                                     + función de guarda
```

> **Un solo bucket para los dos entornos:
> `140d-media-pro-243303976956-eu-south-2-an`.** Es el único origen de la
> distribución de `cdn.140d.art`, así que todo lo que se sirve por
> `cdn.140d.art/eventos-video/…` tiene que estar **en ese bucket**, también lo
> que se prueba desde preproducción.
>
> Preproducción no necesita bucket propio para esto. Su clave (`eventos-video-pre`)
> decide **quién firma**, no **dónde está el archivo**: el Mac mini firma URLs de
> los mismos vídeos del bucket de producción.
>
> Un vídeo subido a otro bucket (por ejemplo, uno de preproducción) **no existe**
> para `cdn.140d.art`, y cualquier URL, bien firmada o no, responde 403.

---

## Paso 1 · Comprobaciones previas (solo mirar, no se cambia nada)

**1.a · Política del bucket.** S3 → bucket `140d-media-pro-…` → pestaña
**Permisos** → **Política del bucket**.

> **Revisado el 28/09/2026: correcta, no hay que cambiar nada.** Es la que genera
> la propia consola de CloudFront al configurar OAC:
>
> ```json
> {
>   "Version": "2008-10-17",
>   "Id": "PolicyForCloudFrontPrivateContent",
>   "Statement": [{
>     "Sid": "AllowCloudFrontServicePrincipal",
>     "Effect": "Allow",
>     "Principal": { "Service": "cloudfront.amazonaws.com" },
>     "Action": "s3:GetObject",
>     "Resource": "arn:aws:s3:::140d-media-pro-243303976956-eu-south-2-an/*",
>     "Condition": { "ArnLike": { "AWS:SourceArn": "arn:aws:cloudfront::243303976956:distribution/E3AXP7BKPD0P8K" } }
>   }]
> }
> ```

Cómo se lee:

- **`Principal: cloudfront.amazonaws.com` + `Condition … distribution/E3AXP7BKPD0P8K`.**
  Solo el servicio CloudFront, y solo cuando actúa en nombre de **esa**
  distribución, puede leer. Es OAC.
  - `E3AXP7BKPD0P8K` tiene que ser el ID de la distribución de `cdn.140d.art`.
    Lo es: si no, el CDN no podría servir ni el PDF de las guías.
  - `ArnLike` con un ARN sin comodines equivale a `StringEquals`.
  - `Version: 2008-10-17` es la versión antigua del lenguaje de políticas, la que
    usa la plantilla de CloudFront. Solo afecta a funciones que aquí no se usan
    (variables de política).
- **`Action: s3:GetObject` y nada más.** CloudFront puede leer objetos pero no
  listar el bucket. Por eso **un archivo que no existe responde 403, no 404**: S3
  no revela si existe. Téngase en cuenta en los «Problemas frecuentes».
- **El comportamiento nuevo `eventos-video/*` usa el mismo origen, con el mismo
  OAC.** Sus lecturas llegan firmadas como la misma distribución, así que **la
  política ya las permite**.
- **La encriptación del bucket es SSE-S3** (`x-amz-server-side-encryption: AES256`
  en las respuestas). Con OAC no necesita nada más; una clave KMS sí lo
  necesitaría.

**CORS del bucket** (misma pestaña): lo que hay está bien y **no hace falta
tocarlo**.

- El `<video>` del evento pide el archivo **sin** el atributo `crossorigin`. El
  navegador no aplica CORS a esa petición, así que no se necesita ninguna
  cabecera `Access-Control-*`, ni siquiera para preproducción, cuyo dominio no
  está en `AllowedOrigins`.
- En el comportamiento nuevo, con `CachingOptimized` y sin política de solicitud
  al origen, CloudFront **no reenvía** la cabecera `Origin` a S3, y S3 no llega a
  evaluar su CORS.
- Solo si algún día el reproductor añadiera `crossorigin` (por ejemplo, para
  capturar fotogramas en un `<canvas>`), habría que añadir al comportamiento una
  política de solicitud al origen que reenvíe `Origin` (y el dominio de
  preproducción al CORS). No es el caso.

**Lista de control de acceso (ACL):** correcta. «Imposición de propietario del
bucket» significa que las ACL están **desactivadas**: solo manda la política.
«Todo el mundo» y «Usuarios autenticados» no tienen ningún permiso.

Resumen del paso 1.a: **bucket privado, CloudFront con OAC, sin ACL, CORS
inocuo. Nada que cambiar.**

**1.b · Origen de la distribución.** CloudFront → distribución de
`cdn.140d.art` → pestaña **Orígenes**. El origen del bucket debe tener
**Acceso al origen: Configuración de control de acceso al origen (OAC)** y
**Ruta de origen vacía**. Si la ruta de origen no está vacía, avísame: cambiaría
la ruta donde hay que subir los vídeos.

**1.c · Comportamientos actuales.** Pestaña **Comportamientos**. Apunta los
patrones que hay. Hoy probablemente solo existe `Default (*)`. Si hubiera alguno
que pudiera coincidir con `eventos-video/…` (por ejemplo `*.mp4`), mándame una
captura: el orden importa (paso 6.3).

## Paso 2 · Generar los dos pares de claves (en tu Ubuntu)

Un par para **producción** y otro para **preproducción**. Si alguna vez hay que
revocar la de preproducción (el Mac mini), producción no se entera.

```bash
mkdir -p ~/utils/keys/claves-cloudfront && chmod 700 ~/utils/keys/claves-cloudfront && cd ~/utils/keys/claves-cloudfront
openssl genrsa -out eventos-video-prod.pem 2048
openssl rsa -pubout -in eventos-video-prod.pem -out eventos-video-prod.pub.pem
openssl genrsa -out eventos-video-pre.pem 2048
openssl rsa -pubout -in eventos-video-pre.pem -out eventos-video-pre.pub.pem
chmod 600 *.pem
ls -l
```

- `*.pem` (sin `.pub`) son las **claves privadas**. **Nunca** van al
  repositorio, a un chat ni a un correo. Guárdalas en tu gestor de contraseñas.
  Una vez puestas en los `.env` (guía 05), puedes borrar las copias sueltas.
- `*.pub.pem` son las **públicas**, las que se pegan en CloudFront. Que se vean
  no es un problema.
- Solo **RSA 2048**. La API rechaza otros tipos al arrancar.

## Paso 3 · Subir las claves públicas a CloudFront

CloudFront → menú lateral **Claves públicas** → **Crear clave pública**. Hazlo
dos veces:

| Nombre | Valor (pega el contenido completo, con `-----BEGIN PUBLIC KEY-----`) |
|---|---|
| `eventos-video-prod` | `cat ~/utils/keys/claves-cloudfront/eventos-video-prod.pub.pem` |
| `eventos-video-pre` | `cat ~/utils/keys/claves-cloudfront/eventos-video-pre.pub.pem` |

**Apunta el ID** que CloudFront asigna a cada una. Empieza por `K` (por ejemplo
`K2JCJMDEHXQW5F`). Es el `EVENT_VIDEO_CF_KEY_PAIR_ID` de cada entorno.

## Paso 4 · Crear el grupo de claves

CloudFront → **Grupos de claves** → **Crear grupo de claves**:

- **Nombre:** `eventos-video`
- **Claves públicas:** añade **las dos** (`eventos-video-prod` y
  `eventos-video-pre`).

## Paso 5 · Crear la función de guarda

Impide que alguien copie la URL firmada, la pegue en la barra del navegador y
obtenga un reproductor con el botón de descarga. Detalle y límites en la
[guía 04](04-alcance-de-la-proteccion.md).

CloudFront → **Funciones** → **Crear función**:

- **Nombre:** `event-video-guard`
- **Tiempo de ejecución:** `cloudfront-js-2.0`

En la pestaña **Desarrollo**, sustituye el código por el de
[`deploy/cloudfront/event-video-guard.js`](../../deploy/cloudfront/event-video-guard.js)
(la copia versionada, que es la de referencia; es este) y pulsa **Guardar
cambios**:

```js
// event-video-guard — CloudFront Function (runtime cloudfront-js-2.0),
// evento viewer request, asociada al behavior eventos-video/* de la
// distribución de cdn.140d.art (change: event-video-cdn-delivery).
//
// Esta es la copia versionada de la función que corre en CloudFront. Si se
// cambia aquí, hay que pegarla en la consola, probarla (pestaña Test) y
// publicarla: nada la despliega sola. Procedimiento completo en
// docs/eventos-video/03-configurar-aws.md, paso 5.
//
// Rechaza las navegaciones directas a un vídeo: pegar la URL firmada en la
// barra o abrirla en una pestaña nueva daría un reproductor con botón de
// descarga, pausa y avance. La reproducción legítima la pide el <video> de la
// página con Sec-Fetch-Dest: video. Lista de bloqueo y no de permitidos: sin la
// cabecera (Safari anterior a 16.4, AVFoundation en iOS) se deja pasar, y la
// firma sigue siendo obligatoria. Límites de esta medida en
// docs/eventos-video/04-alcance-de-la-proteccion.md.
function handler(event) {
  var header = event.request.headers['sec-fetch-dest'];
  var dest = header ? header.value : '';
  if (dest === 'document' || dest === 'iframe' || dest === 'frame' ||
      dest === 'embed' || dest === 'object') {
    return { statusCode: 403, statusDescription: 'Forbidden' };
  }
  return event.request;
}
```

**Pruébala** en la pestaña **Prueba**: tipo de evento *Viewer request*, método
`GET`, ruta `/eventos-video/prueba/prueba.mp4`. Ejecuta estos cuatro casos
cambiando la cabecera:

| Cabecera añadida | Resultado esperado |
|---|---|
| `sec-fetch-dest: document` | Respuesta con `statusCode: 403` |
| `sec-fetch-dest: iframe` | Respuesta con `statusCode: 403` |
| `sec-fetch-dest: video` | Devuelve la petición (pasa) |
| ninguna | Devuelve la petición (pasa) |

Si los cuatro salen así, pestaña **Publicar** → **Publicar función**.

## Paso 6 · Crear el comportamiento protegido

> **Orden obligatorio:** este paso va **antes** de subir ningún vídeo a
> `eventos-video/`. Un vídeo subido antes quedaría público hasta que exista el
> comportamiento.

**6.1** · Distribución de `cdn.140d.art` → pestaña **Comportamientos** →
**Crear comportamiento**:

| Campo | Valor |
|---|---|
| Patrón de ruta | `eventos-video/*` |
| Origen | el mismo origen S3 que usa `Default (*)` |
| Comprimir objetos automáticamente | **No** (el vídeo ya está comprimido) |
| Política de protocolo del espectador | **Redirect HTTP to HTTPS** |
| Métodos HTTP permitidos | **GET, HEAD** |
| **Restringir el acceso de los espectadores** | **Sí** |
| Firmantes de confianza | **Grupos de claves de confianza** → `eventos-video` |
| Clave de caché y solicitudes al origen | Política de caché y de solicitud al origen (recomendado) |
| Política de caché | **CachingOptimized** |
| Política de solicitud al origen | ninguna |
| Política de encabezados de respuesta | ninguna |
| Asociaciones de funciones → **Solicitud del espectador** | Tipo **CloudFront Functions** → `event-video-guard` |

Pulsa **Crear comportamiento**.

**6.2 · Por qué `CachingOptimized`:** no incluye la cadena de consulta en la
clave de caché. Cada espectador trae una firma distinta en la URL, y aun así
todos comparten la copia del borde. CloudFront valida la firma **antes** de
mirar la caché, así que compartir la caché no abre ninguna puerta.

**6.3 · Precedencia.** En la lista de comportamientos, `eventos-video/*` debe
estar **arriba del todo (precedencia 0)**. CloudFront aplica el primero que
coincide. Si otro patrón más general quedara por encima, el vídeo se serviría
sin firma. Si no está el primero, selecciónalo → **Mover hacia arriba** →
**Guardar**.

**6.4** · Espera a que la distribución pase de «Implementando» a la fecha de
última modificación (unos minutos).

## Paso 7 · Verificar con un vídeo de prueba (antes de subir nada real)

**7.1 · Crear un vídeo de prueba de 10 s** (en tu Ubuntu, con el ffmpeg
instalado en `~/opt`; la ruta completa funciona aunque no esté en el `PATH`):

```bash
cd ~/utils/keys/claves-cloudfront
~/opt/ffmpeg-master-latest-linux64-gpl/bin/ffmpeg -hide_banner -v error -f lavfi -i testsrc2=size=1280x720:rate=25 -t 10 \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart prueba.mp4
```

**7.2 · Subirlo:** S3 → bucket **`140d-media-pro-243303976956-eu-south-2-an`**
(el de producción, el único que sirve `cdn.140d.art`, también para las pruebas
de preproducción) → **Crear carpeta** `eventos-video` (si no existe) → dentro,
carpeta `prueba` → **Cargar** `prueba.mp4`.

**7.3 · Sin firma → debe dar 403:**

```bash
curl -sI https://cdn.140d.art/eventos-video/prueba/prueba.mp4 | head -1
curl -s  https://cdn.140d.art/eventos-video/prueba/prueba.mp4 | head -c 300; echo
```

Se espera `HTTP/2 403` y un XML con `MissingKey`. **Si da `200`, el
comportamiento no está protegiendo:** revisa el paso 6 (precedencia,
«Restringir el acceso», implementación terminada) **antes de seguir**.

**7.3 bis · El resto del CDN sigue público → debe dar 200.** El comportamiento
nuevo solo afecta a `eventos-video/`: imágenes, portada y guías siguen igual.

```bash
curl -sI https://cdn.140d.art/guias/configuracion-cuenta-stripe.pdf | head -1   # esperado HTTP/2 200
```

Si diera 403, el patrón del comportamiento está mal escrito (debe ser
exactamente `eventos-video/*`). Corrígelo en el momento: la web estaría sin
imágenes.

**7.4 · Con una firma hecha a mano → debe reproducirse.** Este bloque firma
exactamente como lo hará la API (comprobado: la firma de `openssl` y la del
código son idénticas byte a byte). Usa la clave de **preproducción** y su ID:

```bash
cd ~/utils/keys/claves-cloudfront
KEY_FILE=eventos-video-pre.pem
KEY_ID=K…                                          # ← el ID de eventos-video-pre (paso 3)
URL="https://cdn.140d.art/eventos-video/prueba/prueba.mp4"
EXP=$(( $(date +%s) + 600 ))                       # caduca en 10 minutos
POLICY="{\"Statement\":[{\"Resource\":\"$URL\",\"Condition\":{\"DateLessThan\":{\"AWS:EpochTime\":$EXP}}}]}"
b64cf() { base64 -w0 | tr '+=/' '-_~'; }
P=$(printf '%s' "$POLICY" | b64cf)
S=$(printf '%s' "$POLICY" | openssl dgst -sha256 -sign "$KEY_FILE" | b64cf)
SIGNED="$URL?Policy=$P&Signature=$S&Key-Pair-Id=$KEY_ID&Hash-Algorithm=SHA256"

echo "1) firmada:                   $(curl -s -o /dev/null -w '%{http_code}' "$SIGNED")                 (esperado 200)"
echo "2) firmada, como <video>:     $(curl -s -o /dev/null -w '%{http_code}' -H 'Sec-Fetch-Dest: video' -H 'Range: bytes=0-1023' "$SIGNED")   (esperado 206)"
echo "3) firmada, pegada en barra:  $(curl -s -o /dev/null -w '%{http_code}' -H 'Sec-Fetch-Dest: document' "$SIGNED")   (esperado 403)"
echo "4) firma de OTRO archivo:     $(curl -s -o /dev/null -w '%{http_code}' "${SIGNED/prueba.mp4?/otro.mp4?}")   (esperado 403)"

# Si la línea 1 no da 200: quién responde (CloudFront o S3) y con qué código
curl -sI "$SIGNED" | grep -iE "^(HTTP|server)"
curl -s -r 0-400 "$SIGNED" | grep -ao "<Code>[^<]*</Code>"
```

Si la línea 1 da 403, las dos últimas órdenes dicen por qué (ver la tabla del
final):

- `server: CloudFront` → el problema es la firma o la clave;
- `server: AmazonS3` con `AccessDenied` → la firma es buena, pero **el archivo no
  está en el bucket de producción**, en esa ruta exacta.

Repite el bloque con `KEY_FILE=eventos-video-prod.pem` y el ID de producción:
las dos claves deben funcionar.

**7.5 · Caducidad.** Cambia `EXP=$(( $(date +%s) - 60 ))` (caducada hace un
minuto), vuelve a ejecutar el bloque: la línea 1 debe dar **403**.

Si todo coincide, la parte de AWS está terminada y probada. El archivo de prueba
puede quedarse (no molesta) o borrarse.

## Paso 8 · Subir los vídeos reales

Cuando tengas los archivos de las guías 01 y 02:

1. S3 → bucket **`140d-media-pro-243303976956-eu-south-2-an`** → `eventos-video/`
   → **Crear carpeta** con un nombre por evento. Usa el que propone el informe
   del script (`lynda_blair`) o el que quieras, siempre que la URL del evento
   coincida.
2. **Cargar** `lynda_blair_h264.mp4` y, si decidiste usarlo,
   `lynda_blair_av1.mp4`. La consola sube archivos grandes sin problema; con la
   subida de casa, 1,5 GB tardan un rato.
3. Comprueba en **Propiedades** de cada objeto → **Metadatos** que
   `Content-Type` es `video/mp4` (la consola lo pone sola por la extensión).

**Reglas de nombres:**

- Solo **minúsculas, números, guiones y guiones bajos**: sin espacios, tildes ni
  eñes. La firma cubre la URL exacta, y un carácter codificado de otra manera la
  invalida.
- **Nunca sobrescribas un vídeo.** Si hay una versión nueva, súbela con otro
  nombre (`…_v2.mp4`) y cambia la URL en el evento. El borde conserva la copia
  antigua hasta 24 h; con otro nombre no hay nada que invalidar.

## Paso 9 · Qué URL pegar en el formulario del evento

La URL del CDN, **sin firma**, tal cual. El informe del script ya la trae escrita:

```
URL del vídeo (MP4 H.264):         https://cdn.140d.art/eventos-video/lynda_blair/lynda_blair_h264.mp4
URL de la versión AV1 (opcional):  https://cdn.140d.art/eventos-video/lynda_blair/lynda_blair_av1.mp4
```

La API reconoce el prefijo `eventos-video/` y firma cada vez que un asistente
con acceso la pide. La API **rechaza al guardar**:

- una URL de `cdn.140d.art` fuera de `eventos-video/`, porque sería pública;
- una URL de `eventos-video/` en un servidor que no tiene las claves
  configuradas.

---

## Rotar o revocar una clave

**Rotar** (cambio preventivo, sin cortar a nadie):

1. Genera un par nuevo (paso 2) y sube la pública (paso 3).
2. Añádela al grupo `eventos-video` (máximo cinco claves por grupo).
3. Cambia el `.env` del entorno (clave e ID nuevos) y reinicia la API
   (guía 05).
4. Cuando hayan caducado las URLs firmadas con la vieja (unas horas; nunca más
   de 6), quita la clave vieja del grupo y bórrala.

**Revocar** (sospecha de filtración): quita la clave del grupo **ya**. Toda URL
firmada con ella deja de funcionar al momento. Después, pasos 1 a 3 de la
rotación.

## Costes

- **CloudFront:** 1 TB de transferencia y 10 millones de peticiones gratis al
  mes. 50 espectadores viendo 34 minutos a unos 5 Mb/s son unos 65 GB.
- **CloudFront Functions:** 2 millones de invocaciones gratis al mes.
- **S3:** unos 2,5 GB de almacenamiento, céntimos al mes.
- **Claves y grupos de claves:** gratis.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| Sin firma da `200` | El comportamiento no protege: precedencia, «Restringir el acceso» o implementación sin terminar (paso 6) |
| `403` · `server: CloudFront` · `MissingKey` | La URL no lleva firma, o le falta algún parámetro. Sin firma es lo esperado |
| `403` · `server: CloudFront` · `InvalidKey` (*Unknown Key*) | El `Key-Pair-Id` no es de una clave del grupo `eventos-video`, o el comportamiento no usa ese grupo |
| `403` · `server: CloudFront` · `AccessDenied` | La firma no corresponde a esa clave, ha caducado, o la URL pedida no es exactamente la firmada |
| `403` · `server: AmazonS3` · `AccessDenied` | **La firma es correcta, pero el archivo no existe** en el bucket de producción en esa ruta: se subió a otro bucket, u otra carpeta, nombre, mayúsculas o extensión. S3 responde 403 y no 404 porque CloudFront no puede listar el bucket |
| En preproducción funciona y en producción no | Variables del `.env` de producción (guía 05): ID de la otra clave, base64 mal copiado o falta de reinicio |
| El vídeo arranca y se corta a los N minutos | `duration_minutes` del evento menor que el vídeo. El reproductor pide una firma nueva solo; si se repite, alarga la duración del evento |
