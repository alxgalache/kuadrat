## Context

`scripts/video/optimizar-video.mjs` prepara el vídeo de un evento pregrabado. Elige el CRF del H.264 midiendo VMAF en tres fragmentos de 30 s; luego busca el CRF del AV1 que queda a ±1 punto del H.264 en cada fragmento, codifica, verifica y mide el archivo completo. Lo diseñamos y validamos con una exportación de Premiere (`lynda_blair`, 28/09/2026), cuyas marcas de tiempo caen exactas en la rejilla de 25 fps.

La primera redifusión de un directo (`entrevista_lorca`, 16/10/2026) tomaba como fuente una grabación de Agora Cloud Recording: H.264 High 4.0, 1920×1080, ~3 Mb/s casi constantes, GOP de 2 s, AAC mono y el índice al principio. Hay dos hechos medidos que explican el fallo:

1. **Las marcas de tiempo no comparten rejilla.** La grabación lleva 0, 2970, 5940, 9000… en 1/90000, es decir, 0, 33, 66 y 100 ms. Las salidas del codificador llevan 0, 512, 1024… en 1/15360, es decir, la rejilla exacta de 1/30 s. Los dos tienen los mismos fotogramas (121 042) y ninguno duplicado: solo difieren las marcas, hasta 0,67 ms.
2. **El filtro de medición empareja por defecto con «≤».** `libvmaf` usa `framesync`. Para cada fotograma de la primera entrada (el codificado), toma el de la segunda (el original) con la marca más cercana **menor o igual**. `setpts=PTS-STARTPTS` reinicia los dos relojes en cada fragmento, y según el fotograma en que caiga el inicio el original queda unas décimas de milisegundo por detrás. Entonces se elige el fotograma anterior en uno o dos de cada tres:

```
original         0    34    67   100   134   167   200
codificado       0  33,3  66,7   100 133,3 166,7   200
default (≤)      0     0    34   100   100   134   200   ← compara con el anterior
nearest          0    34    67   100   134   167   200   ← siempre el suyo
```

En una entrevista, dos fotogramas seguidos son casi iguales y la media solo baja unos puntos. En cada gesto o cambio de plano, en cambio, la comparación con el anterior se hunde, y con ella el p1. La señal es un p1 que no mejora al subir la calidad: 48,31 con CRF 22 y 48,57 con CRF 16.

Además, la grabación pesa casi lo mismo en todos los fragmentos (2991, 3019 y 3002 kb/s en compleja, oscura y típica). Los CRF que cumplen los umbrales con la medición corregida pesan más:

| | compleja | oscura | típica | total |
|---|---|---|---|---|
| Grabación | 2991 | 3019 | 3002 | 9012 kb/s |
| H.264 CRF 22 | 3119 | 2183 | 3039 | 8341 (−7,4 %) |
| H.264 CRF 20 (el que elige el script corregido) | 3974 | 2861 | 3772 | 10607 (+17,7 %) |

**Tercer hecho, descubierto al verificar la implementación con un clip de 6 min de la misma grabación:** el codificador no siempre respeta los fotogramas.

- Un MP4 se codifica a frecuencia constante, y sin `-r` ffmpeg toma la de `r_frame_rate`, que es una **estimación** a partir de las primeras marcas.
- Con la entrevista completa salió 30/1, y por eso los fotogramas coincidían.
- Con el clip, que empieza en otro punto, salió 359/12 (29,92 fps). ffmpeg retemporizó el vídeo y **quitó 29 fotogramas de 10 799**. Aun emparejando por la marca más cercana, todas las pruebas daban VMAF ~73 y PSNR ~36 dB, con cualquier CRF.
- Con `-r 30`, el mismo fragmento da 96,30 / p1 94,96 / 48,1 dB.

No era solo la medición: el producto también perdía fotogramas. Ver la decisión 9.

No hay runner de tests para `scripts/`, y el script es un único módulo con `await` en el nivel superior. Se verifica con las grabaciones reales, igual que se verificó al entregarlo.

## Goals / Non-Goals

**Goals:**

- Que la medición empareje bien cualquier original, esté o no en la rejilla exacta, sin cambiar el resultado de los que ya lo están.
- Que, cuando el original ya es un MP4 H.264 apto para la web y recodificarlo no ahorra, el MP4 publicado sea el original copiado, sin pérdida de generación y sin la codificación más larga.
- Que el AV1 persiga la misma calidad que hoy en los dos casos.
- Que recortar una grabación de un directo sin recodificar esté documentado, trampa incluida.

**Non-Goals:**

- Recortar dentro del script, copiar originales que no son H.264 apto para la web o cuyo audio no es AAC, cambiar umbrales o parámetros de los códecs, añadir tests automáticos del script (ver la propuesta).

## Decisions

### 1. Emparejar por la marca más cercana: `ts_sync_mode=nearest` en `measure()`

`measure()` construye el `libvmaf` de todas las mediciones (fragmentos y archivo completo), así que el cambio está en un solo sitio y añade `:ts_sync_mode=nearest`. Con originales en rejilla exacta, «≤» y «nearest» eligen el mismo fotograma. Con originales desplazados menos de medio fotograma (16,7 ms a 30 fps), «nearest» elige siempre el correcto.

Lo medido: el fragmento «típica» con H.264 CRF 22 pasa de 87,22 / p1 48,31 a 94,40 / p1 92,17. Con AV1 CRF 28 da 94,50 / 92,31. Comparado consigo mismo en el archivo completo (1 de cada 5 fotogramas), el MP4 da la PSNR máxima de 10 bits en los 24 209 fotogramas, es decir, cada uno se empareja con su igual.

Alternativas descartadas:

- **`-fps_mode passthrough` al codificar:** el archivo sale idéntico, porque el redondeo lo impone la base de tiempos del codificador (1/30), no el modo de fotogramas.
- **Conservar las marcas del original en la salida** (cambiar la base de tiempos del codificador): arreglaría la medición cambiando el producto y dejaría el fallo listo para el siguiente original con otras marcas. La medición tiene que ser robusta por sí misma.
- **Renumerar las dos entradas por índice** (`setpts=N/FRAME_RATE/TB`): empareja por posición, no por tiempo. Si el codificador quitara o duplicara un solo fotograma, como puede pasar con un original de frecuencia variable, todo lo que viniera detrás quedaría desalineado. «nearest» empareja por lo que el espectador ve en cada instante.
- **Activar «nearest» solo si se detecta un original fuera de la rejilla:** sería una rama más que no aporta nada, porque en la rejilla los dos modos coinciden.

Las guías 01 y 02 tienen los mismos comandos a mano (cuatro `libvmaf` en total) y añaden la misma opción.

### 2. Comprobar la opción al localizar ffmpeg

`findFfmpeg()` ya exige `libx264`, `libsvtav1` y `libvmaf`. Ahora exige también que `ffmpeg -h filter=libvmaf` mencione `ts_sync_mode`. Un ffmpeg sin la opción fallaría en la primera medición con un error de opción desconocida, tras minutos de análisis. Así se descarta como candidato, y si no queda ninguno el script imprime los comandos de instalación de siempre.

### 3. El original como MP4: cuándo

El paso 4 no cambia: prueba CRF 22 → 16 en los fragmentos y elige el primero que cumple. Justo después, el script decide si **copia** el original o **codifica** el CRF elegido. Copia si se cumplen todas estas condiciones:

- **Apto para la web, con los datos de `ffprobe` que ya lee el paso 2:**
  - vídeo `h264`, perfil `High` o `Main`, `yuv420p`, sin reducción de tamaño (alto ≤ 1080);
  - nivel ≤ el que el script pondría (4.1 hasta 30 fps y 4.2 hasta 60);
  - audio AAC o ninguno.

  El color ya lo filtra el paso 2: BT.709 o sin etiquetar, y nunca rango completo.
- **Recorte limpio y GOP corto, con un solo recorrido de los paquetes de vídeo** (`ffprobe -show_entries packet=pts_time,flags,size`, 0,6 s en la grabación de 68 min):
  - el primer paquete es un fotograma clave con marca ≥ 0;
  - ningún paquete lleva la marca de descarte (`D`), que es lo que deja una lista de edición. Medido: `-ss 44 -c copy` produjo paquetes con marca negativa y `D` desde el fotograma clave de 42 s;
  - el intervalo máximo entre fotogramas clave es ≤ el GOP del script (2 s) más 0,5 s de tolerancia. La tolerancia absorbe los fotogramas sueltos que pierde una grabación de Agora: sus claves llegan a estar a 2,099 s (medido en `entrevista_lorca`), y un GOP largo de verdad, de 5 o 10 s, sigue quedando fuera. Al entrar tarde y al corregir la deriva, el pase busca una posición del vídeo: la copia no puede buscar peor que la codificación a la que sustituye.
- **No ahorra lo suficiente:** la suma de los bitrates del CRF elegido en los fragmentos (que el paso 4 ya mide) ahorra menos de `MP4_COPY_MIN_SAVINGS = 0.10` frente a la suma de los bitrates del original **en esos mismos fragmentos**. Esa suma sale del mismo recorrido de paquetes.

Por qué un margen del 10 % y no del 0 %:

- recodificar siempre cuesta una generación de calidad y el paso más largo del proceso;
- tres fragmentos de 30 s estiman el archivo completo con cierto error.

Con `entrevista_lorca` se copia incluso si el CRF elegido fuera el 22 (−7,4 %).

Alternativas descartadas:

- **Comparar con el bitrate medio del archivo completo:** mezcla tramos distintos de los medidos. Los mismos fragmentos son una comparación de igual a igual, y entre ellos está el minuto más complejo, que es donde un original con picos se delataría.
- **Copiar siempre que el original sea H.264 apto para la web:** una exportación de Premiere a 12 Mb/s se subiría tal cual, con 2,5 veces más bytes por espectador.
- **Comprobar además el pico de bitrate (VBV):** queda cubierto por el fragmento más complejo y por la comparación de bitrates. Sería otra pieza sin un caso que la pida.

### 4. El original como MP4: cómo

```
ffmpeg -i <original> -map 0:v:0 [-map 0:a:0] -c copy \
  -bsf:v h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0 \
  -movflags +faststart <nombre>_h264.mp4.partial → rename
```

- **El color va en el propio flujo H.264** (la VUI del SPS), igual que lo escribe x264, y `ffprobe` lo lee como bt709/tv. Lo verificamos con `entrevista_lorca`.
  - En una copia no hay conversión posible, pero las opciones `-color_*` solo marcarían el contenedor. El *bitstream filter* deja una sola fuente de verdad.
  - El paso 2 ya rechaza el rango completo, así que `video_full_range_flag=0` nunca contradice al original.
- **El archivo de salida conserva el nombre de siempre (`<nombre>_h264.mp4`)**, para que las URLs del informe, las guías y el formulario no cambien. El informe dice que es una copia.
- **Se escribe como `.partial.mp4` y se renombra al acabar**, como las codificaciones. Pero **se rehace siempre** en vez de reutilizarse: tarda segundos, y así un `_h264.mp4` codificado en una ejecución anterior nunca pasa por copia. Al revés, en modo codificación, la reutilización de un `_h264.mp4` existente sigue igual que hoy. Para el mismo original la decisión es siempre la misma, y si el original cambia hay que usar `--forzar`, como ya dice la guía 00.
- **El AV1 se sigue codificando desde el original.** Los fotogramas son los mismos que los de la copia: el filtro solo toca metadatos.

### 5. Qué calidad persigue el AV1 en modo copia

**La de siempre:** a ±1 punto VMAF, en cada fragmento, de los resultados del CRF de H.264 elegido en el paso 4, y con p1 ≥ 90. El código del paso 6 no cambia.

Ese CRF representa el listón que el script considera «indistinguible», medido. La copia es mejor que ese listón, pero no sirve de referencia. Comparada consigo misma, VMAF da 98,2 y no 100: si el objetivo fuera «a ±1 de la copia», el AV1 tendría que alcanzar 97,2, y el script acabaría en el CRF mínimo con un archivo mucho más pesado sin diferencia visible.

Alternativa descartada: **umbrales absolutos (≥ 95 / ≥ 90).** Exigirían al AV1 más que al H.264 en los fragmentos donde el propio H.264 elegido queda por debajo de 95. En «típica», el H.264 CRF 22 da 94,40 y el AV1 CRF 28 da 94,50, así que el AV1 bajaría a CRF 26 o 24 sin motivo. El CRF 28 se validó en el archivo completo: VMAF 95,14 / p1 92,49 / PSNR-Y 49,2 dB.

### 6. Verificación, medición completa e informe en modo copia

- **Verificación (paso 8):**
  - El perfil del MP4 se acepta si es `High` o `Main`, y el informe muestra el nivel real (4.0 en Agora).
  - Se añade una comprobación solo para la copia: el número de fotogramas (`nb_frames`) coincide con el del original.
  - Las demás comprobaciones, idénticas: color, índice, duración y audio.
- **Medición completa (paso 9):**
  - El MP4 no se mide: es el original, y compararlo consigo mismo no dice nada.
  - El AV1 se mide frente al original, con el emparejamiento corregido.
  - La condición de calidad del veredicto pasa a ser absoluta (`media ≥ VMAF_MIN_MEAN − AV1_MAX_VMAF_DROP` y `p1 ≥ VMAF_MIN_P1`), porque no hay media de H.264 completa con la que compararla. Es el mismo listón traducido: el H.264 debe llegar a 95 y el AV1 puede quedar un punto por debajo.
  - El ahorro se sigue calculando frente al MP4 publicado.
- **Informe:**
  - el MP4 aparece como «copia del original»;
  - una frase explica la decisión con los dos totales de bitrate y el porcentaje;
  - «Ahorro H.264 frente al original» desaparece en este modo;
  - si no copia porque falla una condición de aptitud, lo dice en una línea, para que no parezca que no se consideró.

### 7. Invalidar las mediciones guardadas con el emparejamiento anterior

La carpeta de trabajo `.<nombre>-optimizacion/` guarda los resultados de cada prueba (`pruebas/*.json`) y de la medición completa (`completo_*.json`), y una ejecución interrumpida los deja. Con la corrección valdrían menos de lo que dicen. **`fuente.json` añade una versión de medición (`measure`, 3 tras la decisión 9)**: si no coincide, la carpeta se descarta, igual que hoy cuando cambia el original.

### 8. Documentación: una guía nueva para el recorte, sin código

El usuario eligió documentar el recorte en lugar de añadir `--desde`/`--hasta`. La guía `06-redifundir-un-directo.md` recoge:

1. descargar la grabación del panel antes de que caduque en el bucket;
2. localizar los instantes de inicio y fin;
3. listar los fotogramas clave cercanos con `ffprobe -skip_frame nokey`;
4. cortar con `-ss <instante exacto del clave> -to <fin>` como opciones de entrada y `-c copy`;
5. comprobar que el primer paquete es un `K` en 0 y que ninguno lleva `D`. Es la misma condición que exige el modo copia, así que la guía y el script dicen lo mismo;
6. lanzar el script.

El porqué de cortar en el instante exacto del clave queda explicado con lo medido (42 s frente a 44 s). La guía 00 explica el modo copia y añade `entrevista_lorca` como segundo ejemplo real. El README la incluye en la tabla y en «Para cada evento nuevo».

### 9. Fijar la frecuencia de salida en la estándar más cercana a la media real

Todas las codificaciones (pruebas y finales, H.264 y AV1) llevan `-r <frecuencia>`. La frecuencia es la de una lista de estándares (`24000/1001`, `24`, `25`, `30000/1001`, `30`, `50`, `60000/1001`, `60`) más cercana a la media real (`avg_frame_rate`, la que el script ya usa para el GOP), siempre que quede a ≤ 1,5 %. Si ninguna queda tan cerca, el script no fija nada, como antes, y lo dice con un aviso. En el paso 2 muestra la frecuencia elegida y, si difiere, la que estimaba ffmpeg.

`MEASURE_VERSION` pasa a 3: las pruebas guardadas se codificaron con la frecuencia estimada.

- Con Agora (media 29,997), la frecuencia es 30: sin descartes, y con las marcas en la rejilla exacta de 1/30 s, que es lo que ya pasaba con la entrevista completa.
- Con Premiere (25 exactos), la frecuencia es 25, como antes.

Alternativas descartadas:

- **`-fps_mode passthrough`:** conserva las marcas, pero la base de tiempos del codificador sigue saliendo de la estimación (12/359 s). Dos marcas pueden caer en el mismo instante, y no evita el problema.
- **`-r` como opción de entrada:** numera los fotogramas por índice e ignora las marcas. Agora pierde fotogramas sueltos (13 en 68 min), así que el audio se desincronizaría poco a poco.
- **Usar la media exacta como frecuencia** (29,9967): es una frecuencia que ningún reproductor espera, y para el AV1 se calcula el nivel con ella. La estándar más cercana es la que el contenido tenía de verdad.
- **Una tolerancia mayor que el 1,5 %:** un móvil de frecuencia variable con media 29,5 se forzaría a 30 duplicando fotogramas. Es un caso sin medir, así que queda como estaba.

## Risks / Trade-offs

- **[Un original con desfases mayores que medio fotograma volvería a emparejar mal]** → En las grabaciones de Agora el desfase es ≤ 0,67 ms. Un original así sería de frecuencia variable de verdad, y el síntoma sería el mismo de hoy, un p1 que no sube con el CRF. La guía 00 lo menciona como señal de alarma.
- **[La copia publica los defectos del codificador del directo]** → Es exactamente lo que vio el público en directo, y recodificar no los quita: solo añade los suyos. VMAF no puede medirlos, porque el original es la referencia.
- **[La estimación por fragmentos puede equivocarse frente al archivo completo]** → El margen del 10 % absorbe el error, y el fragmento más complejo está entre los medidos. Si la copia resultara algo más pesada de lo estimado, el coste es menor que una generación de pérdida.
- **[Las marcas al milisegundo y los 29,996 fps de media pasan a la copia]** → El reproductor sigue las marcas y el pase sincroniza por `currentTime`. La copia de `entrevista_lorca` se decodifica sin errores de principio a fin y está lista para subirse.
- **[Rehacer la copia en cada ejecución sobrescribe un `_h264.mp4` local]** → Es local, se rehace en segundos y es determinista. La regla de no sobrescribir se refiere a lo ya publicado en S3, que no se toca.
- **[Sin tests automáticos]** → Verificación manual con dos casos reales (tareas): un tramo de la grabación de Agora, que debe ir por copia con p1 ≥ 90 en todos los fragmentos, y `lynda_blair`, que debe ir por codificación y medir igual con los dos modos de emparejamiento.

## Migration Plan

No hay despliegue: es una herramienta local. Los vídeos ya subidos no cambian. Para volver atrás basta con revertir el commit. Una carpeta de trabajo antigua se descarta sola por la versión de medición.
