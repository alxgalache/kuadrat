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
