## ADDED Requirements

### Requirement: La configuración del proxy está versionada
La configuración de nginx de producción SHALL vivir en `deploy/nginx/` dentro del repositorio, con instrucciones de instalación. Los certificados los sigue gestionando certbot y no se versionan.

#### Scenario: Validación de sintaxis
- **WHEN** se ejecuta `nginx -t` sobre los ficheros de `deploy/nginx/`
- **THEN** la comprobación es correcta

### Requirement: HTTP/2 en los dos vhosts
`140d.art` y `api.140d.art` SHALL negociar HTTP/2.

#### Scenario: Negociación de protocolo
- **WHEN** un cliente con ALPN pide `https://140d.art/galeria`
- **THEN** la conexión se negocia como HTTP/2

### Requirement: Caché de respuestas públicas en disco
El proxy SHALL cachear en disco las respuestas que el origen declare cacheables, con una clave que distinga las variantes del App Router.

#### Scenario: Segunda petición a una página pública
- **WHEN** se pide dos veces una página pública cacheable
- **THEN** la segunda respuesta lleva `X-Kuadrat-Cache: HIT`

#### Scenario: Peticiones HTML y RSC sobre la misma URL
- **WHEN** se pide la misma URL como documento y como carga RSC (con las cabeceras `rsc` / `next-router-state-tree` / `next-router-prefetch`)
- **THEN** cada variante recibe su propio contenido
- **THEN** ninguna sirve el cuerpo de la otra

#### Scenario: Estampida de peticiones sobre una entrada fría
- **WHEN** llegan varias peticiones simultáneas a una URL no cacheada
- **THEN** sólo una alcanza el origen y el resto espera su resultado

### Requirement: El proxy respeta las directivas de caché del origen
El proxy SHALL NOT ignorar el `Cache-Control` del upstream. La decisión sobre qué es cacheable la toma la aplicación.

#### Scenario: Respuesta marcada como privada
- **WHEN** el origen responde con `Cache-Control: private, no-store`
- **THEN** el proxy no almacena la respuesta
- **THEN** una petición posterior nunca recibe esa respuesta desde caché

### Requirement: Degradación con contenido en lugar de corte
Ante un fallo o saturación del origen, el proxy SHALL servir la última copia válida si existe.

#### Scenario: El origen devuelve 500 y hay copia en caché
- **WHEN** el origen responde 500, 502, 503 o 504 y existe una entrada previa
- **THEN** el visitante recibe la copia cacheada
- **THEN** no recibe un error ni una conexión cortada

#### Scenario: Rechazo por exceso de peticiones de una IP
- **WHEN** una sola IP supera el ritmo permitido y agota su ráfaga
- **THEN** la respuesta es `503`
- **THEN** la conexión no se corta sin respuesta

### Requirement: Conexiones persistentes hacia el origen
El proxy SHALL reutilizar conexiones contra los upstreams, enviando la cabecera `Connection` de upgrade únicamente cuando el cliente solicite un upgrade.

#### Scenario: Petición HTTP normal
- **WHEN** se proxya una petición sin `Upgrade`
- **THEN** la conexión hacia el upstream se reutiliza

#### Scenario: Conexión WebSocket
- **WHEN** un cliente abre Socket.IO contra `api.140d.art`
- **THEN** el upgrade se propaga y la conexión se mantiene abierta
