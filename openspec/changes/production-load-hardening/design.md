# Diseño

## Dónde está realmente el cuello

La intuición razonable era la base de datos. Los números la descartan: la API sirvió 60 req/s con p95 de 382 ms sin acercarse a su límite, mientras el frontend a 50 req/s ya estaba en 4,9 s. Turso no llegó a ser el factor limitante en ningún momento.

```
        ANTES                                   DESPUÉS
   ┌──────────────┐                        ┌──────────────┐
   │    nginx     │  sin caché             │    nginx     │  proxy_cache (disco)
   │  HTTP/1.1    │  sin límites           │   HTTP/2     │  limit_req + stale
   └──────┬───────┘                        └──────┬───────┘
          │ todo pasa                             │ sólo los fallos de caché
   ┌──────▼───────┐                        ┌──────▼───────┐
   │   Next.js    │  render en CADA        │   Next.js    │  render 1 vez / 5 min
   │   1 vCPU     │  petición + resize     │  1 vCPU      │  por obra
   └──────┬───────┘  de imágenes           └──────┬───────┘
          │ vía nginx (cuenta              │ red interna (exenta)
   ┌──────▼───────┐  en el rate limit)     ┌──────▼───────┐
   │   Express    │                        │   Express    │
   └──────────────┘                        └──────────────┘
```

Tres capas de caché, deliberadamente redundantes, porque fallan de forma independiente:

1. **Caché de datos de Next** (`next: { revalidate: 300 }` en los `fetch`) — ya existía; evita ir a la API.
2. **Caché de render ISR** (`revalidate` + `generateStaticParams`) — nueva; evita recalcular el HTML.
3. **`proxy_cache` de nginx** — nueva; evita entrar en Node, y sobrevive al reinicio del contenedor, que es lo que las otras dos no hacen (el `cacheHandler` es en memoria por el `read_only: true`).

## Decisiones

### `generateStaticParams` con lista vacía en lugar del catálogo

Descubierto compilando, no leyendo: con sólo `export const revalidate = 300` la tabla de rutas de `next build` seguía marcando `ƒ (Dynamic)`. Un segmento dinámico necesita además `generateStaticParams` para entrar en el camino de ISR.

Devolver el catálogo real habría prerenderizado las 26 obras en build, ahorrando el primer render de cada una. Se descarta porque obligaría a que la API esté levantada y respondiendo durante `docker build` — un fallo de red pasaría de ser un incidente transitorio a un despliegue roto. El beneficio es un único render por obra cada cinco minutos; no compensa.

### La clave de caché de nginx incluye las cabeceras RSC

El App Router sirve **dos respuestas distintas en la misma URL**: el HTML completo y la carga RSC que pide el router al navegar por el cliente. Se distinguen sólo por cabeceras de petición, y el propio Next lo declara con `Vary: rsc, next-router-state-tree, next-router-prefetch`.

La clave por defecto de nginx (`$scheme$proxy_host$request_uri`) las confunde y la primera respuesta en llegar envenena a la otra. El síntoma —una página que se renderiza como JSON en crudo, o una navegación cliente que deja de funcionar— no se parece en nada a «he activado una caché». Por eso la clave incorpora las mismas cabeceras que Next declara en `Vary`.

### No se ignora el `Cache-Control` del upstream

`proxy_ignore_headers Cache-Control` daría un micro-caché uniforme y más rendimiento. Se descarta: es exactamente lo que haría cacheable el panel de administración, los pedidos y el área de vendedor, que Next marca `private, no-store`. Respetando la cabecera, la separación entre lo público y lo privado la sigue decidiendo la aplicación —que es quien sabe— y no una regla del proxy.

El coste es que sólo se cachea lo que Next declara cacheable. Con ISR activo, eso es justo lo que interesa.

### `proxy_cache_use_stale` con `http_500`

Es el arreglo de la degradación sucia y merece ser explícito: incluir `http_500` significa que un error del origen **no llega al visitante** mientras exista una copia previa. Se acepta servir contenido desactualizado a cambio de no servir una pestaña en blanco. En una galería, cuyo contenido cambia cada varios días, la desactualización es barata.

El riesgo real: un fallo del origen queda enmascarado. Se compensa con el `healthcheck` del contenedor y con la cabecera `X-Kuadrat-Cache`, que permite ver desde fuera si se está sirviendo de caché.

### Exención del rate limit por ausencia de `X-Forwarded-For`, no por rango de IP

Comprobar sólo que la IP es privada sería trivialmente explotable: bastaría enviar `X-Forwarded-For: 10.0.0.1`. La condición correcta es la **ausencia** de la cabecera, porque nginx la añade siempre (`proxy_add_x_forwarded_for`) y el puerto 3001 sólo se publica en `127.0.0.1`. Una petición sin la cabecera no puede haber entrado desde fuera.

Esta propiedad es la única razón por la que el mecanismo es seguro, así que tiene test propio: `api/tests/rateLimitInternalExemption.test.js` incluye el caso de la IP privada falsificada.

### Sin AVIF

AVIF comprimiría ~30 % mejor que WebP. Se descarta porque codificarlo es varias veces más caro en CPU y la máquina es un Graviton de 2 vCPU compartidos entre render, API y nginx. Con la caché en disco el coste sería puntual por variante, pero el primer visitante de cada tamaño pagaría la espera. El ahorro de bytes no justifica gastar el recurso escaso.

### La caché de nginx en disco, no en tmpfs

El contenedor corre con `read_only: true` y monta `/app/.next/cache` en un tmpfs de 200 MB, así que la caché de imágenes de Next muere en cada despliegue: la primera visita posterior vuelve a pagar la descarga del original de 1,5 MB y su redimensionado. Poniendo la caché en nginx, fuera del contenedor y en disco, el trabajo se hace una vez por variante en la vida del servidor.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Envenenamiento de caché entre HTML y RSC | Clave de caché con las cabeceras que Next declara en `Vary`; verificable con `X-Kuadrat-Cache` y navegando por el cliente |
| Una página privada acaba cacheada | No se ignora `Cache-Control`; comprobación explícita sobre `/admin` en el README de `deploy/nginx/` |
| Contenido desactualizado tras publicar una obra | `revalidate` de 300 s; para plantillas, vaciado de `kuadrat_html` documentado |
| Un fallo del origen queda oculto tras `use_stale` | `healthcheck` en compose y cabecera `X-Kuadrat-Cache` |
| `INTERNAL_API_URL` ausente en `client/.env` de producción | Se cae a la URL pública — comportamiento anterior, sin romper nada; queda como tarea de despliegue verificarlo |
| Olvidar revertir el límite subido para pruebas | `warn` al arrancar por encima de 100 000 |

## Alternativas descartadas

- **Varias réplicas de Next.** Sin sentido en 2 vCPU, y con el `cacheHandler` en memoria cada réplica tendría su propia caché, multiplicando los renders.
- **Cachear también la API en nginx.** Sirve stock de ediciones limitadas y pujas; el riesgo de anunciar disponible algo vendido no compensa.
- **Redimensionar los originales al subirlos.** Mejora real, pero añade `sharp` al backend y obliga a reprocesar lo existente. El original no llega al navegador, así que no afecta al usuario. Fuera de alcance.
- **Poner CloudFront delante del sitio entero.** Resolvería casi todo de golpe, pero cambia el modelo de despliegue, la invalidación y el coste. Merece su propia decisión, no ir de tapadillo en un cambio de rendimiento.
