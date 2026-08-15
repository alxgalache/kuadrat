# Endurecimiento de producción frente a carga

## Why

Una prueba de carga contra `https://140d.art` el 15/08/2026 (k6, ~96 000 peticiones, de 5 a 1000 req/s) midió un techo muy por debajo de lo que sugiere la arquitectura, y lo situó en un lugar inesperado:

| Ruta | Sana | Techo útil | Al pasarse |
|---|---|---|---|
| `/galeria/p/[slug]` | 25 req/s | ~38 req/s | HTTP 500 + conexiones cortadas |
| `/galeria` | 50 req/s | 126 req/s | retrocede a ~99 req/s |
| `/api/art` | ≥60 req/s (p95 382 ms) | sin medir | — |

Un control contra CloudFront desde la misma máquina entregó 998 req/s con p95 de 60 ms y cero errores, así que el techo es del origen y no del generador.

Cinco causas, todas corregibles sin tocar la lógica de negocio:

1. **La página más cara es la única sin caché, y es la puerta de entrada.** `/galeria` se sirve preconstruida (`s-maxage=31536000`) mientras `/galeria/p/[slug]` respondía `private, no-cache, no-store, must-revalidate` y renderizaba de cero en cada visita — justo la ruta que reciben los enlaces desde buscadores y redes. En `client/app/galeria/` no existía `generateStaticParams`, `revalidate` ni `dynamic`, así que Next la trataba como dinámica por defecto.
2. **No hay degradación limpia.** A 300 req/s el desglose fue 766 conexiones cerradas en seco (`EOF`), 341 HTTP 500 y 265 `connection reset by peer`. No aparecen 503: el servidor acepta la conexión y la corta. Para el visitante no es «la web va lenta», es un error de red.
3. **El optimizador de imágenes está en el camino crítico.** Las 13 imágenes de la galería se sirven por `/_next/image`, dentro del contenedor de Next: por cada variante nueva se descarga el original del CDN (~1,5 MB), se decodifica, se redimensiona y se recodifica, en el mismo vCPU que renderiza páginas. Su caché vive en un tmpfs de 200 MB que se borra en cada despliegue.
4. **HTTP/1.1.** nginx negocia 1.1 en `140d.art` y `api.140d.art` mientras el CDN va por HTTP/2. Sin multiplexación el navegador queda en ~6 conexiones por dominio, cada una con su handshake TLS.
5. **El renderizado del servidor comparte una única cubeta de rate limit.** El límite general es 1000 peticiones / 30 min por IP. Las llamadas que Next hace al renderizar no llevan la IP del visitante sino la del servidor, así que todas caen en la misma cuenta. Con la caché de datos de 300 s el margen era amplio y **no llegó a dispararse** durante las pruebas, pero una avalancha con caché fría lo agotaría y el síntoma sería que las fichas muestran «Obra no encontrada».

Añadido durante la investigación, no en el informe original:

6. **Reparto de CPU incoherente con la máquina.** La instancia es una `t4g.medium` (2 vCPU). `docker-compose.prod.yml` asignaba `cpus: 1.0` a cada contenedor: los dos vCPU enteros, sin dejar nada a nginx ni al sistema.
7. **La imagen de producción de la API era la de desarrollo.** `api/Dockerfile` hace `npm install` (no reproducible) y arranca con nodemon; producción usaba ese mismo fichero sobreescribiendo el `command:`, arrastrando jest, nodemon y supertest a la imagen y sin `tini`, de modo que el SIGTERM no llegaba limpio al apagado ordenado.

## What Changes

### Caché de render (H1)

- `/galeria/p/[id]`, `/galeria/autor/[authorSlug]`, `/tienda/p/[id]` y `/tienda/autor/[authorSlug]` pasan a ISR con `revalidate = 300`.
- **`revalidate` por sí solo no basta**: verificado en la tabla de rutas de `next build`, un segmento dinámico sin `generateStaticParams` sigue marcado `ƒ (Dynamic)`. Se añade `generateStaticParams()` devolviendo lista vacía más `dynamicParams = true`, con lo que la ruta pasa a `●` y cada URL se cachea la primera vez que se pide.
- La lista se deja vacía a propósito: prerenderizar en build obligaría a que la API responda durante `docker build` y convertiría un fallo de red en un despliegue roto.

### Proxy (H3, H6)

- Se **versiona** la configuración de nginx en `deploy/nginx/`, que hasta ahora sólo existía en `/etc/nginx` de la instancia.
- `http2 on` en ambos vhosts.
- `proxy_cache` en disco para HTML e imágenes, con `proxy_cache_lock` (colapsa estampidas) y `proxy_cache_use_stale ... http_500 http_502 http_503 http_504` — **este último es el arreglo de H3**: bajo saturación se sirve la última copia buena en lugar de cortar la conexión.
- `limit_req` y `limit_conn` por IP, con `limit_req_status 503` para que el rechazo sea explícito y no un corte.
- `keepalive` hacia los upstreams, posible al dejar de enviar `Connection: upgrade` en todas las peticiones proxied (mapa `$connection_upgrade`).

### Imágenes (H5)

- `minimumCacheTTL` a un año: los basenames son UUID, así que una URL `/_next/image` nunca cambia de contenido.
- `deviceSizes` reducido de 8 a 5 anchos: menos variantes que generar y mejor tasa de acierto.
- `formats` fijado explícitamente a `['image/webp']`, **sin AVIF**: comprime mejor pero codificarlo es varias veces más caro en CPU, y la máquina es un Graviton de 2 vCPU compartidos.
- La caché duradera la aporta nginx, en disco, de modo que sobrevive al reinicio del contenedor.

### Rate limit (H7)

- Las peticiones que nacen dentro del despliegue quedan exentas del limitador general.
- `client/lib/serverApi.js` separa la URL **pública** (que viaja en el HTML: imágenes de Open Graph, JSON-LD) de la **interna** usada para pedir los datos durante el render.

### Infraestructura (nuevos, 6 y 7)

- Reparto de CPU acorde con la máquina, dejando margen para nginx.
- `api/Dockerfile.prod` con `npm ci --omit=dev` y `tini`; `docker-compose.prod.yml` pasa a usarlo y deja de sobreescribir el `command`.
- `healthcheck` en ambos servicios.

## Capabilities

### New Capabilities
- `page-render-caching`: qué páginas se cachean, con qué frecuencia se revalidan y qué exportaciones lo hacen efectivo.
- `edge-proxy-caching`: comportamiento del proxy — HTTP/2, caché, límites por IP y degradación bajo saturación.
- `api-rate-limiting`: a qué tráfico se le aplica el limitador general y qué tráfico queda exento, incluida la propiedad de no falsificabilidad.
- `image-optimizer-caching`: vida y forma de las variantes de imagen servidas por Next.
- `production-container-topology`: reparto de recursos e imagen de producción de la API.

### Modified Capabilities
Ninguna. `nextjs-image-usage` describe el uso del componente `<Image>` en los componentes y no cambia; lo que aquí se toca es la configuración del optimizador, que es una capacidad distinta.

## Non-goals

- **No se toca la lógica de negocio** ni ningún esquema de base de datos.
- **No se cachea la API.** Sirve estado (carrito, pujas, stock de ediciones); cachearla podría anunciar como disponible una obra ya vendida.
- **No se redimensionan los originales al subirlos.** Sería una mejora real (ahorro de almacenamiento y de trabajo del optimizador), pero implica añadir `sharp` —dependencia nativa— al backend y reprocesar lo ya subido. Queda fuera; el original nunca llega al navegador, así que no afecta al usuario.
- **No se cambia el tipo de instancia.** Es una decisión de coste del propietario; el análisis va aparte.
- **No se mide el techo de la API.** Requiere subir `GENERAL_RATE_LIMIT_MAX_REQUESTS` durante una ventana de prueba; queda documentado en `api/.env.example` y en las tareas.
