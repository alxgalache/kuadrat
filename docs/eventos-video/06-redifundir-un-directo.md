# 06 · Redifundir un directo

Cómo pasar de la grabación de un evento en directo a los dos archivos de una
redifusión (un evento de «Vídeo pregrabado»). Son seis pasos en el portátil, y
solo se recodifica el AV1: el MP4 es la propia grabación, recortada.

Sirve para los eventos de Agora en modo **Stream** (`broadcast`) que se
grabaron, porque dan **un MP4**. Una reunión (`meeting`) no da MP4: ver la
nota final.

```
 panel de admin ──▶ recortar sin recodificar ──▶ comprobar el corte ──▶ script
   (descargar)       (en un fotograma clave)        (K en 0, sin D)      (copia MP4 + AV1)
```

Ejemplo real: `entrevista_lorca` (16/10/2026). Era una grabación de 68 min en
la que el invitado entraba a los 0:43. La redifusión empieza a los 0:44.

---

## Paso 1 · Descargar la grabación

En `/admin/espacios`, ficha del evento, sección **«Grabaciones»**, botón
**«Descargar»** del MP4. **Hazlo antes de la fecha «Disponible hasta»**: el
bucket borra las grabaciones a los 30 días y no se pueden recuperar (detalle en
[`docs/grabaciones-eventos.md`](../grabaciones-eventos.md), §9).

Guárdala con un nombre en minúsculas, sin espacios. Ese nombre será la carpeta
de S3 y la base de las URLs:

```bash
mkdir -p ~/utils/140d && mv ~/Descargas/<archivo descargado>.mp4 ~/utils/140d/entrevista_lorca.mp4
```

Esta guía cubre el caso habitual de un solo MP4. Si el panel muestra varias
partes o varios MP4 del mismo evento, hay que unirlos antes, y eso no está
probado aquí: revísalo con calma antes de seguir.

## Paso 2 · Decidir dónde empieza y dónde acaba

Ábrela con VLC (o mpv) y anota el **segundo** en el que debe empezar la
redifusión (por ejemplo, cuando entra el invitado) y, si sobra algo al final,
el segundo en que debe acabar. Basta con el segundo: el paso 3 lo ajusta.

## Paso 3 · Encontrar el fotograma clave exacto

Un corte sin recodificar solo puede empezar en un **fotograma clave**. Las
grabaciones de Agora tienen uno cada 2 s. Lista los que hay alrededor del
inicio:

```bash
F=~/opt/ffmpeg-master-latest-linux64-gpl/bin
SRC=~/utils/140d/entrevista_lorca.mp4
DESDE=44        # el segundo que anotaste
$F/ffprobe -v error -select_streams v:0 -skip_frame nokey -show_entries frame=pts_time \
  -of csv=p=0 -read_intervals "$((DESDE - 3))%$((DESDE + 3))" "$SRC"
```

```
40.000000
42.000000
44.064000
46.064000
```

Elige **el primero que sea igual o posterior** a tu segundo y cópialo **con
todos sus decimales**. Aquí es `44.064000`.

### Por qué el instante exacto, y no «44»

Con `-c copy`, ffmpeg no puede empezar entre dos fotogramas clave. Si le pides
`-ss 44`, **empieza en el clave anterior** (el de 42 s) y escribe en el archivo
una **lista de edición** que pide al reproductor ocultar los 2 primeros
segundos. Con `entrevista_lorca` salieron 59 fotogramas con marcas negativas
(desde −2,03 s) y marcados para descartar.

- Unos reproductores respetan esa lista y otros no.
- El script **no copia** un archivo así: lo recodificaría entero.

Con el instante exacto del clave, el archivo empieza limpio en 0.

## Paso 4 · Recortar sin recodificar

```bash
CLAVE=44.064000     # el del paso 3
HASTA=              # vacío = hasta el final; si no, el segundo en que acaba (p. ej. 3900)
OUT=~/utils/140d/entrevista_lorca_final.mp4
$F/ffmpeg -hide_banner -v error -stats -ss "$CLAVE" ${HASTA:+-to "$HASTA"} -i "$SRC" \
  -map 0:v:0 -map 0:a:0 -c copy -movflags +faststart "$OUT"
```

- **`-ss` y `-to` van antes de `-i`.** Así los dos son instantes de la
  grabación original: `-to` es el segundo en que acaba, no una duración.
- **El final puede cortarse en cualquier segundo**, no necesita un fotograma
  clave.
- **El nombre termina en `_final.mp4`.** El script le quita ese sufijo y deja
  `entrevista_lorca_h264.mp4`, `entrevista_lorca_av1.mp4` y
  `entrevista_lorca_informe.md`.
- **Tarda unos segundos**: no recodifica nada.

## Paso 5 · Comprobar el corte

```bash
$F/ffprobe -v error -select_streams v:0 -show_entries packet=pts_time,flags \
  -of csv=p=0 -read_intervals "%+#1" "$OUT"
$F/ffprobe -v error -select_streams v:0 -show_entries packet=flags -of csv=p=0 "$OUT" | grep -c D
```

Tiene que salir esto:

```
0.000000,K__
0
```

| Línea | Qué significa |
|---|---|
| `0.000000,K__` | El primer paquete es un fotograma clave (`K`) en el instante 0 |
| `0` | Ningún paquete lleva la marca de descarte (`D`): no hay lista de edición en el vídeo |

Si sale una marca negativa o un número distinto de 0, el corte no empezó en un
fotograma clave: repite los pasos 3 y 4 con el instante exacto.

El audio sí puede llevar una lista de edición pequeña, de unos milisegundos, al
empezar a mitad de un bloque AAC. Es normal y no afecta.

## Paso 6 · Optimizar

```bash
cd ~/projects/kuadrat
node scripts/video/optimizar-video.mjs ~/utils/140d/entrevista_lorca_final.mp4
```

Con una grabación de Agora, el script:

- comprueba que el MP4 es apto para la web y que recodificarlo no lo aligera.
  En la salida aparece «Se copia el original como MP4», con los bitrates
  comparados;
- **copia** el recorte como `<nombre>_h264.mp4`, con el color BT.709 etiquetado
  y el índice al principio. Tarda segundos;
- codifica solo el **AV1** y lo mide frente al original.

Detalle de las condiciones y del criterio en la
[guía 00](00-optimizacion-automatica.md#el-original-como-mp4). Para una hora de
grabación, la codificación del AV1 tarda alrededor de una hora y cuarto.

## Después

1. Sube los dos archivos
   ([guía 03, paso 8](03-configurar-aws.md#paso-8--subir-los-vídeos-reales)).
2. Crea el evento
   ([guía 05, apartado 6](05-entornos-y-pruebas.md#6--el-día-del-evento)), con
   las URLs y la duración que trae el informe.

Varias redifusiones del mismo directo pueden usar **las mismas URLs**: la API
firma cada pase por separado, así que no hace falta subir el vídeo dos veces.

## Nota: grabaciones de una reunión (`meeting`)

En modo reunión, Agora graba una pista por participante y **no da MP4**. Para
convertirlas hace falta la herramienta de Agora
([`docs/grabaciones-eventos.md`](../grabaciones-eventos.md), §10). El MP4 que
resulta pasa por el script como cualquier otro original: si no es apto para la
web, se recodifica.
