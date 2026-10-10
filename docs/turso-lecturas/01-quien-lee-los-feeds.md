# 1. Quién ha leído los feeds y cuántas veces

**Para qué:** saber cuántas veces se regeneró el catálogo de los feeds cada día y quién lo pidió: Google, Meta, tú desde el navegador o un reinicio de la API. Mientras no se despliegue el cambio `fix-zone-resolver-row-reads`, cada regeneración cuesta unos 55–60 millones de lecturas en Turso.

**Dónde:** todo se ejecuta **en el servidor de producción (la instancia EC2)**, no en tu ordenador.

**Qué se puede consultar:**

| Fuente | Qué guarda | Cuánto tiempo |
|---|---|---|
| Log de nginx (`/var/log/nginx/kuadrat-api.access.log*`) | Cada petición a `api.140d.art`, con su hora, quién la hizo y cuánto tardó | Unos 14 días (rotación diaria, los antiguos en `.gz`) |
| Log de la API (`docker logs kuadrat-api`) | Una línea por cada regeneración del catálogo | Solo desde el último despliegue, porque cada despliegue recrea el contenedor |

Con el log de nginx basta para el 6–10 de octubre. El de la API sirve de confirmación desde el último despliegue.

---

## Paso 1. Conectarte al servidor

Abre una terminal en tu ordenador y entra en la instancia de producción como lo haces para desplegar: el mismo `ssh` o EC2 Instance Connect desde la consola de AWS.

Los pasos 2 a 5 se escriben en esa sesión.

## Paso 2. Cuántas peticiones a los feeds hubo cada día

```bash
sudo zgrep -h 'GET /api/feeds/' /var/log/nginx/kuadrat-api.access.log* \
  | awk '{print substr($4,2,11), $7}' | sort | uniq -c
```

`zgrep` lee igual los ficheros normales y los comprimidos. Sale una línea por día y feed:

```
      3 07/Oct/2026 /api/feeds/google-merchant.xml
     24 09/Oct/2026 /api/feeds/meta-catalog.xml
```

## Paso 3. Quién las hizo

```bash
sudo zgrep -h 'GET /api/feeds/' /var/log/nginx/kuadrat-api.access.log* \
  | awk -F'"' '{print $6}' | sort | uniq -c | sort -rn
```

Cada línea es un agente (el programa que hizo la petición) y cuántas veces lo hizo:

| Si el agente contiene… | Es… |
|---|---|
| `Google` | Merchant Center |
| `facebookexternalhit`, `meta-externalagent` o `facebook` | Commerce Manager de Meta |
| `Mozilla/5.0 (X11; Linux…) … Chrome` o `Firefox` | Un navegador: normalmente tú, al abrir la URL o pulsar «Obtener ahora» y ver el resultado |
| `curl` o `wget` | Un script o una prueba a mano |

## Paso 4. Qué peticiones regeneraron el catálogo

El catálogo se guarda una hora en memoria. Solo la primera petición después de esa hora lo regenera, y es la que tarda varios segundos. Las demás salen de la caché y no cuestan nada en Turso.

```bash
sudo zgrep -h 'GET /api/feeds/' /var/log/nginx/kuadrat-api.access.log* \
  | awk '{print $4, $7, $9, $(NF-1)}' | sort
```

Cada línea muestra la hora, el feed, el código HTTP y `rt=` (los segundos que tardó):

```
[09/Oct/2026:14:00:02 /api/feeds/meta-catalog.xml 200 rt=7.412   ← regeneró
[09/Oct/2026:14:20:11 /api/feeds/google-merchant.xml 200 rt=0.004 ← caché
```

Cuenta las de varios segundos de cada día. Cada una cuesta ~55–60 M de lecturas hasta que se despliegue el cambio.

La hora del log es la del servidor. Si termina en `+0000` es UTC, igual que las gráficas de Turso.

## Paso 5 (opcional). Confirmarlo con el log de la API

```bash
docker logs --timestamps kuadrat-api 2>&1 \
  | grep 'Product feed catalogue generated' | cut -c1-19
```

Sale una línea por regeneración, con su hora en UTC. Para contarlas por día:

```bash
docker logs --timestamps kuadrat-api 2>&1 \
  | grep 'Product feed catalogue generated' | cut -c1-10 | uniq -c
```

Solo cubre desde el último despliegue. Si sale vacío, es que nadie ha pedido los feeds desde entonces.

---

## Cómo leer el resultado

- **7 y 8 de octubre** (~220 M de lecturas al día, unas 4 regeneraciones): busca en el paso 4 cuáles fueron lentas y en el paso 3 quién las hizo. Un «Obtener ahora» en Merchant Center o abrir la URL en el navegador cuentan como regeneración si pasó más de una hora desde la anterior. Los despliegues también cuentan, porque vacían la caché.
- **9 y 10 de octubre**: deberían salir unas 20–24 regeneraciones al día con agente de Meta, una por hora.
- **A partir de ahora**, con Meta una vez al día a las 21:00: deberían salir 1 o 2 al día. Si Merchant Center lee el feed entre las 21:00 y las 21:59, aprovecha la generación de Meta y sale una sola.
