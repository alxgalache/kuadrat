# 02 · Versión AV1 y cálculo del ahorro

> **Camino habitual:** [`scripts/video/optimizar-video.mjs`](00-optimizacion-automatica.md) hace todo esto con un solo comando y elige la calidad midiendo. Esta guía explica qué hace por dentro, para hacerlo a mano o entenderlo.

**Objetivo.** Generar `lynda_blair_av1.mp4`, la versión opcional que la web
sirve a los dispositivos que decodifican AV1 por hardware, y **comprobar con
números** si compensa.

**Requisitos.**

- Haber terminado la [guía 01](01-optimizar-video-ubuntu.md): hace falta
  `lynda_blair_h264.mp4` para comparar.
- Misma carpeta (`~/video-lynda`) y las tres variables de la guía 01:

```bash
cd ~/video-lynda
SRC=lynda_blair_final.mp4
TAG="setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv"
export LC_NUMERIC=C
```

> **El AV1 se genera desde el original (`$SRC`), nunca desde el H.264 ya
> optimizado.** Partir del H.264 encadenaría una compresión más.

## Cómo lo usa la web (para entender la decisión)

- El evento guarda **siempre** el MP4 H.264 y, casi siempre, también el AV1.
- El reproductor pregunta al navegador si decodifica AV1 **por hardware**. Si
  la respuesta es sí, sirve el AV1; si no, el MP4.
- Si el AV1 falla, pasa al MP4 en el mismo segundo del pase.

Eso significa que **el AV1 solo aporta si pesa bastante menos a igual calidad**:
menos datos por espectador y menos cortes con conexiones justas.

---

## Opción A (recomendada) · Comparación con el vídeo completo

Es la comprobación definitiva: los dos archivos reales frente al original.

### A.1 · Codificar el AV1 completo

```bash
CRF_AV1=30
time ffmpeg -hide_banner -i "$SRC" -map 0:v:0 -map 0:a:0 \
  -vf "$TAG,format=yuv420p10le" \
  -c:v libsvtav1 -preset 4 -crf "$CRF_AV1" -g 50 \
  -c:a copy -movflags +faststart \
  lynda_blair_av1.mp4
```

- **Tarda horas** (el preset 4 es lento a propósito: mejor compresión). Con
  `-preset 5` es bastante más rápido a cambio de un archivo algo mayor.
- Las líneas `Svt[info]: …` del principio son normales.
- **Los 10 bits (`yuv420p10le`) son intencionados:** comprimen mejor y reducen
  las bandas en los degradados oscuros de un escenario. La conversión desde el
  original de 8 bits es sin pérdida (comprobado: PSNR infinita).
- El audio se copia, igual que en el H.264.

### A.2 · Script de comparación

Pega el bloque entero. Mide la calidad de las dos versiones frente al original
(uno de cada cinco fotogramas) e imprime la tabla con el ahorro:

```bash
H264=lynda_blair_h264.mp4; AV1=lynda_blair_av1.mp4
for f in "$H264" "$AV1"; do
  echo "── Midiendo $f (1 de cada 5 fotogramas)…"
  ffmpeg -hide_banner -v error -i "$f" -i "$SRC" -lavfi \
    "[0:v]$TAG,format=yuv420p10le,setpts=PTS-STARTPTS[d];[1:v]$TAG,format=yuv420p10le,setpts=PTS-STARTPTS[r];[d][r]libvmaf=n_threads=8:n_subsample=5:feature=name=psnr:log_fmt=json:log_path=vmaf_${f%.mp4}.json" \
    -f null -
done
fila() {
  local vm="—" p1="—" ps="—"
  local bytes; bytes=$(stat -c %s "$1")
  local vkbps; vkbps=$(ffprobe -v error -select_streams v:0 -show_entries stream=bit_rate -of csv=p=0 "$1")
  if [ "$1" != "$SRC" ]; then
    read -r vm p1 ps < <(jq -r '([.frames[].metrics.vmaf]|sort) as $v | "\(.pooled_metrics.vmaf.mean*100|round/100) \($v[(($v|length)/100|floor)]*100|round/100) \(.pooled_metrics.psnr_y.mean*10|round/10)"' "vmaf_${1%.mp4}.json")
  fi
  awk -v f="$1" -v b="$bytes" -v k="$vkbps" -v m="$vm" -v p="$p1" -v s="$ps" \
    'BEGIN { printf "%-24s %8.1f MB %7d kb/s  VMAF %6s  p1 %6s  PSNR-Y %5s\n", f, b/1048576, k/1000, m, p, s }'
}
echo
echo "ARCHIVO                    TAMAÑO     VÍDEO        CALIDAD FRENTE AL ORIGINAL"
fila "$SRC"; fila "$H264"; fila "$AV1"
awk -v s="$(stat -c %s "$SRC")" -v h="$(stat -c %s "$H264")" -v a="$(stat -c %s "$AV1")" 'BEGIN {
  printf "\nAhorro H.264 web frente al original: %5.1f %%\n", (1-h/s)*100
  printf "Ahorro AV1 frente al original:       %5.1f %%\n", (1-a/s)*100
  printf "Ahorro AV1 frente a H.264 web:       %5.1f %%\n", (1-a/h)*100 }'
```

Ejemplo del formato de salida (las cifras son ilustrativas):

```
ARCHIVO                    TAMAÑO     VÍDEO        CALIDAD FRENTE AL ORIGINAL
lynda_blair_final.mp4      3072.0 MB   12100 kb/s  VMAF      —  p1      —  PSNR-Y     —
lynda_blair_h264.mp4       1350.0 MB    5100 kb/s  VMAF  96.40  p1  92.10  PSNR-Y  43.1
lynda_blair_av1.mp4         880.0 MB    3200 kb/s  VMAF  96.10  p1  91.80  PSNR-Y  42.6

Ahorro H.264 web frente al original:  56.1 %
Ahorro AV1 frente al original:        71.4 %
Ahorro AV1 frente a H.264 web:        34.8 %
```

### A.3 · Regla de decisión

Compara las filas del H.264 y del AV1:

| Situación | Qué hacer |
|---|---|
| VMAF del AV1 **dentro de ±1 punto** del H.264 y ahorro frente al H.264 **≥ 25 %** | **Usar el AV1.** Súbelo junto al MP4 |
| VMAF del AV1 **más de 1 punto por debajo** | Más calidad: repite A.1 con `CRF_AV1=28` (o 26) y vuelve a comparar |
| VMAF del AV1 **más de 1 punto por encima** y ahorro pequeño | Menos peso: repite A.1 con `CRF_AV1=32` y vuelve a comparar |
| A igual VMAF, ahorro **< 25 %** | **No compensa.** Sube solo el MP4 y deja vacío el campo AV1 |
| PSNR-Y de cualquiera **por debajo de 35 dB** | Algo ha alterado el color. Para y avísame |

---

## Opción B (rápida) · Estimación con los mismos fragmentos de 60 s

Sirve para elegir el CRF del AV1 **antes** de lanzar la codificación completa,
que tarda horas. Usa los segundos (`SS`) que elegiste en la guía 01.

```bash
SS=600; DUR=60; mkdir -p pruebas
for CRF in 26 28 30 32; do
  OUT="pruebas/av1_ss${SS}_crf${CRF}.mp4"
  echo "── AV1 CRF $CRF: codificando…"
  time ffmpeg -hide_banner -v error -stats -y -ss "$SS" -t "$DUR" -i "$SRC" -map 0:v:0 -an \
    -vf "$TAG,format=yuv420p10le" \
    -c:v libsvtav1 -preset 4 -crf "$CRF" -g 50 \
    "$OUT"
  echo "── AV1 CRF $CRF: midiendo…"
  ffmpeg -hide_banner -v error -i "$OUT" -ss "$SS" -t "$DUR" -i "$SRC" -lavfi \
    "[0:v]$TAG,format=yuv420p10le,setpts=PTS-STARTPTS[d];[1:v]$TAG,format=yuv420p10le,setpts=PTS-STARTPTS[r];[d][r]libvmaf=n_threads=8:feature=name=psnr:log_fmt=json:log_path=${OUT%.mp4}.json" \
    -f null -
  KBPS=$(( $(ffprobe -v error -show_entries format=bit_rate -of csv=p=0 "$OUT") / 1000 ))
  jq -r --arg c "$CRF" --arg k "$KBPS" '
    ([.frames[].metrics.vmaf] | sort) as $v
    | "RESULTADO AV1 CRF \($c): \($k) kb/s | VMAF media \(.pooled_metrics.vmaf.mean*100|round/100) | p1 \($v[(($v|length)/100|floor)]*100|round/100) | PSNR-Y \(.pooled_metrics.psnr_y.mean*10|round/10) dB"' \
    "${OUT%.mp4}.json"
done
```

Compara cada línea con la del H.264 **del mismo fragmento** y el CRF elegido en
la guía 01 (está en `pruebas/`; si no tienes a mano el resultado, repite la
medición). Busca el CRF de AV1 cuyo VMAF quede a ±1 punto del H.264 y calcula el
ahorro con sus kb/s:

```
ahorro % = (1 − kb/s AV1 / kb/s H.264) × 100
```

Con ese CRF lanza la opción A: la comparación definitiva es siempre la del
vídeo completo.

---

## Verificación del archivo AV1

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,level,pix_fmt,color_space,color_primaries,color_transfer,color_range -of default=nw=1 lynda_blair_av1.mp4
ffprobe -v trace lynda_blair_av1.mp4 2>&1 | grep -m2 -oE "type:'(moov|mdat)'"
```

Tiene que salir `av1`, `Main`, **`level=8`**, `yuv420p10le`, `bt709` en los tres
campos de color y `moov` antes que `mdat`.

> **`level=8` es importante.** Equivale al nivel 4.0, que es lo que la web da por
> hecho al preguntar al navegador (`av01.0.08M.10`). Con 1080p a 25 fps sale
> siempre 8. Si alguna vez sale otro número (por ejemplo, con un vídeo 4K),
> avísame antes de subirlo.

---

**Siguiente paso:** subir los archivos, en la
[guía 03, paso 8](03-configurar-aws.md#paso-8--subir-los-vídeos-reales).
