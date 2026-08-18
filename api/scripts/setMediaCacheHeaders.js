#!/usr/bin/env node
/**
 * Escribe Cache-Control en objetos del bucket de medios que ya estaban subidos.
 *
 *   docker compose exec api npm run s3:cache-headers            # simulacro
 *   docker compose exec api npm run s3:cache-headers -- --apply
 *   docker compose exec api npm run s3:cache-headers -- --apply --prefix art/
 *
 * Por qué existe. Los vídeos de portada viven en `stories/` y se suben a mano
 * desde la consola de AWS, así que nunca pasan por `s3Service.uploadFile()` y
 * llegaron al bucket SIN Cache-Control. S3 entonces no envía ninguna cabecera
 * de caché, el navegador se queda sin instrucciones y vuelve a descargar 1,8 MB
 * en cada visita: es el "Usar tiempos de vida de caché eficientes" que PageSpeed
 * marca con 2085 KiB de ahorro. CloudFront sí los cachea (su TTL por defecto),
 * pero eso solo evita el viaje hasta S3, no el que hace el visitante.
 *
 * Cambiar una cabecera en S3 exige copiar el objeto sobre sí mismo con
 * `MetadataDirective: REPLACE`; el contenido no se transfiere, así que el coste
 * es una petición por fichero. No reescribe el objeto de forma destructiva: el
 * Content-Type se relee y se conserva.
 *
 * Requiere `s3:GetObject` además del `s3:PutObject` que ya usan las subidas. Si
 * el rol de la instancia no lo tiene, la alternativa sin permisos nuevos es una
 * Response Headers Policy en CloudFront — ver docs/cdn-cache.md.
 *
 * Por defecto es un SIMULACRO: no escribe nada, pero SÍ hace un `HeadObject`
 * por fichero. Eso no es un detalle: es lo único que comprueba de verdad que el
 * rol tiene `s3:GetObject` antes de intentar la escritura, y de paso enseña qué
 * Cache-Control tiene hoy cada objeto. Un simulacro que solo listara diría que
 * todo va bien y fallaría en el primer `--apply`.
 */
const config = require('../config/env');
const logger = require('../config/logger');
const s3Service = require('../services/s3Service');

// Solo prefijos cuyos nombres de fichero son únicos por contenido (UUID, o
// marca de tiempo más aleatorio). `immutable` sobre un nombre reutilizable
// dejaría a los visitantes con la versión vieja durante un año y sin forma de
// invalidarla: una invalidación de CloudFront arregla el CDN, no el navegador.
// `stories/` entra en la lista porque sus ficheros se numeran y se sustituyen
// creando uno nuevo, no reescribiendo el existente.
const DEFAULT_PREFIXES = ['stories/', 'art/', 'others/', 'authors/'];

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const prefixArg = args.indexOf('--prefix');
  const prefixes = prefixArg !== -1 && args[prefixArg + 1]
    ? [args[prefixArg + 1]]
    : DEFAULT_PREFIXES;

  if (!config.useS3) {
    logger.error('AWS_S3_BUCKET no está configurado: no hay bucket de medios sobre el que actuar.');
    process.exitCode = 1;
    return;
  }

  let total = 0;
  let failed = 0;

  for (const prefix of prefixes) {
    let names;
    try {
      names = await s3Service.listFiles(prefix);
    } catch (err) {
      logger.error({ err, prefix }, 'No se pudo listar el prefijo');
      failed += 1;
      continue;
    }

    logger.info({ prefix, count: names.length, apply }, 'Prefijo listado');

    for (const name of names) {
      const key = `${prefix}${name}`;
      total += 1;

      if (!apply) {
        try {
          const head = await s3Service.getObjectHeaders(key);
          logger.info(
            {
              key,
              contentType: head.contentType,
              cacheControlActual: head.cacheControl,
              cacheControlNuevo: s3Service.MEDIA_CACHE_CONTROL,
              bytes: head.contentLength,
            },
            head.cacheControl === s3Service.MEDIA_CACHE_CONTROL
              ? 'Simulacro: ya tiene el Cache-Control correcto, no haría nada'
              : 'Simulacro: se escribiría Cache-Control',
          );
        } catch (err) {
          failed += 1;
          logger.error(
            { err, key },
            'Simulacro: no se pudo leer el objeto. Si es AccessDenied, al rol de la instancia le falta s3:GetObject — ver docs/cdn-cache.md',
          );
        }
        continue;
      }

      try {
        const result = await s3Service.setCacheControl(key, s3Service.MEDIA_CACHE_CONTROL);
        logger.info(
          { key, contentType: result.contentType, previousCacheControl: result.previousCacheControl },
          'Cache-Control actualizado',
        );
      } catch (err) {
        failed += 1;
        logger.error({ err, key }, 'No se pudo actualizar el Cache-Control');
      }
    }
  }

  logger.info(
    { total, failed, apply, cacheControl: s3Service.MEDIA_CACHE_CONTROL },
    apply ? 'Cabeceras de caché actualizadas' : 'Simulacro terminado: nada se ha modificado (usa --apply)',
  );

  if (apply && failed === 0 && total > 0) {
    logger.info(
      'Falta un paso: invalidar CloudFront (/stories/* o /*). Las copias ya cacheadas siguen sirviendo la respuesta antigua, sin cabecera.',
    );
  }

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  logger.error({ err }, 'setMediaCacheHeaders falló');
  process.exitCode = 1;
});
