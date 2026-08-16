# Monitorización y avisos

## El diagnóstico, primero

La prueba de carga de agosto de 2026 provocó unas 40 000 peticiones fallidas y
**Sentry no registró ni una incidencia**. Durante semanas eso se interpretó como
un fallo de Sentry. No lo es.

Se comprobó invocando `GET /api/sentry-example-api`, que lanza un error a
propósito: llegó a Sentry con el segundo exacto. **La instrumentación funciona
correctamente**, incluido `onRequestError` en `client/instrumentation.js`, que es
el enganche que captura los errores de render en servidor.

Lo que ocurre es que **Sentry no era la herramienta adecuada para esa pregunta**.
Sentry responde a *«¿ha lanzado una excepción mi código?»*. Durante la
saturación, los fallos fueron de otra naturaleza:

| Lo que veía el visitante | Lo que pasaba | ¿Hay excepción que capturar? |
|---|---|---|
| `EOF`, `connection reset` | La conexión moría en la capa TCP/nginx | No. La aplicación ni llegó a ver la petición |
| HTTP 500 | Fallos en la fontanería interna de Next (optimizador de imágenes, cola desbordada) | No pasan por `onRequestError` |
| HTTP 503 | El limitador de nginx rechazando | No es un error: es el sistema funcionando |
| Lentitud extrema | El bucle de eventos saturado | No. Nada falla, sólo hay demasiado |

El código no se rompió en ningún momento. Simplemente había más tráfico del que
cabía. Un rastreador de excepciones no tiene nada que decir sobre eso, igual que
un detector de humo no avisa de una inundación.

**El hueco real no era Sentry: era que nada vigilaba si el sitio respondía.**

## Las tres capas

| Capa | Responde a | Dónde vive | Estado |
|---|---|---|---|
| 1. Sentry | ¿Ha fallado mi código? | Ya configurado | ✅ Funcionando |
| 2. Endpoint de readiness | ¿Puede el servicio atender a alguien? | `api/app.js` | ✅ Implementado |
| 3. Monitor externo | ¿Responde el sitio? | Fuera de la instancia | ✅ Dado de alta |
| 4. Alarmas de AWS | ¿Está viva la máquina? | CloudWatch | ✅ Dadas de alta |

Las capas 3 y 4 son configuración de consola, no código. Lo que sigue documenta
cómo se dieron de alta y qué vigilan, para poder rehacerlas o revisarlas.

## Capa 2 — el endpoint que sí dice la verdad

`GET /health` responde 200 en cuanto el proceso acepta peticiones. Está bien
así: es una prueba de **vida** para el healthcheck de Docker, cuya única
pregunta es si hay que reiniciar el contenedor. Reiniciarlo porque Turso esté
caído sólo añadiría un bucle de reinicios a un problema que está en otro sitio.

El problema es que **devolvía 200 aunque Turso fuese inalcanzable**, así que un
monitor apuntado ahí informaría de un sitio sano mientras la galería no puede
listar una sola obra.

`GET /health/ready` responde a la otra pregunta:

```bash
curl -s https://api.140d.art/health/ready | python3 -m json.tool
```

```json
{
  "success": true,
  "status": "ready",
  "checks": { "database": { "ok": true, "ms": 42 } },
  "timestamp": "2026-08-15T21:30:00.000Z"
}
```

Devuelve **503** con `"status": "degraded"` si la base de datos no responde en
4 segundos. Está exento del limitador de peticiones, nunca se cachea, y no
filtra detalles internos del error (es público).

**Este es el endpoint que debe vigilar el monitor externo**, no `/health`.

## Capa 3 — monitor externo (lo más importante que falta)

Es la única capa que sigue funcionando **cuando la máquina está caída**, que es
justo cuando más falta hace. Todo lo que corre dentro de la instancia comparte
su destino: el mismo punto ciego que ya está documentado para las copias de
seguridad (*«un contenedor caído a las 04:00 no produce copia y tampoco
alerta»*).

Cualquier servicio vale. Lo que **no** da igual es qué URL se vigila: las
mejoras de resiliencia que hacen el sitio robusto lo hacen también más difícil
de monitorizar desde fuera, porque están diseñadas justamente para que un fallo
del origen no se note.

| URL | Qué detecta | Fuerza |
|---|---|---|
| `https://api.140d.art/health/ready` | API caída (502), base de datos inaccesible (503), máquina caída (timeout) | **Fuerte** |
| `https://api.140d.art/api/art?page=1&limit=1` | El camino de datos completo, de extremo a extremo | **Fuerte** |
| `https://140d.art/galeria` | Que nginx atiende | Débil |
| `https://140d.art/galeria/p/ventanas-y-horizontes-ii` | Que el render responde | Débil |

**Las dos primeras son los monitores de verdad.** Ninguna pasa por la caché de
nginx (`/health/ready` manda `no-store`; el vhost de la API no tiene
`proxy_cache`), así que un fallo del origen se traduce en un código de error que
el monitor ve.

Las dos últimas son casi decorativas, y conviene saber por qué antes de confiar
en ellas:

- **`/galeria` se sirve desde la caché de nginx con `proxy_cache_use_stale`.**
  Devolvería 200 con el contenedor de Next completamente muerto. Eso es
  exactamente lo que queremos para los visitantes, y exactamente lo que arruina
  el valor de la comprobación.
- **La ficha de obra devuelve 200 aunque la API esté caída.**
  `client/lib/serverApi.js` traga los errores (`if (!res.ok) return null` y un
  `catch` que también devuelve `null`), de modo que la página se renderiza
  igualmente y muestra «Obra no encontrada» — con código 200. Un monitor que
  sólo mire el código de estado no distingue eso de una página correcta.

Por la misma razón, **da casi igual qué slug se elija**: un slug inexistente
también responde 200, así que el monitor no dará falsos positivos si algún día
esa obra se retira del catálogo. Si tu servicio permite comprobar además el
**cuerpo** de la respuesta, busca un texto que sólo aparezca cuando la ficha se
renderiza bien (el nombre de la obra) y la comprobación pasa de débil a útil.

**Opción recomendada: Sentry Uptime Monitoring**, si tu plan lo incluye. Ventaja
concreta: las caídas aparecen en el mismo panel que los errores de código, así
que hay un solo sitio donde mirar. En `sentry.io` → *Insights* → *Uptime Monitors*
→ *Add Monitor*, con la URL y el intervalo.

Alternativas gratuitas si no está disponible: UptimeRobot (50 monitores, 5 min),
Better Stack (10 monitores, 3 min) o Healthchecks.io. Cualquiera sirve; lo que
no sirve es no tener ninguno.

Configura el aviso a un canal que mires **fuera del horario de trabajo**. Una
caída a las 23:00 de un sábado que se descubre el lunes es, en la práctica,
igual que no tener monitor.

## Capa 4 — alarmas de CloudWatch

Cubren lo que el monitor externo no distingue: si el sitio no responde por un
fallo de la aplicación o porque la instancia se ha quedado sin CPU o ha muerto.

En la consola de AWS → CloudWatch → *Alarmas* → *Crear alarma*, para la
instancia `i-08f34f1a05a798185` (región `eu-south-2`):

| Métrica | Condición | Qué detecta |
|---|---|---|
| `StatusCheckFailed` | `>= 1` durante 2 min | La instancia o su red han muerto |
| `CPUUtilization` | `>= 90 %` durante 15 min | Saturación sostenida |
| `CPUCreditBalance` | `< 100` | Sólo si algún día se sale de modo `unlimited` |

Las tres necesitan un tema de SNS con tu correo suscrito. La primera es la
importante; las otras dos son preaviso.

## Qué NO hace falta

- **No hay que "arreglar" Sentry.** Funciona. Cambiarlo por no haber avisado de
  una saturación sería tratar el síntoma equivocado.
- **No hace falta un agente de métricas en la instancia** (Prometheus, Grafana,
  Datadog). Para dos contenedores y 2 vCPU, el coste de operarlo supera con
  mucho lo que aporta frente a las cuatro capas de arriba.
- **No hace falta alertar sobre 5xx a partir del log de nginx.** Ahora que
  `kuadrat.access.log` incluye `cache=` y el estado, se puede consultar cuando
  haga falta (ver `deploy/nginx/README.md`), pero un vigilante que corre dentro
  de la máquina no avisa de que la máquina se ha caído.

## Comprobar que funciona

Provocar un error real y confirmar que llega:

```bash
curl -s -o /dev/null https://140d.art/api/sentry-example-api   # devuelve 500 a propósito
```

Aparece en Sentry como `SentryExampleAPIError` en el proyecto `140d-client`, en
segundos. Es una ruta de ejemplo pensada para esto; resuelve la incidencia
después para no dejar ruido.

Y el readiness:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.140d.art/health/ready   # 200
```
