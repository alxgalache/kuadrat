# event-video-encoding Specification

## Purpose

Definir cómo `scripts/video/optimizar-video.mjs` prepara los archivos de un evento pregrabado: medición VMAF con emparejamiento por la marca más cercana, frecuencia de salida fijada, copia del original como MP4 cuando recodificarlo no lo aligera, AV1 con la calidad del H.264 elegido, y la guía para redifundir la grabación de un directo.

## Requirements

### Requirement: Emparejamiento de fotogramas en la medición de calidad

Toda medición VMAF de `scripts/video/optimizar-video.mjs`, tanto la de los fragmentos de prueba como la del archivo completo, SHALL emparejar cada fotograma del vídeo medido con el fotograma del original de marca de tiempo **más cercana** (`ts_sync_mode=nearest` del filtro `libvmaf`), nunca con el modo por defecto («≤»). Las dos entradas SHALL seguir llevando la misma etiqueta de color y reiniciando su reloj con `setpts=PTS-STARTPTS`. Los comandos manuales equivalentes de `docs/eventos-video/01-optimizar-video-ubuntu.md` y `docs/eventos-video/02-version-av1-y-ahorro.md` SHALL usar la misma opción.

#### Scenario: Grabación de Agora con marcas al milisegundo
- **WHEN** el original es una grabación de Agora Cloud Recording cuyas marcas avanzan 33, 33 y 34 ms, y el vídeo codificado tiene sus fotogramas en la rejilla exacta de 1/30 s
- **THEN** cada fotograma codificado se compara con el fotograma del original del mismo instante
- **AND** el fragmento «típica» de `entrevista_lorca` (H.264 CRF 22) mide VMAF ≈ 94,4 y p1 ≈ 92, no 87,2 y 48,3

#### Scenario: Original en rejilla exacta
- **WHEN** el original tiene sus marcas exactas en la rejilla de su frecuencia, como una exportación de Premiere
- **THEN** la medición da las mismas cifras que con el modo por defecto

#### Scenario: Comparar un archivo consigo mismo
- **WHEN** se mide un archivo frente a sí mismo
- **THEN** la PSNR de luma de cada fotograma medido está en el máximo de su profundidad de bits

### Requirement: Frecuencia de salida de las codificaciones

Toda codificación del script, sea de prueba o final, H.264 o AV1, SHALL fijar la frecuencia de salida (`-r`) en la frecuencia estándar (`24000/1001`, `24`, `25`, `30000/1001`, `30`, `50`, `60000/1001` o `60`) más cercana a la frecuencia media real del original (`avg_frame_rate`). La condición es que quede a ≤ 1,5 % de esa media. Si ninguna lo está, el script SHALL no fijarla y SHALL avisar en el informe. El paso 2 SHALL mostrar la frecuencia elegida y, si difiere, la que estimaba ffmpeg (`r_frame_rate`).

#### Scenario: Grabación de Agora con una estimación equivocada
- **WHEN** el original es un clip de una grabación de Agora con una media de 29,997 fps y `r_frame_rate` estimado en 359/12
- **THEN** las codificaciones salen a 30 fps con el mismo número de fotogramas que el original, sin que ffmpeg retemporice ni descarte ninguno

#### Scenario: Exportación a 25 fps exactos
- **WHEN** el original es una exportación de Premiere a 25 fps
- **THEN** las codificaciones salen a 25 fps, como antes

#### Scenario: Frecuencia no estándar
- **WHEN** la frecuencia media del original es 15 fps
- **THEN** el script no fija `-r` y el informe lleva un aviso con la estimación de ffmpeg que se usa

### Requirement: ffmpeg con emparejamiento por la marca más cercana

Al localizar ffmpeg, el script SHALL aceptar solo un candidato cuyo filtro `libvmaf` admita la opción `ts_sync_mode` (según `ffmpeg -h filter=libvmaf`), además de `libx264`, `libsvtav1` y `libvmaf`. Si ningún candidato la admite, SHALL detenerse antes de analizar nada y mostrar los comandos de instalación del ffmpeg estático.

#### Scenario: ffmpeg sin la opción
- **WHEN** el único ffmpeg disponible tiene `libvmaf` pero no la opción `ts_sync_mode`
- **THEN** el script se detiene en el paso 1 con el mensaje de instalación y no ejecuta ninguna medición

### Requirement: Elección entre copiar el original y codificar el MP4

Después de elegir el CRF del H.264 con los fragmentos (paso 4, sin cambios), el script SHALL publicar como `<nombre>_h264.mp4` una **copia del original** en lugar de una codificación cuando se cumplan **todas** estas condiciones:

- **Vídeo apto para la web:** `h264`, perfil `High` o `Main`, `yuv420p`, alto ≤ 1080 px y nivel ≤ el que el script asignaría (4.1 hasta 30 fps, 4.2 hasta 60 fps).
- **Audio** AAC, o sin audio.
- **Recorte limpio:** el primer paquete de vídeo es un fotograma clave con marca ≥ 0, y ningún paquete de vídeo lleva la marca de descarte de una lista de edición.
- **GOP corto:** el intervalo máximo entre fotogramas clave no supera el GOP del script (2 s) más 0,5 s.
- **Sin ahorro suficiente:** la suma de los bitrates del CRF elegido en los fragmentos de prueba ahorra menos de un 10 % (`MP4_COPY_MIN_SAVINGS`) frente a la suma de los bitrates del original en esos mismos fragmentos.

Si alguna condición no se cumple, el script SHALL codificar el MP4 como hasta ahora. Cuando el ahorro sea insuficiente pero una condición de aptitud falle, el informe SHALL nombrar la condición que impidió la copia.

#### Scenario: Grabación de un directo de Agora
- **WHEN** el original es la grabación recortada de `entrevista_lorca` (H.264 High 4.0, yuv420p, AAC, GOP de 2 s, sin lista de edición) y el CRF elegido pesa 10 607 kb/s en los fragmentos frente a 9012 del original
- **THEN** `<nombre>_h264.mp4` es una copia del original y el script no ejecuta la codificación final del H.264

#### Scenario: Exportación pesada de un editor
- **WHEN** el original es una exportación H.264 a 12 Mb/s y el CRF elegido ahorra más del 10 % en los fragmentos
- **THEN** el script codifica el MP4 con ese CRF, como hasta ahora

#### Scenario: Recorte con lista de edición
- **WHEN** el original se recortó con `-ss` y `-c copy` fuera de un fotograma clave y sus primeros paquetes tienen marca negativa y la marca de descarte
- **THEN** el script codifica el MP4
- **AND** el informe dice que no copió por la lista de edición y remite a la guía de redifusión

#### Scenario: GOP largo
- **WHEN** el original es H.264 apto para la web y ligero, pero tiene fotogramas clave cada 10 s
- **THEN** el script codifica el MP4 y el informe dice que no copió por el intervalo entre fotogramas clave

#### Scenario: Ahorro justo por debajo del margen
- **WHEN** el CRF elegido ahorra un 7,4 % frente al original en los fragmentos y el original cumple las condiciones de aptitud
- **THEN** el script copia el original

### Requirement: Copia del original como MP4

La copia SHALL:

- tomar la primera pista de vídeo y, si existe, la primera de audio, sin recodificar ninguna (`-c copy`);
- etiquetar el color como BT.709 de rango limitado **en el flujo H.264**, con el filtro de bitstream `h264_metadata`, nunca solo con opciones de contenedor;
- poner el índice (`moov`) al principio;
- escribirse como `<nombre>_h264.partial.mp4` y renombrarse al terminar;
- rehacerse en cada ejecución, en lugar de reutilizar un `<nombre>_h264.mp4` existente.

El AV1 SHALL seguir codificándose desde el original.

#### Scenario: Copia de una grabación sin etiqueta de color
- **WHEN** se copia una grabación sin color etiquetado y con rango tv
- **THEN** `ffprobe` informa en `<nombre>_h264.mp4` `color_primaries`, `color_transfer` y `color_space` `bt709` con `color_range` `tv`, y el `moov` va antes que el `mdat`

#### Scenario: Un MP4 codificado de una ejecución anterior
- **WHEN** existe un `<nombre>_h264.mp4` codificado en una ejecución anterior y ahora la decisión es copiar
- **THEN** el script lo sustituye por la copia y el informe describe el archivo que queda en disco

### Requirement: Calidad objetivo del AV1

El script SHALL buscar el CRF del AV1 con el mismo criterio en los dos modos: el de menos peso que, en cada fragmento, queda a ±1 punto VMAF de los resultados del CRF de H.264 elegido en el paso 4, con p1 ≥ 90. En modo copia, el objetivo SHALL ser ese CRF elegido, no la copia.

#### Scenario: AV1 de una grabación copiada
- **WHEN** el MP4 es una copia del original y el CRF de H.264 elegido midió 94,40 / p1 92,17 en el fragmento «típica»
- **THEN** el AV1 se compara con esas cifras en ese fragmento, y no con la medición de la copia frente a sí misma

### Requirement: Verificación, medición completa y veredicto en modo copia

En modo copia, el script SHALL:

- aceptar en la verificación del MP4 el perfil `High` o `Main` y mostrar el nivel real;
- comprobar además que su número de fotogramas coincide con el del original;
- mantener las comprobaciones de color, índice, duración y audio;
- en la medición del archivo completo, medir solo el AV1 frente al original;
- dar por buena la calidad del AV1 si su media es ≥ `VMAF_MIN_MEAN − AV1_MAX_VMAF_DROP` (94) y su p1 ≥ `VMAF_MIN_P1` (90);
- calcular el ahorro del AV1 frente al MP4 publicado.

El informe SHALL identificar el MP4 como copia del original, explicar la decisión con los dos totales de bitrate y su diferencia en porcentaje, y omitir el ahorro del H.264 frente al original.

#### Scenario: Informe de una redifusión
- **WHEN** el script termina en modo copia con un AV1 de VMAF 95,14 / p1 92,49 que pesa un 44,9 % menos que el MP4
- **THEN** el informe muestra el MP4 como copia con su motivo, el AV1 con sus mediciones y el veredicto «Súbelo»
- **AND** «Siguiente paso» lista las dos URLs y la duración recomendada, como hasta ahora

#### Scenario: Copia con fotogramas perdidos
- **WHEN** la copia tiene un número de fotogramas distinto del original
- **THEN** la verificación lo marca con ⚠ y el aviso aparece en el informe

#### Scenario: AV1 por debajo del listón absoluto
- **WHEN** en modo copia el AV1 completo mide una media de 93,5
- **THEN** el veredicto es «No lo subas» y el informe dice que su calidad queda por debajo del listón

### Requirement: Mediciones guardadas con el emparejamiento anterior

`fuente.json`, en la carpeta de trabajo `.<nombre>-optimizacion/`, SHALL registrar una versión de medición. El script SHALL descartar la carpeta entera cuando esa versión falte o no coincida con la suya, igual que cuando cambia el original.

#### Scenario: Reanudar una ejecución interrumpida antes de la corrección
- **WHEN** existe una carpeta de trabajo con pruebas medidas por la versión anterior del script
- **THEN** el script la descarta y vuelve a medir todas las pruebas con el emparejamiento por la marca más cercana

### Requirement: Guía de redifusión de un directo

`docs/eventos-video/06-redifundir-un-directo.md` SHALL describir el paso de la grabación de un directo a los archivos de la redifusión:

- descargar la grabación del panel de admin antes de que caduque en el bucket;
- localizar el inicio y el fin;
- listar los fotogramas clave cercanos al inicio;
- cortar sin recodificar con `-ss` en el instante exacto de un fotograma clave y `-to` en el fin, ambos como opciones de entrada, con `-c copy`;
- comprobar que el primer paquete de vídeo es un fotograma clave con marca 0 y que ninguno lleva la marca de descarte;
- lanzar el script.

La guía SHALL explicar por qué el corte va en el instante exacto del fotograma clave. `docs/eventos-video/README.md` SHALL enlazarla, y `docs/eventos-video/00-optimizacion-automatica.md` SHALL explicar el modo copia, incluir `entrevista_lorca` como ejemplo real y describir como señal de alarma un p1 que no sube al bajar el CRF.

#### Scenario: Recorte siguiendo la guía
- **WHEN** el operador recorta una grabación de Agora con los comandos de la guía 06 y lanza el script sobre el resultado
- **THEN** el archivo cumple la condición de recorte limpio del modo copia y el script copia el original
