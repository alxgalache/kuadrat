# 04 · Alcance de la protección: qué impide y qué no

**Para qué sirve esta guía:** para saber con exactitud qué puede y qué no puede
hacer alguien del público con el vídeo de un evento, y por qué se eligió este
nivel. Es solo lectura; no hay pasos que ejecutar.

---

## La regla que no se puede esquivar

> **Si un navegador puede reproducir un archivo, el usuario de ese navegador
> puede guardarlo.**

Para reproducir, el navegador tiene que recibir los bytes del vídeo, y lo que
llega al equipo del usuario se puede copiar. Lo único que cambia esto es el
**DRM** (el vídeo llega cifrado y solo lo descifra un módulo sellado del
navegador), y ni siquiera el DRM impide **grabar la pantalla** o filmarla con un
móvil.

Con un MP4 servido como archivo, que es lo elegido para mantenerlo simple, la
protección decide **quién** recibe los bytes y **cuándo**. No puede decidir
**qué hace** con ellos quien los recibe.

## Qué se ha implementado, capa a capa

| # | Capa | Qué impide |
|---|---|---|
| 1 | **Bucket privado** («Bloquear todo el acceso público», ya activo) | Leer el vídeo directamente de S3 |
| 2 | **Comportamiento `eventos-video/*` con firma obligatoria** en CloudFront | Descargar el vídeo por el CDN sin una URL firmada: adivinar la ruta no sirve de nada |
| 3 | **Solo la API firma, y solo a quien tiene acceso** (asistente con email verificado y pago si procede, o host/admin) y **solo con el evento activo** | Obtener una URL sin registrarse, antes de que empiece el pase o después de que acabe |
| 4 | **La firma caduca al final previsto del pase** (+30 min) y vale para **un solo archivo** | Compartir la URL para verla otro día, o reutilizarla para otro vídeo |
| 5 | **Ninguna respuesta pública lleva la URL** (antes salía en la ficha y en el calendario) | Encontrar el vídeo leyendo la API o el código de la página |
| 6 | **Función de guarda en el borde** (`Sec-Fetch-Dest`) | Copiar la URL de la pestaña Red, pegarla en la barra o abrirla en una pestaña nueva, y obtener así un reproductor con botón de descarga, pausa y avance |
| 7 | **Reproductor sin menú contextual, sin picture-in-picture, sin reproducción remota y con `nodownload`** | «Guardar vídeo como…» con el botón derecho, y pausar desde la ventana flotante de PiP, que además rompía la sincronía del pase |
| 8 | **Sesión única por asistente** (ya existente) | Que dos personas usen a la vez la misma inscripción para pedir URLs nuevas |

## Qué sigue siendo posible (el riesgo aceptado)

- **Un asistente registrado con conocimientos técnicos puede descargar el MP4
  durante el pase.** Por ejemplo: pestaña Red → clic derecho en la petición del
  vídeo → «Copiar como cURL» → pegarlo en una terminal. Esa orden lleva la firma
  válida y las cabeceras de un `<video>`, así que CloudFront la acepta. Un gestor
  de descargas configurado a mano, igual. Tarda un par de minutos.
- **Durante la validez de la firma**, ese mismo usuario puede pasar la URL a
  otra persona, que también podría descargarla.
- **Cualquiera puede grabar la pantalla.** Esto no lo impide ningún sistema.

En resumen: **frena a prácticamente todo el público**, incluido quien sabe abrir
las herramientas de desarrollador y copiar una URL, pero **no a quien sabe usar
una terminal**. Es el nivel elegido («A reforzada»).

## Alternativas estudiadas y por qué no se eligieron

| Alternativa | Qué aportaría | Por qué no |
|---|---|---|
| **DRM** (Widevine / FairPlay / PlayReady, con Mux o Bunny Stream Enterprise) | Lo descargado no sirve sin licencia. En algunos dispositivos (Safari, Android) la grabación de pantalla sale en negro | Obliga a HLS/DASH, abandona S3 + CloudFront y los dos campos de URL, tiene cuota mensual y exige rehacer el reproductor sincronizado. En Chrome de escritorio la grabación de pantalla sigue funcionando |
| **Límite temporal en el borde** (CloudFront entrega solo los bytes hasta «ahora + 90 s» del pase) | Nadie tendría el archivo completo antes de que acabe el pase | Experimental: exige un índice por vídeo y validar el comportamiento de cada navegador con respuestas recortadas. Aun así, alguien paciente reuniría el archivo durante el pase |
| **Atar la firma a la IP del espectador** | La URL no serviría desde otro equipo | CloudFront no admite IPv6 en esa condición. La IP que ve la API y la que ve CloudFront pueden no coincidir (CGNAT de los operadores móviles, iCloud Private Relay, pasar del wifi a datos), y el espectador legítimo se quedaría sin vídeo sin forma de recuperarlo |
| **Firmas de pocos minutos** | Parece más seguro | No impide descargar: CloudFront solo comprueba la firma al **empezar** cada petición, y una descarga que ya ha empezado termina aunque caduque. En cambio, el vídeo se cortaría a mitad del pase |
| **HLS cifrado con AES-128** | Los trozos del vídeo viajan cifrados | La clave llega al navegador y se ve en la pestaña Red: un usuario técnico descifra con un solo comando. Y reintroduce HLS |

## Si en el futuro hiciera falta más

El siguiente escalón real es el **DRM con un servicio gestionado**. Sería un
cambio aparte:

- el servicio recibe el máster y genera las calidades;
- el reproductor pasa a ser el suyo, o shaka-player con DRM;
- la sincronía del pase se adapta a su API.

Merece la pena plantearlo solo si algún contenido tiene un valor comercial que
justifique su cuota y su complejidad.

## Buenas prácticas del día a día

- **No compartas sesiones de admin ni de host.** Un JWT de admin puede pedir
  URLs de cualquier evento de vídeo activo.
- **Pon en `duration_minutes` la duración real del vídeo más un margen.** Es lo
  que decide cuándo caduca la firma.
- **Nombra las carpetas por evento** (`eventos-video/<evento>/`). No es una
  medida de seguridad (la firma lo es), pero facilita ordenar y borrar.
- **Borra de S3 los vídeos de eventos pasados** que no vayas a reutilizar: lo
  que no existe no se puede filtrar.
