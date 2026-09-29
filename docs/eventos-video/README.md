# Vídeo pregrabado en eventos

Guías para publicar un vídeo pregrabado en un evento (`format = 'video'`),
servido desde CloudFront con URLs firmadas. Cambio de OpenSpec:
`openspec/changes/event-video-cdn-delivery`.

Cada guía se lee sola. No hace falta leerlas todas de una vez.

## Para cada evento nuevo: un comando

```bash
node scripts/video/optimizar-video.mjs /ruta/al/video_final.mp4
```

Deja junto al original la versión H.264, la AV1 y un informe con las URLs que
hay que poner en el evento. Detalle en la [guía 00](00-optimizacion-automatica.md).
Después: subir los archivos (guía 03, paso 8) y crear el evento (guía 05,
apartado 6).

## Todas las guías

| # | Guía | Para qué | Dónde se hace |
|---|---|---|---|
| 00 | [Optimizar con un solo comando](00-optimizacion-automatica.md) | **El camino habitual:** el script hace 01 y 02 midiendo la calidad | Ubuntu, terminal |
| 01 | [Optimizar el vídeo (H.264)](01-optimizar-video-ubuntu.md) | Qué hace el script por dentro, paso a paso, para hacerlo a mano o entenderlo | Ubuntu, terminal |
| 02 | [Versión AV1 y cálculo del ahorro](02-version-av1-y-ahorro.md) | Lo mismo para el AV1, y cómo se calcula el ahorro | Ubuntu, terminal |
| 03 | [Configurar AWS](03-configurar-aws.md) | Claves, CloudFront, función de guarda, subida y verificación | Consola de AWS + terminal |
| 04 | [Alcance de la protección](04-alcance-de-la-proteccion.md) | Qué impide y qué no impide el sistema, y por qué | Solo lectura |
| 05 | [Entornos, variables y pruebas](05-entornos-y-pruebas.md) | Configurar prod y preprod, probar y preparar el día del evento | Servidores + navegador |

## Orden la primera vez

```
 00 Optimizar (script) ─────┐
                            ├──▶ 03 subir los vídeos (paso 8) ──▶ 05 crear el evento
 03 AWS (pasos 1-7) ────────┤
 05 variables + despliegue ─┘       (03 pasos 1-7 y 05 variables: una sola vez)
```

Codificar (00) y configurar AWS (03, pasos 1-7) no dependen entre sí: se
pueden hacer en paralelo. Lo único obligatorio es el orden de la guía 03: **se
crea primero el *behavior* protegido de CloudFront y después se suben los
vídeos**. Al revés, el vídeo quedaría público entre medias.

## Las tres ideas que sostienen todo

1. **El bucket ya es privado. Lo que se hace público es la distribución.**
   Hoy CloudFront sirve a cualquiera lo que hay en el bucket. Se añade una zona,
   `eventos-video/`, en la que CloudFront solo sirve a quien trae una URL firmada.
2. **Solo la API firma, y solo a quien tiene acceso mientras dura el pase.**
   Ninguna respuesta pública lleva la URL del vídeo.
3. **Un navegador que puede reproducir un archivo puede guardarlo.** La
   protección frena a la gran mayoría. Un usuario técnico con las herramientas
   de desarrollador aún puede descargarlo durante el pase. Detalle en la guía 04.
