Todas las tareas de código son en `scripts/video/optimizar-video.mjs`. No se toca la API, el cliente ni el esquema de la base de datos, y no hay tareas de alto riesgo sobre infraestructura compartida.

## 1. Medición corregida

- [x] 1.1 En `measure()`, añadir `:ts_sync_mode=nearest` a las opciones de `libvmaf` (afecta a los fragmentos y al archivo completo) y documentar la cuarta regla medida en el comentario de cabecera, junto a las otras tres: emparejar por la marca más cercana. Verificable: el `lavfi` generado contiene la opción.
- [x] 1.2 En `findFfmpeg()`, descartar el candidato si `ffmpeg -hide_banner -h filter=libvmaf` no menciona `ts_sync_mode`. El mensaje de fallo del paso 1 sigue siendo el de instalación.
- [x] 1.3 Añadir la constante `MEASURE_VERSION = 2`, escribirla en `fuente.json` y descartar la carpeta de trabajo cuando la versión guardada falte o no coincida, en la misma rama que hoy detecta un original cambiado.
- [x] 1.4 (Añadida al verificar, ver la decisión 9 del diseño.) Fijar la frecuencia de salida:
  - añadir `STANDARD_RATES` y calcular `outRate`: la estándar más cercana a `fps` que quede a ≤ 1,5 %, o `null`;
  - añadir `-r outRate` a `h264VideoArgs()` y `av1VideoArgs()`;
  - en el paso 2, mostrar la frecuencia elegida (y la estimada por ffmpeg si difiere), o un aviso si no hay ninguna;
  - subir `MEASURE_VERSION` a 3.

## 2. Decisión entre copiar y codificar el MP4

- [x] 2.1 Añadir las constantes `MP4_COPY_MIN_SAVINGS = 0.10` y `COPY_KEYINT_TOLERANCE = 0.5` (segundos; al implementarla se midió que Agora llega a 2,099 s entre claves, así que 0,1 quedaba a 1 ms del límite), cada una con su motivo en el comentario, como las demás.
- [x] 2.2 Añadir una función que recorra una sola vez los paquetes de vídeo del original (`ffprobe -select_streams v:0 -show_entries packet=pts_time,flags,size -of csv=p=0`). Debe devolver:
  - si el primer paquete es clave y su marca;
  - si algún paquete lleva `D`;
  - el intervalo máximo entre claves;
  - los bytes de vídeo de cada fragmento de prueba (`[start, start + len)`).
- [x] 2.3 Añadir la función de aptitud para la copia. Devuelve `{ ok, motivo }` y comprueba, en este orden:
  - códec `h264`, perfil `High`/`Main`, `yuv420p`, sin `scaleDown` y nivel ≤ `h264Level`;
  - audio AAC o ausente;
  - primer paquete clave con marca ≥ 0;
  - ningún `D`;
  - intervalo máximo entre claves ≤ `gop / fps + COPY_KEYINT_TOLERANCE`.

  Cada motivo es una frase en español apta para el informe.
- [x] 2.4 Tras el paso 4, calcular la suma de `kbps` de `h264Results` y la del original en los mismos fragmentos, y fijar `mp4Mode = 'copia' | 'codificación'`:
  - copia si es apto y el ahorro es `< MP4_COPY_MIN_SAVINGS`;
  - mostrar en pantalla los dos totales, el porcentaje y la decisión;
  - si no es apto y el ahorro es insuficiente, mostrar el motivo con `warn`.
- [x] 2.5 Añadir `copyOriginal(out)`, que se ejecuta siempre (sin reutilizar el archivo existente):
  - `-map 0:v:0`, más `-map 0:a:0` si hay audio;
  - `-c copy`;
  - `-bsf:v h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0`;
  - `-movflags +faststart`;
  - escritura en `.partial.mp4` y `renameSync`.
- [x] 2.6 Paso 5: llamar a `copyOriginal(outH264)` o a `encodeFinal('h264', …)` según `mp4Mode`, con un título del paso que lo diga. Comprobar que el paso 6 (AV1) sigue usando `h264Results` como objetivo y codificando desde `input`.

## 3. Verificación, medición completa e informe

- [x] 3.1 En `verify()`, con `mp4Mode === 'copia'`:
  - aceptar el perfil `High` o `Main` y mostrar el nivel real;
  - añadir la comprobación «mismos fotogramas que el original» (`nb_frames` de la salida frente a `vs.nb_frames`).
- [x] 3.2 Paso 9 en modo copia: medir solo el AV1 frente al original. El H.264 queda fuera del bucle y del caché `completo_h264.json`.
- [x] 3.3 Veredicto del AV1 en modo copia: `qualityOk` pasa a ser `full.av1.mean >= VMAF_MIN_MEAN - AV1_MAX_VMAF_DROP && full.av1.p1 >= VMAF_MIN_P1`, con un texto de «No lo subas» que hable del listón y no del H.264. Con `--rapido`, el veredicto sigue apoyándose solo en el tamaño.
- [x] 3.4 Informe en modo copia:
  - fila del MP4 como «H.264 (copia del original)», con calidad «—»;
  - una frase con la decisión, los dos totales en kb/s y el porcentaje;
  - sin la línea «Ahorro H.264 frente al original»;
  - el ahorro del AV1, frente al MP4.

  En modo codificación, el informe queda igual que hoy, salvo la línea del motivo cuando no se copió por aptitud.
- [x] 3.5 Resumen final en consola: indicar «copia del original» en la línea del MP4 cuando corresponda.

## 4. Verificación con vídeos reales (sin runner de tests para `scripts/`)

- [x] 4.1 Regresión en rejilla exacta: medir un fragmento de 30 s de `lynda_blair_h264.mp4` frente a `lynda_blair_final.mp4` con `ts_sync_mode=default` y con `nearest`, usando el mismo `lavfi` de `measure()`. Las dos cifras deben coincidir.
- [x] 4.2 Clip de Agora por la vía de la copia:
  - recortar ~6 min de `entrevista_lorca_h264.mp4` en un fotograma clave exacto con los comandos de la guía 06 (tarea 5.4) a `~/utils/140d/prueba_lorca/prueba_lorca_final.mp4`, y lanzar el script completo.
  - Esperado: ningún CRF de reserva, p1 ≥ 90 en todos los fragmentos, modo copia y todas las verificaciones en ✓ (incluida la de fotogramas).
  - También: un AV1 completo con media ≥ 94 y p1 ≥ 90, y un informe con el MP4 como copia.
- [x] 4.3 Rechazo por lista de edición: recortar el mismo clip con `-ss` un segundo después de un fotograma clave y `-c copy`, y lanzar el script con `--sin-av1 --rapido`. Esperado: modo codificación, con el motivo «lista de edición» en pantalla y en el informe.
- [x] 4.4 Invalidación de la carpeta de trabajo: dejar en `.prueba_lorca-optimizacion/` un `fuente.json` sin `measure` (con el tamaño y la fecha correctos; se hizo sobre el clip de la 4.3, `.prueba_lorca_ed-optimizacion/`) y una prueba ficticia en `pruebas/`. Al relanzar, el script debe descartarla y volver a medir.
- [x] 4.5 Herramienta sin la opción: ejecutar el script con `HOME` apuntando a una carpeta vacía y `PATH=/usr/bin:/bin` (el ffmpeg de apt). Debe detenerse en el paso 1 si ese ffmpeg no admite `ts_sync_mode` o no tiene `libvmaf`. Si el de apt sí la admite, anotarlo y revisar la rama a mano.
- [x] 4.6 Borrar `~/utils/140d/prueba_lorca/` al terminar las verificaciones.

## 5. Documentación (`docs/eventos-video/`)

- [x] 5.1 `01-optimizar-video-ubuntu.md`:
  - añadir `:ts_sync_mode=nearest` a los dos comandos con `libvmaf` (pasos 5 y 8);
  - añadir un punto en «Lo que NO hay que hacer»: medir sin emparejar por la marca más cercana. Lleva el caso de Agora y el diagrama de marcas;
  - añadir en «Cómo leer el resultado» la señal de alarma: un p1 que no sube al bajar el CRF.
- [x] 5.2 `02-version-av1-y-ahorro.md`: añadir `:ts_sync_mode=nearest` a los dos comandos con `libvmaf` (A.2 y opción B).
- [x] 5.3 `00-optimizacion-automatica.md`:
  - en el diagrama de pasos, el paso 5 pasa a ser «H.264: final, o copia del original»;
  - nuevo apartado «El original como MP4» con las condiciones y el margen del 10 %;
  - `entrevista_lorca` como segundo ejemplo real: copia de 1501 MB y AV1 CRF 28 de 827 MB (−44,9 %), con VMAF 95,14 / p1 92,49 / PSNR-Y 49,2 dB;
  - la cuarta regla en «Para quien mantenga el script»;
  - la señal de alarma del p1.
- [x] 5.4 Nueva `06-redifundir-un-directo.md`, autocontenida:
  1. descargar la grabación desde el panel de admin antes de que caduque en el bucket;
  2. localizar el inicio y el fin con `mpv`;
  3. listar los fotogramas clave cercanos con `ffprobe -select_streams v:0 -skip_frame nokey -show_entries frame=pts_time -read_intervals …`;
  4. cortar con `-ss <instante exacto del clave> -to <fin> -i … -map 0:v:0 -map 0:a:0 -c copy`;
  5. comprobar que el primer paquete es `K` con marca 0 y que no hay `D`;
  6. lanzar el script.

  Incluye por qué el corte va en el instante exacto, con el caso de 44 s → 42 s y la lista de edición, y que la lista de edición trivial del audio es normal.
- [x] 5.5 `README.md`: añadir la guía 06 a la tabla y una línea en «Para cada evento nuevo» para el caso de la redifusión de un directo.

## 6. Conocimiento del área

- [x] 6.1 `.claude/rules/events/video-cdn.md`, en el punto «Codificación»:
  - añadir la cuarta regla medida (emparejar por la marca más cercana, con el porqué: marcas al milisegundo de Agora y rejilla del codificador);
  - añadir el criterio del modo copia (aptitud, margen del 10 % y AV1 con el objetivo del CRF elegido).

  Sus `paths:` ya cubren `scripts/video/**` y `docs/eventos-video/**`.
- [x] 6.2 Ejecutar `node scripts/check-claude-rules.mjs` y corregir lo que señale (la guía 06 nueva es una ruta citada).
