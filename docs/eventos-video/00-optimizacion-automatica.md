# 00 · Optimizar un vídeo con un solo comando

**Para cada evento nuevo, este es el camino.** Un script hace todo lo que
describen las guías [01](01-optimizar-video-ubuntu.md) y
[02](02-version-av1-y-ahorro.md), con las mismas reglas, y decide la calidad
**midiendo** en lugar de a ojo.

```bash
cd ~/projects/kuadrat
node scripts/video/optimizar-video.mjs /ruta/al/video_final.mp4
```

Al terminar, **junto al original** quedan:

| Archivo | Qué es |
|---|---|
| `<nombre>_h264.mp4` | La versión que se sube **siempre**. Con la grabación de un directo, es una copia del original (ver [«El original como MP4»](#el-original-como-mp4)) |
| `<nombre>_av1.mp4` | La versión AV1. El informe dice si compensa subirla |
| `<nombre>_informe.md` | Mediciones, decisiones, verificaciones y **las URLs y la duración que hay que poner en el evento** |

`<nombre>` es el del original sin el sufijo `_final`, si lo tiene:
`lynda_blair_final.mp4` → `lynda_blair_h264.mp4`.

---

## Requisito (una sola vez)

Un ffmpeg con `libx264`, `libsvtav1` y `libvmaf`. En este portátil ya está
instalado en `~/opt/ffmpeg-master-latest-linux64-gpl/`, y el script lo encuentra
solo. Si algún día falta, el propio script imprime los tres comandos para
instalarlo. No hace falta tocar el `PATH`.

## Qué hace, paso a paso

```
 [1] Herramientas      comprueba ffmpeg y espacio libre
 [2] Inspección        vídeo, color, audio, índice; rechaza lo que no sabe tratar bien
 [3] Análisis          complejidad y luminosidad de cada minuto (~2 min por cada 30 min de vídeo)
                       → elige 3 fragmentos de 30 s: el más COMPLEJO, el más OSCURO
                         con contenido real y uno TÍPICO
 [4] H.264: calidad    prueba CRF 22 → 20 → 18 → 16 en los 3 fragmentos y se queda
                       con el primero (el de menos peso) que cumple en todos
                       VMAF media ≥ 95 y p1 ≥ 90
 [5] MP4: final        codifica el vídeo completo con ese CRF, o COPIA el original si
                       ya es apto para la web y recodificarlo no lo aligera
 [6] AV1: calidad      busca el CRF de menos peso que queda a ±1 punto VMAF del H.264
                       en cada fragmento
 [7] AV1: final        codifica el vídeo completo
 [8] Verificación      códec, nivel, color BT.709, índice al principio, duración, audio
 [9] Calidad total     VMAF y PSNR de los dos archivos completos frente al original
                       (con una copia, solo del AV1)
                       → decide si el AV1 compensa (≥ 25 % menos a igual calidad)
```

Cada medición compara cada fotograma con el del original **del mismo
instante**: con el que tiene la marca de tiempo más cercana. Ver «Para quien
mantenga el script».

En cada medición calcula también la **PSNR de luma** como vigilante del color:
VMAF no detecta un desplazamiento de color, y si la PSNR cae por debajo de
35 dB el script **se detiene**, porque algo habría alterado los colores.

## El original como MP4

Si el original ya es un MP4 que la web reproduce bien, recodificarlo puede
**empeorarlo**: más bytes por espectador y una generación más de pérdida. Es lo
que pasa con las grabaciones de los directos de Agora, que son H.264 High a unos
3 Mb/s.

Por eso, después de elegir el CRF (paso 4), el script compara su bitrate con el
del original **en los mismos fragmentos**. Si se cumplen todas estas
condiciones, **copia el original** en vez de codificarlo. La copia no recodifica
nada: solo etiqueta el color BT.709 y pone el índice al principio.

| Condición | Por qué |
|---|---|
| H.264 High o Main, `yuv420p`, hasta 1080 px de alto y nivel ≤ 4.1 (4.2 a 60 fps) | Lo que cualquier navegador decodifica |
| Audio AAC, o sin audio | Se copia, como siempre |
| Empieza con un fotograma clave en el instante 0, sin lista de edición | Si no, el recorte está mal hecho: repítelo con la [guía 06](06-redifundir-un-directo.md) |
| Un fotograma clave al menos cada 2,5 s | El pase busca en el vídeo al entrar tarde y al corregir la deriva |
| Recodificar ahorra **menos de un 10 %** | Un ahorro menor no compensa la pérdida ni la codificación más larga |

- **El AV1 se busca igual que siempre:** a ±1 punto VMAF, en cada fragmento,
  del H.264 con el CRF elegido. Ese CRF es el listón de «indistinguible»;
  la copia no sirve de referencia, porque VMAF tampoco le da 100 cuando la
  compara consigo misma.
- **La medición completa (paso 9) solo mide el AV1.** Lo da por bueno con una
  media ≥ 94 y un p1 ≥ 90.
- **Si recodificar apenas ahorra pero falla otra condición**, el script lo dice
  en un aviso del informe. Por ejemplo: «tiene una lista de edición…».

## Cuánto tarda

En este portátil (Core Ultra 7 258V), con el vídeo de 34 minutos de Lynda
Blair: **1 h 3 min en total**. 12 minutos el H.264 completo, 24 el AV1, y el
resto en análisis, pruebas y mediciones. El script muestra el progreso y una
estimación antes de cada codificación larga.

Con la grabación de un directo, el MP4 es una copia y tarda segundos. Casi todo
el tiempo se va en el AV1: 74 minutos para los 67 de `entrevista_lorca`.

## Ejemplo real: `lynda_blair_final.mp4` (28/09/2026)

| Versión | CRF | Tamaño | Vídeo | VMAF media | VMAF p1 | PSNR-Y |
|---|---|---|---|---|---|---|
| Original (Premiere) | — | 3074 MB | 12,1 Mb/s | — | — | — |
| `lynda_blair_h264.mp4` | 18 | **1264 MB** (−59 %) | 4,8 Mb/s | 96,4 | 93,7 | 50,6 dB |
| `lynda_blair_av1.mp4` | 28 | **317 MB** (−90 %) | 0,96 Mb/s | 95,4 | 91,4 | 48,9 dB |

- **El H.264 es indistinguible del original**, incluso con fotogramas ampliados
  al 200 %.
- **El AV1 pesa un 75 % menos que el H.264.** Parte del ahorro viene de que alisa
  un poco el grano fino del sensor en las zonas oscuras (de ahí su PSNR algo
  menor). Al 200 % se nota en la pared; a tamaño normal, no. El detalle (rostros,
  pantallas, cables) se conserva y no aparecen bandas en los degradados.
- Un vídeo en blanco y negro, como este, favorece mucho al AV1. Con color el
  ahorro será menor; el script lo mide cada vez.

## Ejemplo real: `entrevista_lorca_final.mp4` (16/10/2026)

Es la grabación de un directo de Agora: 67 minutos después de recortarla con la
[guía 06](06-redifundir-un-directo.md). Las cifras se midieron a mano,
emparejando por la marca más cercana. El AV1 CRF 28 se eligió comparándolo con
el H.264 CRF 22. El script lo compara con el CRF 20 que él elige: en un clip de
6 minutos de la misma grabación eligió AV1 CRF 26, con VMAF 95,17 / p1 91,8 y
un 25,4 % menos que el MP4.

| Versión | CRF | Tamaño | Vídeo | VMAF media | VMAF p1 | PSNR-Y |
|---|---|---|---|---|---|---|
| Original (grabación recortada) | — | 1501 MB | 3,0 Mb/s | — | — | — |
| `entrevista_lorca_h264.mp4` | copia | 1501 MB | 3,0 Mb/s | — | — | — |
| `entrevista_lorca_av1.mp4` | 28 | **827 MB** (−44,9 %) | 1,59 Mb/s | 95,1 | 92,5 | 49,2 dB |

- **Recodificar no ahorraba.** En los fragmentos, el CRF 20 (el que elige el
  script) pesaba un 17,7 % más que la grabación, y el CRF 22 solo un 7,4 %
  menos.
- **La primera versión del script medía mal esta grabación**, porque emparejaba
  los fotogramas sin `ts_sync_mode=nearest`. Eligió CRF 16 (2370 MB) y AV1
  CRF 22 (1265 MB), y tardó 2 h 30 min.

Antes de subir un vídeo nuevo, conviene echar un vistazo rápido a un par de
momentos oscuros de las dos versiones (con `mpv` o VLC). No sustituye a las
mediciones, pero es donde se notaría un problema.

Corre con **prioridad baja** (`nice`), así que puedes seguir usando el portátil.
Para ir más rápido: enchufado y `powerprofilesctl set performance`.

## Si se interrumpe

Vuelve a lanzar **el mismo comando**. Reutiliza el análisis, las pruebas ya
medidas y los archivos finales ya terminados (los guarda en una carpeta oculta
`.<nombre>-optimizacion/` junto al vídeo, que borra al acabar). Un archivo a
medio codificar se llama `…partial.mp4` y se rehace.

## Opciones

| Opción | Para qué |
|---|---|
| `--sin-av1` | Solo la versión H.264 |
| `--rapido` | Se salta el paso 9 (VMAF del archivo completo). La decisión sobre el AV1 se toma entonces solo con el tamaño |
| `--forzar` | Rehace las codificaciones aunque ya existan (por ejemplo, si cambias el original) |
| `--conservar` | No borra la carpeta de trabajo (para depurar) |

## Qué rechaza (y qué hacer)

El script solo trata el caso habitual, y lo trata bien. Ante algo distinto **se
para y lo dice**, en lugar de producir un archivo con los colores mal:

| Mensaje | Qué hacer |
|---|---|
| Vídeo HDR (PQ/HLG o BT.2020) | Exporta desde el editor en SDR Rec.709. Con un Pixel en modo HDR pasa |
| Espacio de color distinto de BT.709 | Exporta en Rec.709 |
| Rango completo (pc) | Exporta con rango de vídeo (limitado) |
| Vídeo entrelazado | Exporta en progresivo |

**Señal de alarma: un p1 que no sube al bajar el CRF.** Por ejemplo, 48 con
CRF 22 y 48 con CRF 16. Lo que falla es la medición, no el original: está
comparando fotogramas desalineados. Si vuelve a pasar, revisa que `measure()`
conserve `ts_sync_mode=nearest` y que las marcas de tiempo del original no
estén desplazadas más de medio fotograma.

Lo que **sí** adapta solo:

- un original de más de 1080 px de alto (4K) se reduce a 1080p;
- un audio que no sea AAC se convierte a AAC de 256 kb/s (si es AAC se copia);
- un índice al final del archivo se mueve al principio;
- un vídeo de 50/60 fps usa el nivel H.264 adecuado.

## Después

1. Abre `<nombre>_informe.md`: la sección **«Siguiente paso»** trae la carpeta
   de S3, las URLs exactas para el formulario del evento y la duración
   recomendada.
2. Sube los archivos
   ([guía 03, paso 8](03-configurar-aws.md#paso-8--subir-los-vídeos-reales)).
3. Crea el evento ([guía 05, apartado 6](05-entornos-y-pruebas.md#6--el-día-del-evento)).

## Para quien mantenga el script

`scripts/video/optimizar-video.mjs` no tiene dependencias. Los umbrales y
parámetros son constantes al principio del fichero, cada una con su motivo. Las
cuatro reglas que **no** se deben tocar sin volver a medir:

- **El color se etiqueta con `setparams`**, nunca con `-colorspace` ni
  `-color_*` como opciones de salida: con un original sin etiquetar, esas
  opciones convierten los colores.
- **Las dos entradas de cada VMAF llevan la misma etiqueta.** Si no, ffmpeg
  convierte una antes de comparar y el resultado sale falso.
- **La PSNR de luma se mide siempre**, porque VMAF no detecta los errores de
  color.
- **Cada fotograma se empareja con el del original de marca de tiempo más
  cercana** (`ts_sync_mode=nearest`). Las grabaciones de Agora llevan las
  marcas redondeadas al milisegundo, y el codificador las pone en la rejilla
  exacta. Con el modo por defecto («≤»), uno o dos de cada tres fotogramas se
  comparaban con el anterior: p1 de 48 con cualquier CRF. Con un original en
  rejilla exacta, como lynda_blair, los dos modos dan las mismas cifras.

Están demostradas con números en la guía [01](01-optimizar-video-ubuntu.md).

Además, **la frecuencia de salida se fija con `-r`** en la estándar más
cercana a la media real del original (`STANDARD_RATES`, hasta un 1,5 % de
diferencia).

- Sin `-r`, ffmpeg codifica un MP4 a la frecuencia que estima de las primeras
  marcas (`r_frame_rate`).
- En un clip de una grabación de Agora estimó 29,92 fps, retemporizó el vídeo y
  quitó 29 fotogramas de 10 799. Las pruebas daban VMAF 73 con cualquier CRF.
- El paso 2 muestra la frecuencia elegida y la que estimaba ffmpeg cuando no
  coinciden.

Cambiar `MEASURE_VERSION` descarta las pruebas guardadas de una ejecución
interrumpida. Hay que hacerlo cada vez que cambie la forma de medir o de
codificar las pruebas.
