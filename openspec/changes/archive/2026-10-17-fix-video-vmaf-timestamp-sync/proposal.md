## Why

`scripts/video/optimizar-video.mjs` mide mal las grabaciones de los directos, que son la fuente de toda redifusión, y lo hace sin dar ningún error. Con `entrevista_lorca` (grabación de Agora, 16/10/2026) eligió un H.264 de 2,37 GB, un 58 % más que la propia grabación, y un AV1 de 1,26 GB donde bastaban 0,83. Necesitó 2 h 30 min y atribuyó el resultado a «un original con mucho ruido».

- **La causa es el emparejamiento de fotogramas del VMAF, no los vídeos.** Por defecto, `libvmaf` compara cada fotograma codificado con el último del original cuya marca de tiempo es ≤ la suya.
  - Agora redondea las marcas al milisegundo (33, 33 y 34 ms), mientras que el codificador las coloca en la rejilla exacta de 1/30 s.
  - Según dónde empiece cada fragmento, uno o dos de cada tres fotogramas se comparan con el anterior del original.
  - En el fragmento «típica», el H.264 CRF 22 sale con 87,22 / p1 48,31 con cualquier CRF. Midiendo con `ts_sync_mode=nearest` da **94,40 / 92,17**.
- **Aun corregido, recodificar una grabación de Agora la empeora.** La grabación ya es H.264 High a 3 Mb/s con un GOP de 2 s. El CRF que cumple los umbrales (20) pesa ~3,5 Mb/s: más bytes por espectador y una generación más de pérdida. A mano se resolvió subiendo la grabación copiada como MP4 y codificando solo el AV1.
- **Recortar una grabación sin recodificar tiene una trampa.** Con `-ss 44 -c copy`, el archivo empieza en el fotograma clave de 42 s con una lista de edición. No está documentado.

Toda redifusión de un directo pasa por aquí, así que conviene corregirlo antes de la siguiente.

## What Changes

- **Medición corregida.** Todas las mediciones VMAF del script (fragmentos y archivo completo) emparejan cada fotograma con el del original de marca **más cercana** (`ts_sync_mode=nearest`).
  - Con un original en rejilla exacta, como las exportaciones de Premiere, el resultado no cambia.
  - Con una grabación de Agora, la medición deja de compararlos desalineados.
  - El script comprueba al arrancar que el ffmpeg admite la opción y, si no, se detiene con un mensaje claro.
- **Frecuencia de salida fijada** (descubierto al implementar). Las codificaciones llevan `-r` con la frecuencia estándar más cercana a la media real del original.
  - Sin `-r`, ffmpeg codificaba a la frecuencia que estimaba de las primeras marcas. En un clip de la grabación de Agora estimó 29,92 fps y quitó 29 fotogramas de 10 799: estropeaba el producto, no solo la medición.
- **El original como MP4 cuando recodificarlo no lo aligera.** El paso 4 (elegir el CRF del H.264 con los fragmentos) no cambia. Después, si el original es un MP4 H.264 apto para la web y el CRF elegido no ahorra lo suficiente frente al original en esos mismos fragmentos, el script **copia el original** en vez de codificarlo.
  - La copia lleva la etiqueta de color BT.709 y el índice al principio.
  - El AV1 sigue apuntando a la calidad del H.264 elegido.
  - La verificación y el informe dicen qué se hizo y por qué.
- **Guías corregidas.** Los comandos manuales de VMAF de las guías 01 y 02 añaden `ts_sync_mode=nearest`.
  - La guía 00 explica el modo copia y añade el caso de `entrevista_lorca` como segundo ejemplo real.
  - Una guía nueva, `docs/eventos-video/06-redifundir-un-directo.md`, explica cómo pasar de la grabación de un directo a la redifusión: recortar sin recodificar justo en un fotograma clave (y por qué), comprobar el corte y lanzar el script.
- **Regla de área actualizada.** `.claude/rules/events/video-cdn.md` añade la cuarta regla medida (emparejar por la marca más cercana) y el criterio del modo copia.

Capas afectadas: **ninguna de las dos aplicaciones**. Se tocan solo una herramienta de operador (`scripts/video/`), las guías (`docs/eventos-video/`) y la regla del área. Sin cambios de esquema de base de datos, de API ni de cliente. Sin dependencias nuevas: el mismo ffmpeg estático de BtbN que ya exige el script.

## Non-goals

- **Recorte dentro del script** (`--desde`/`--hasta`): se documenta el comando y no se añade lógica de búsqueda de fotogramas clave.
- **Copiar originales que no sean H.264 apto para la web** (HEVC de móvil, ProRes, perfiles o niveles fuera de lo que la web decodifica). Siguen recodificándose como hoy.
- **Copiar el original cuando el audio no es AAC.** El vídeo podría copiarse y el audio convertirse, pero es un caso que no se ha dado. Sigue recodificándose entero.
- **Cambiar los umbrales de calidad** (VMAF media ≥ 95, p1 ≥ 90, ±1 punto para el AV1, 25 % de ahorro mínimo) o los parámetros de los códecs.
- **Volver a codificar `lynda_blair`.** Su original está en la rejilla exacta y sus mediciones eran válidas.
- **Tests automáticos del script.** `scripts/` no tiene runner. Se verifica con las grabaciones reales, como se verificó el script original.

## Capabilities

### New Capabilities
- `event-video-encoding`: preparación offline del vídeo de un evento pregrabado con `scripts/video/optimizar-video.mjs`. Cubre cómo se mide la calidad (emparejamiento por la marca más cercana), cuándo el MP4 es el original copiado en lugar de una recodificación, qué calidad persigue entonces el AV1, la comprobación de la herramienta y la documentación del recorte de grabaciones de directos.

### Modified Capabilities
<!-- Ninguna: `event-video-cdn-delivery` describe la entrega y el reproductor, no la codificación, y sus requisitos no cambian. -->

## Impact

- **Código:** `scripts/video/optimizar-video.mjs` (medición, comprobación de herramientas, decisión copia/recodificación, verificación e informe).
- **Documentación:**
  - `docs/eventos-video/00-optimizacion-automatica.md`, `01-optimizar-video-ubuntu.md`, `02-version-av1-y-ahorro.md` y `README.md`;
  - una guía nueva, `06-redifundir-un-directo.md`.
- **Regla:** `.claude/rules/events/video-cdn.md`. Sus `paths:` ya cubren `scripts/video/**` y `docs/eventos-video/**`.
- **Operación:**
  - una redifusión de un directo pasa de ~2 h 30 min a la duración de la codificación AV1 más las mediciones;
  - el MP4 es la grabación sin pérdida de generación;
  - en un vídeo como `entrevista_lorca`, cada espectador del MP4 descarga ~0,9 GB menos que con lo que generaba el script, y ~0,25 GB menos que recodificando con la medición ya corregida.
- **Sin efecto** en la API, el cliente, la base de datos, CloudFront ni los vídeos ya subidos.
