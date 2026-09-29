# 01 · Optimizar el vídeo en Ubuntu (versión H.264)

> **Camino habitual:** [`scripts/video/optimizar-video.mjs`](00-optimizacion-automatica.md) hace todo esto con un solo comando y elige la calidad midiendo. Esta guía explica qué hace por dentro, para hacerlo a mano o entenderlo.

**Objetivo.** Pasar de `lynda_blair_final.mp4` (3 GB, 12,4 Mb/s) a
`lynda_blair_h264.mp4`, la versión web que se sube **siempre**, con la mínima
pérdida de calidad y medida con números.

**Resultado esperado.** Entre 1,2 y 2 GB, H.264 High@4.1, color BT.709
etiquetado **sin alterar ni un píxel de color**, índice al principio del archivo
(*faststart*) y **el audio original intacto**.

Todos los comandos se han ejecutado con el ffmpeg que se instala en el paso 1, y
la medición de calidad se ha contrastado con un cálculo directo sobre los
píxeles. Cópialos tal cual.

---

## Lo que NO hay que hacer

- **No exportes un máster DNxHR/ProRes a partir del MP4.** El máster solo sirve
  si sale del proyecto de edición con el material original. Tu punto de partida
  es un MP4 ya procesado (grabado con un Pixel 9 Pro y exportado después), así
  que un intermedio no recupera nada, añade una pequeña pérdida y ocupa unos
  48 GB.
- **No recomprimas el audio.** Es una actuación musical. Recodificar el AAC
  sería una segunda compresión con pérdida para ahorrar unos 30 MB de 1,5 GB. Se
  copia tal cual (`-c:a copy`).
- **No uses `-colorspace bt709 -color_primaries bt709 -color_trc bt709` como
  opciones sueltas**, como proponía la respuesta original. Con el ffmpeg actual
  y un original sin etiquetar (el tuyo lo está), esas opciones **convierten los
  colores**: interpretan el original como si fuera BT.601. Comprobado: la luma
  cae a 22 dB de PSNR frente al original, un desplazamiento de color visible.
  Aquí se etiqueta con el filtro `setparams`, que solo cambia la etiqueta y deja
  los píxeles idénticos.
- **No uses la codificación por hardware de la gráfica Intel** (QSV/VA-API). Es
  mucho más rápida, pero a igual tamaño da peor calidad que x264.

---

## Paso 0 · Preparar el portátil

```bash
powerprofilesctl set performance   # los núcleos de eficiencia se frenan en modo ahorro
```

Portátil **enchufado**. Espacio necesario: unos 6 GB.

## Paso 1 · Instalar un ffmpeg reciente (una sola vez)

El `ffmpeg` de `apt` (6.1.1) trae un SVT-AV1 antiguo y puede no incluir VMAF. Se
usa la compilación estática de BtbN, que trae x264, SVT-AV1 reciente y VMAF, y
no toca el sistema.

```bash
mkdir -p ~/opt && cd ~/opt
wget https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz
tar xf ffmpeg-master-latest-linux64-gpl.tar.xz
echo 'export PATH="$HOME/opt/ffmpeg-master-latest-linux64-gpl/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Comprobación:

```bash
ffmpeg -hide_banner -encoders 2>/dev/null | grep -E "libx264|libsvtav1"   # deben salir las dos líneas
ffmpeg -hide_banner -filters  2>/dev/null | grep libvmaf                  # debe salir una línea
jq --version                                                              # ya lo tienes instalado
```

## Paso 2 · Carpeta de trabajo y variables

```bash
mkdir -p ~/video-lynda && cd ~/video-lynda
cp ~/Dropbox/lynda_blair_final.mp4 .      # ajusta la ruta a donde tengas el archivo

SRC=lynda_blair_final.mp4
TAG="setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv"
export LC_NUMERIC=C
```

- `SRC` es el original.
- `TAG` es la etiqueta de color que llevarán la codificación **y las dos
  entradas de cada medición**. Sin ella en las dos entradas, ffmpeg convierte
  una antes de comparar y el VMAF sale falso.
- `LC_NUMERIC=C` evita que el sistema en español rompa los decimales.

> **Una sola terminal.** Estas variables solo existen en la terminal donde las
> defines. Si abres otra, vuelve a entrar en la carpeta y pega de nuevo las tres
> líneas de variables.

## Paso 3 · Inspeccionar el original

```bash
ffprobe -v error -show_entries format=duration,bit_rate -of default=nw=1 "$SRC"
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,level,width,height,r_frame_rate,pix_fmt,color_space,color_primaries,color_transfer -of default=nw=1 "$SRC"
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,bit_rate,sample_rate,channels -of default=nw=1 "$SRC"
ffprobe -v trace "$SRC" 2>&1 | grep -m2 -oE "type:'(moov|mdat)'"
```

La última línea dice dónde está el índice del archivo. Si sale `mdat` antes que
`moov`, el índice está al final, y la versión web lo corrige con `+faststart`.

## Paso 4 · Elegir los fragmentos de prueba

Las pruebas se hacen sobre **60 segundos**, no sobre el vídeo entero. Elige dos
momentos y anota su segundo de inicio:

1. **El más exigente:** mucho movimiento, luces de escenario, público o cámara
   en mano.
2. **El más oscuro:** es donde se nota antes la compresión (bloques, bandas en
   los degradados).

Un minuto se pasa a segundos multiplicándolo por 60: el minuto 10:00 es
`SS=600`.

## Paso 5 · Probar CRF 18, 20 y 22 y medir la calidad (VMAF)

El **CRF** es el nivel de calidad: cuanto más bajo, más calidad y más peso.
**VMAF** compara cada prueba con el original y la puntúa de 0 a 100. Por encima
de 95 de media es prácticamente indistinguible.

Pega el bloque entero y cambia `SS` por el segundo que anotaste:

```bash
SS=600; DUR=60; mkdir -p pruebas
for CRF in 18 20 22; do
  OUT="pruebas/h264_ss${SS}_crf${CRF}.mp4"
  echo "── CRF $CRF: codificando…"
  time ffmpeg -hide_banner -v error -stats -y -ss "$SS" -t "$DUR" -i "$SRC" -map 0:v:0 -an \
    -vf "$TAG" \
    -c:v libx264 -preset slow -crf "$CRF" -profile:v high -level 4.1 \
    -maxrate 8M -bufsize 16M -pix_fmt yuv420p -g 50 -keyint_min 25 \
    "$OUT"
  echo "── CRF $CRF: midiendo VMAF…"
  ffmpeg -hide_banner -v error -i "$OUT" -ss "$SS" -t "$DUR" -i "$SRC" -lavfi \
    "[0:v]$TAG,format=yuv420p10le,setpts=PTS-STARTPTS[d];[1:v]$TAG,format=yuv420p10le,setpts=PTS-STARTPTS[r];[d][r]libvmaf=n_threads=8:feature=name=psnr:log_fmt=json:log_path=${OUT%.mp4}.json" \
    -f null -
  KBPS=$(( $(ffprobe -v error -show_entries format=bit_rate -of csv=p=0 "$OUT") / 1000 ))
  jq -r --arg c "$CRF" --arg k "$KBPS" '
    ([.frames[].metrics.vmaf] | sort) as $v
    | "RESULTADO CRF \($c): \($k) kb/s | VMAF media \(.pooled_metrics.vmaf.mean*100|round/100) | p1 \($v[(($v|length)/100|floor)]*100|round/100) | mín \(.pooled_metrics.vmaf.min*100|round/100) | PSNR-Y \(.pooled_metrics.psnr_y.mean*10|round/10) dB"' \
    "${OUT%.mp4}.json"
done
```

Repite el bloque con el segundo fragmento (cambia solo `SS`). Cada vuelta tarda
unos minutos.

### Cómo leer el resultado

```
RESULTADO CRF 20: 5400 kb/s | VMAF media 96.8 | p1 93.1 | mín 90.2 | PSNR-Y 43.5 dB
```

- **kb/s:** el bitrate del vídeo en ese fragmento.
- **VMAF media:** la calidad media del fragmento.
- **p1:** el 1 % de fotogramas peor tratados. Es donde se ven los defectos.
- **mín:** el peor fotograma. Orientativo; un corte de plano puede bajarlo.
- **PSNR-Y:** el vigilante del color. **VMAF no detecta un desplazamiento de
  color**: la codificación con las opciones `-colorspace` sueltas puntuaba 100
  en VMAF y solo 22 dB en PSNR. Con los comandos de esta guía suele salir entre
  38 y 48 dB (menos en escenas oscuras con mucho ruido de sensor). **Si sale por
  debajo de 35, algo ha alterado el color: para y avísame.**

**Regla de decisión:** elige **el CRF más alto** que cumpla, **en los dos
fragmentos**, **media ≥ 95 y p1 ≥ 90** (y PSNR-Y por encima de 35 dB). Si ni el 18 cumple, prueba 16 y 17 (y
dímelo: sería raro con un original de 12 Mb/s).

**Tamaño aproximado del archivo final:**

```
MB ≈ kb/s × 2076 / 8000 + 82
```

2076 son los segundos del vídeo y 82 los MB del audio copiado. Usa los kb/s del
fragmento exigente para quedarte en el lado seguro.

**Tiempo aproximado del archivo completo:** el `real` que imprime `time` en la
prueba, multiplicado por 34,6.

## Paso 6 · Codificar la versión final

```bash
CRF=20   # ← el CRF elegido en el paso 5
time ffmpeg -hide_banner -i "$SRC" -map 0:v:0 -map 0:a:0 \
  -vf "$TAG" \
  -c:v libx264 -preset slow -crf "$CRF" -profile:v high -level 4.1 \
  -maxrate 8M -bufsize 16M -pix_fmt yuv420p -g 50 -keyint_min 25 \
  -c:a copy -movflags +faststart \
  lynda_blair_h264.mp4
```

### Qué hace cada opción

| Opción | Para qué |
|---|---|
| `-map 0:v:0 -map 0:a:0` | Solo la primera pista de vídeo y la de audio. Descarta pistas de datos o de código de tiempo |
| `-vf "$TAG"` (`setparams`) | Etiqueta el color como BT.709 **sin tocar los píxeles**, para que todos los navegadores lo interpreten igual |
| `-preset slow -crf N` | Calidad constante: gasta bits solo donde hacen falta |
| `-profile:v high -level 4.1` | Perfil compatible con cualquier navegador y dispositivo |
| `-maxrate 8M -bufsize 16M` | Limita los picos para que una escena compleja no atasque la descarga |
| `-g 50 -keyint_min 25` | Un fotograma clave cada 2 s: saltar a un punto (entrar tarde, corregir la deriva) es rápido |
| `-c:a copy` | El audio original, sin tocar |
| `-movflags +faststart` | Índice al principio: el vídeo arranca sin descargar el final del archivo |

## Paso 7 · Verificar el resultado

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,level,pix_fmt,color_space,color_primaries,color_transfer,color_range -of default=nw=1 lynda_blair_h264.mp4
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels -of default=nw=1 lynda_blair_h264.mp4
ffprobe -v trace lynda_blair_h264.mp4 2>&1 | grep -m2 -oE "type:'(moov|mdat)'"
for f in "$SRC" lynda_blair_h264.mp4; do printf "%-26s %s s\n" "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"; done
ls -lh "$SRC" lynda_blair_h264.mp4
```

Tiene que salir:

- vídeo: `h264`, `High`, `level=41`, `yuv420p`, y `bt709` en los tres campos de
  color, con `color_range=tv`;
- audio: `aac`, `48000`, `2`;
- `moov` **antes** que `mdat`;
- la misma duración en los dos archivos, con una diferencia de décimas como
  mucho.

## Paso 8 (opcional) · VMAF del archivo completo

Confirma la calidad sobre todo el vídeo. Mide uno de cada cinco fotogramas;
tarda un rato.

```bash
ffmpeg -hide_banner -v error -stats -i lynda_blair_h264.mp4 -i "$SRC" -lavfi \
  "[0:v]$TAG,format=yuv420p10le,setpts=PTS-STARTPTS[d];[1:v]$TAG,format=yuv420p10le,setpts=PTS-STARTPTS[r];[d][r]libvmaf=n_threads=8:n_subsample=5:feature=name=psnr:log_fmt=json:log_path=vmaf_h264_completo.json" \
  -f null -
jq -r '([.frames[].metrics.vmaf]|sort) as $v | "VMAF media \(.pooled_metrics.vmaf.mean*100|round/100) | p1 \($v[(($v|length)/100|floor)]*100|round/100) | PSNR-Y \(.pooled_metrics.psnr_y.mean*10|round/10) dB"' vmaf_h264_completo.json
```

---

**Siguiente paso:** [02 · Versión AV1 y cálculo del ahorro](02-version-av1-y-ahorro.md).
El AV1 se genera **desde el mismo original**, nunca desde `lynda_blair_h264.mp4`.
