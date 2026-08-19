# Plausible Analytics CE — instalación desde cero

Guía completa para levantar la analítica de `140d.art` partiendo de nada: una
instancia EC2 recién creada, un Mac mini limpio, o ambos. Está escrita para que
la siga alguien que no participó en la instalación original.

**Léela entera antes de empezar.** El orden de los pasos importa y hay al menos
cuatro puntos en los que un fallo no produce ningún error visible: la
instalación *parece* funcionar y los datos que recoge son falsos.

- **Versión:** Plausible Community Edition **v3.2.1**
- **Dominio:** `analytics.140d.art` (panel **e** ingesta, ver §1.3)
- **Última revisión:** 19/08/2026

---

## 0. Arquitectura, y por qué es así

```
                    ┌──────────────────────────────────────────┐
   navegador ──────▶│  EC2  (nginx)                            │
   del visitante    │  · termina TLS                           │
                    │  · VE LA IP REAL y la escribe en         │
                    │    X-Forwarded-For                       │
                    └───────────────────┬──────────────────────┘
                                        │ https (internet)
                                        ▼
                    ┌──────────────────────────────────────────┐
                    │  Router ASUS  :443 ──▶ Mac mini M1       │
                    │  ┌────────────────────────────────────┐  │
                    │  │ Nginx Proxy Manager                │  │
                    │  └──────────────┬─────────────────────┘  │
                    │     red docker `proxy-network`           │
                    │                 ▼                        │
                    │   plausible ──▶ postgres + clickhouse    │
                    └──────────────────────────────────────────┘
```

Tres restricciones explican toda esa forma. Ninguna es evidente y las tres se
descubrieron a base de datos incorrectos:

**1. El salto por el EC2 no es opcional: es lo único que hace reales los datos.**
Plausible corre bajo OrbStack en macOS, y ahí la publicación de puertos entra por
un proxy en espacio de usuario que **sustituye la IP de origen** por la puerta de
enlace de la red Docker. Medido: toda petición llegaba como `192.168.97.1`,
incluidas las lanzadas desde una IP pública. Es arquitectónico —`network_mode:
host` tampoco lo evita ([orbstack#1727])— y ninguna configuración de Nginx Proxy
Manager puede recuperar una dirección que nunca le llega.

Plausible identifica visitantes únicos como `hash(sal_diaria, IP, User-Agent,
dominio)`. Con la IP constante, **los visitantes quedan deduplicados sólo por
User-Agent** —dos personas con el mismo Chrome son una— y la geolocalización es
siempre vacía. No son datos imprecisos: son datos falsos, y no se pueden
reconstruir después porque la IP no se almacena.

**2. Un solo nombre para el panel y para la ingesta.** El endpoint viaja cocido
dentro del script generado como `BASE_URL/api/event`, y `BASE_URL` gobierna
además la URL del panel y la comprobación CSWSH de los WebSockets. Separarlos en
dos subdominios deja el panel sirviendo páginas pero con su LiveView rechazado
por origen: reconexión infinita.

**3. El EC2 sobrescribe `X-Forwarded-For`, no lo antepone.** Nginx Proxy Manager
usa `$proxy_add_x_forwarded_for`, que **antepone** lo que envíe el cliente. Como
`PlausibleWeb.RemoteIP.get/1` toma el valor de más a la izquierda sin verificar
nada, eso permite a cualquier visitante declarar su país. Comprobado: un `curl`
con `X-Forwarded-For: 1.1.1.1` se registró como Australia. El bloque del EC2 usa
`$remote_addr`, que sobrescribe, y con ello cierra el agujero.

[orbstack#1727]: https://github.com/orbstack/orbstack/issues/1727

### Qué NO resuelve esta arquitectura

Los bloqueadores de rastreadores. El nombre sigue siendo `analytics.140d.art`.
Servir el tracker desde el propio origen `140d.art` exigiría mover `BASE_URL`, y
eso movería el panel con él.

---

## 1. Inventario previo

Antes de tocar nada, ten a mano:

| Dato | Dónde se usa | Ejemplo |
|---|---|---|
| Hostname DDNS del router | bloque nginx del EC2 | `xxxx.asuscomm.com` |
| IP elástica del EC2 | registro A de Route53 | `15.217.1.32` |
| IP LAN del Mac mini | reenvío de puertos del router | `192.168.50.215` |
| API key de Resend | correo de Plausible | `re_...` |
| Acceso a Route53 | DNS + reto DNS-01 de NPM | consola AWS |

Requisitos de la máquina que aloja Plausible: Docker (aquí **OrbStack** sobre
macOS), Nginx Proxy Manager ya funcionando con una red Docker externa llamada
`proxy-network`, y el puerto 443 del router reenviado a esa máquina.

> Las tres imágenes (`ghcr.io/plausible/community-edition:v3.2.1`,
> `postgres:16-alpine`, `clickhouse/clickhouse-server:24.12-alpine`) publican
> manifiestos **`linux/arm64` nativos**. En Apple Silicon no se emula nada.

---

## 2. Mac mini — instalar Plausible

### 2.1 Memoria de OrbStack

`memory_mib` es un **techo, no una reserva**: OrbStack devuelve a macOS la
memoria que no se usa, así que subirlo no cuesta nada mientras no haga falta.

```bash
sysctl -n hw.memsize          # 8589934592 = 8 GB · 17179869184 = 16 GB
orb config show
orb config set memory_mib 6144        # 8192 si el host tiene 16 GB
docker info --format '{{.MemTotal}}'  # ~6442450944
```

Si `docker info` no refleja el cambio, reinicia OrbStack (`orb restart`). La
ventana de la aplicación puede seguir mostrando el valor antiguo aunque el
cambio esté aplicado; fíate de `docker info`.

> **Subir el techo global SIN poner límites por contenedor empeora las cosas.**
> ClickHouse y MongoDB dimensionan sus cachés a partir de la memoria que *creen*
> tener: con 6 GB visibles, ClickHouse se reserva 0,9 × 6 = 5,4 GB. Los límites
> del §2.5 son lo que de verdad protege a los vecinos.

### 2.2 Clonar

```bash
cd ~/projects
git clone -b v3.2.1 --single-branch \
  https://github.com/plausible/community-edition plausible-ce
cd plausible-ce
```

### 2.3 `.env`

```bash
cat > .env <<EOF
BASE_URL=https://analytics.140d.art
SECRET_KEY_BASE=$(openssl rand -base64 48)
TOTP_VAULT_KEY=$(openssl rand -base64 32)
HTTP_PORT=8000

MAILER_ADAPTER=Bamboo.Mua
MAILER_EMAIL=plausible@140d.art
MAILER_NAME=140d Analytics
SMTP_HOST_ADDR=smtp.resend.com
SMTP_HOST_PORT=587
SMTP_USER_NAME=resend
SMTP_USER_PWD=<API_KEY_DE_RESEND>
SMTP_HOST_SSL_ENABLED=false
EOF
chmod 600 .env
```

Cuatro decisiones que no se ven en el fichero:

- **`HTTPS_PORT` está ausente a propósito.** Si defines `HTTP_PORT=80` y
  `HTTPS_PORT=443`, Plausible intenta emitir y renovar sus propios certificados
  de Let's Encrypt. Con NPM delante, eso son dos ACME peleándose por el mismo
  dominio.
- **`DISABLE_REGISTRATION` tampoco aparece todavía.** El valor por defecto
  (`invite_only`) es lo que permite crear el primer usuario. Ponerlo a `true`
  antes del alta inicial es la forma de quedarte fuera de tu propia instancia.
  Se activa en el §6.
- **`TOTP_VAULT_KEY` explícito** aunque sea opcional: por defecto se deriva de
  `SECRET_KEY_BASE`, de modo que rotar el segundo dejaría sin 2FA a todas las
  cuentas.
- **SMTP por relay.** El valor por defecto de `Bamboo.Mua` es entrega SMTP
  **directa** desde la máquina; desde una IP residencial eso es spam o rechazo
  garantizado, y sin correo no hay recuperación de contraseña. Definir
  `SMTP_HOST_ADDR` hace que el mismo adaptador use el relay.

### 2.4 `clickhouse/kuadrat-tuning.xml`

```bash
cat > clickhouse/kuadrat-tuning.xml <<'EOF'
<clickhouse>
    <!-- low-resources.xml (del repo oficial) pone 500 MB, dimensionados para
         una instancia dedicada. Para el tráfico de 140d.art, 128 MB sobran. -->
    <mark_cache_size>134217728</mark_cache_size>

    <!-- NO BAJAR DE ~1 GB. ClickHouse 24.12 contabiliza ~666 MiB EN REPOSO con
         la base vacía (334 MiB de RSS más cachés y, bajo cgroup v2, parte del
         page cache). Con el techo en 700 MB no podía ni volcar 117 bytes: cada
         flush moría con `Code: 241 MEMORY_LIMIT_EXCEEDED`, el GenServer
         Plausible.Event.WriteBuffer reventaba en cada tick, y POST /api/event
         seguía respondiendo "ok" porque la aceptación ocurre ANTES de la
         persistencia. Los eventos se perdían entre el búfer y la tabla. -->
    <max_server_memory_usage>1100000000</max_server_memory_usage>
</clickhouse>
EOF
```

### 2.5 `compose.override.yml`

```yaml
services:
  plausible:
    container_name: plausible
    networks:
      - default          # ← IMPRESCINDIBLE, ver aviso
      - proxy-network
    ports:
      - 127.0.0.1:8000:8000   # sólo para diagnóstico local
    deploy:
      resources:
        limits:
          memory: 768M

  plausible_db:
    deploy:
      resources:
        limits:
          memory: 384M

  plausible_events_db:
    volumes:
      - ./clickhouse/kuadrat-tuning.xml:/etc/clickhouse-server/config.d/kuadrat-tuning.xml:ro
    deploy:
      resources:
        limits:
          memory: 1536M
```

> **El `- default` es la línea que rompe si falta.** El `compose.yml` oficial no
> declara `networks` en el servicio `plausible`, así que vive en la red `default`
> implícita, que es por donde alcanza a Postgres y ClickHouse. En cuanto el
> override declara una lista, ésta **sustituye** a la implícita y Plausible
> arranca sin ver ninguna de sus dos bases de datos. El error aparece en
> `db migrate` y no apunta en absoluto a la causa.

El `volumes:` de `plausible_events_db` **añade** al del `compose.yml` (las listas
de volúmenes se concatenan); sólo `networks` tiene semántica de reemplazo.

**Regla de oro de los límites:** el tope del cgroup (`memory:`) debe quedar
cómodamente **por encima** del contador interno de ClickHouse
(`max_server_memory_usage`). Así ClickHouse rechaza una consulta —recuperable—
antes de que el kernel mate el proceso —no recuperable—. Aquí: 1,1 GB de
contador bajo un cgroup de 1536 MB.

**No actives MaxMind.** La base city-level pide, según el wiki oficial, ~1 GB
adicional de RAM. La base de db-ip que viene en la imagen da país, que es
suficiente.

### 2.6 Arrancar

```bash
docker compose up -d
docker compose ps                     # los tres, healthy
curl --head http://localhost:8000
```

`HTTP/1.1 302 Found` con `location: /register` y `server: Cowboy` es la
**respuesta sana** en una instalación recién creada: no hay usuarios todavía. El
`200 OK` que muestra el wiki corresponde a una instancia ya configurada.

Verifica que el ajuste de ClickHouse se aplicó:

```bash
docker compose exec plausible_events_db clickhouse-client --query \
  "SELECT name, value FROM system.server_settings
    WHERE name IN ('max_server_memory_usage','mark_cache_size') FORMAT Vertical"
```

Debe devolver `1100000000` y `134217728`. Si sale `0` o `524288000`, el fichero
no se montó: revisa la ruta del `volumes:` y repite `docker compose up -d`.

---

## 3. Nginx Proxy Manager

**Hosts ▸ Proxy Hosts ▸ Add Proxy Host.** Es un **Proxy Host**, no un
*Redirection Host*: el segundo devuelve un 301 al navegador y no proxea nada, ni
tiene la casilla de WebSockets.

| Pestaña | Campo | Valor |
|---|---|---|
| Details | Domain Names | `analytics.140d.art` |
| Details | Scheme | `http` |
| Details | Forward Hostname | `plausible` |
| Details | Forward Port | `8000` |
| Details | **Websockets Support** | **✅ ON** |
| Details | Block Common Exploits | ✅ |
| SSL | Certificate | Request a new SSL Certificate |
| SSL | **Use DNS Challenge** | ✅ → Route53 |
| SSL | Force SSL · HTTP/2 | ✅ ✅ |

**Websockets Support es obligatorio.** El panel es Phoenix LiveView y habla por
`/live/websocket`. Sin la casilla, el panel carga y luego se queda reconectando
para siempre — un fallo que parece de red y es de configuración.

**El reto DNS-01 con la integración de Route53 elimina el puerto 80.** No hace
falta reenviarlo desde el router, y la renovación deja de depender de que la IP
dinámica esté correctamente apuntada en ese momento.

### Lo que NO hay que tocar

- **Pestaña «Advanced»: vacía.** NPM ya emite `Host`, `X-Forwarded-Proto`,
  `X-Forwarded-For` y `X-Real-IP`. Añadir directivas ahí no sirve: el custom
  config se inserta a nivel de `server` y las cabeceras de NPM viven a nivel de
  `location`, que gana.
- **SSL ▸ Advanced ▸ «Trust Upstream Forwarded Proto Headers»: apagado.** Sólo
  aplica cuando NPM está detrás de otro proxy que ya terminó el TLS (Cloudflare,
  otro nginx). Aquí el router hace NAT, no termina TLS. Activarlo haría que NPM
  se creyera una cabecera que cualquier cliente puede enviar.

---

## 4. DNS y router

**Route53** — `analytics.140d.art` apunta al **EC2**, no a casa:

| Nombre | Tipo | Valor | TTL |
|---|---|---|---|
| `analytics.140d.art` | `A` | `<IP elástica del EC2>` | 300 |

**Router ASUS:**

```
443  ✅ reenviar a la IP LAN del Mac mini
 80  ⬜ innecesario (se usa DNS-01 para el certificado de NPM)
 81  ❌ NUNCA reenviar (es el panel de administración de NPM)
```

Da al Mac mini una **reserva DHCP fija**. Sin ella, el día que cambie su IP de
LAN el reenvío apunta a la nada y el fallo parece de DNS.

*Endurecimiento opcional:* con el DNS apuntando al EC2, nada más necesita
alcanzar el 443 de la casa. Restringir ese reenvío a la IP elástica del EC2
reduce la superficie a un solo origen. Contrapartida: si esa IP cambiara, la
analítica deja de funcionar sin más aviso que un 502 en el log.

---

## 5. EC2 — el salto que hace reales los datos

La configuración **ya está versionada** en el repositorio: es el sexto bloque
`server` de `deploy/nginx/140d.art.conf`, más su compañero del puerto 80. No hay
que escribirla; hay que instalarla y emitir el certificado.

Detalles de ese bloque que conviene conocer antes de tocarlo:

- `proxy_set_header X-Forwarded-For $remote_addr` — **sobrescribe**. Ver §0.3.
- `resolver` + variable en `proxy_pass` — sin eso nginx resolvería el nombre
  DDNS **una sola vez al arrancar** y seguiría enviando a la IP vieja hasta el
  siguiente reload. Un fallo que aparece semanas después.
- **Timeouts separados por ruta:** 5 s en `/api/event` (el beacon es
  dispara-y-olvida para el visitante, pero una conexión colgada consume recursos
  en la instancia que además renderiza la galería) y 3600 s en
  `/live/websocket` (con 5 s, el socket del panel moriría cada cinco segundos).
- **Sin `proxy_cache` en ningún `location`** de ese bloque.
- **Sin `ipv6only=on`**: es un parámetro por dirección:puerto, ya está declarado
  en el primer bloque del fichero, y repetirlo **aborta el arranque de nginx**.
- **`listen ... http2` como parámetro**, no la directiva `http2 on;`: la
  instancia corre nginx 1.24 y esa directiva no existe hasta la 1.25.1.

### Procedimiento, en este orden exacto

```bash
# 1. ⚠️ Sustituir el placeholder por el DDNS real del router
#    deploy/nginx/140d.art.conf:
#      set $plausible_casa https://CAMBIAR-POR-TU-HOST.asuscomm.com;

# 2. Confirmar que el DNS ya resuelve al EC2 (§4)
dig +short analytics.140d.art

# 3. Instalar y validar (SÓLO nginx: no ejecutes deploy.sh todavía)
sudo cp deploy/nginx/140d.art.conf /etc/nginx/sites-available/140d.art
sudo nginx -t && sudo systemctl reload nginx
```

En este punto `analytics.140d.art` responde con el certificado de `140d.art`,
que **todavía no lleva ese SAN**: el navegador avisará de nombre incorrecto. Es
esperado y dura lo que tardes en el paso siguiente.

```bash
# 4. Ampliar el certificado EXISTENTE. --cert-name mantiene la misma lineage,
#    así que /etc/letsencrypt/live/140d.art/ NO cambia de ruta y el .conf no
#    hay que tocarlo. Los cuatro nombres comparten un único certificado
#    multi-SAN; NO existe live/analytics.140d.art/ y referenciarlo impediría
#    arrancar nginx.
sudo certbot certonly --nginx --cert-name 140d.art --expand \
  -d 140d.art -d www.140d.art -d api.140d.art -d analytics.140d.art

sudo nginx -t && sudo systemctl reload nginx
```

**El orden nginx → DNS, y no al revés.** Con la configuración instalada y el DNS
todavía apuntando a casa, el bloque nuevo está inerte y no hay ninguna ventana en
la que el nombre resuelva a un host que no sabe servirlo.

---

## 6. Primer usuario y cierre del registro

1. Abre `https://analytics.140d.art` **desde fuera de la LAN**.
2. Crea la cuenta propietaria.
3. Da de alta el sitio **`140d.art`** — sin `https://`, sin `www`. Si no coincide
   exactamente, los eventos se rechazan.
4. En la pantalla de instalación, **copia el `src` del snippet**. Contiene el id
   `pa-<...>` que necesitarás en el §8.
5. Comprueba que el panel **mantiene** el WebSocket (si reconecta en bucle, es
   Websockets Support apagado en NPM).
6. Cierra el registro:

```bash
echo "DISABLE_REGISTRATION=true" >> .env
docker compose up -d
```

---

## 7. Verificación — el paso que no se puede saltar

**No conectes la web hasta que esto pase.** Es la única comprobación que
distingue una instalación correcta de una que recoge datos falsos sin dar ningún
error.

Lánzalo **desde una IP pública** (el propio EC2 sirve) y **sin inyectar ninguna
cabecera**. Una prueba desde la LAN no vale: una IP privada no geolocaliza, y da
el mismo síntoma que la cadena rota.

```bash
ssh <ec2>
curl -sS -X POST https://analytics.140d.art/api/event \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' \
  -d '{"name":"pageview","url":"https://140d.art/verificacion","domain":"140d.art"}'
```

Responde `ok`. **Eso no significa que se haya almacenado**: la aceptación ocurre
antes de la persistencia. Compruébalo en el Mac mini:

```bash
cd ~/projects/plausible-ce
docker compose exec plausible_events_db clickhouse-client --query \
  "SELECT timestamp, pathname, country_code
     FROM plausible_events_db.events_v2 ORDER BY timestamp DESC LIMIT 5 FORMAT Vertical"
```

| Resultado | Significa | Qué revisar |
|---|---|---|
| `country_code` con país | ✅ Todo correcto | — |
| `country_code` vacío | La IP real no llega | §5: bloque del EC2, `$remote_addr`, DNS apuntando al EC2 |
| **No aparece la fila** | El evento se aceptó y se perdió | `docker compose logs plausible`: si hay `Code: 241 MEMORY_LIMIT_EXCEEDED`, es el §2.4 |
| No aparece + logs limpios | El evento fue rechazado | El `domain` del JSON no coincide con el sitio registrado |

Herramientas de aislamiento, si algo falla:

```bash
# ¿Sabe geolocalizar? x-plausible-ip tiene prioridad sobre todo lo demás
curl ... -H 'X-Plausible-IP: 8.8.8.8' ...     # debe registrarse como US

# ¿Qué IP ve NPM? Busca el campo [Client ...]
docker exec nginx-proxy-manager sh -c \
  'grep -h "/api/event" /data/logs/proxy-host-*_access.log | tail -n 5'
```

Si el log muestra una IP privada tipo `192.168.x.1`, comprueba si es la red de
Docker o la LAN del Mac:

```bash
docker network inspect proxy-network --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'
netstat -rn | grep -m1 default
```

Coincidir con la primera es el síntoma descrito en §0.1: falta el salto del EC2.

---

## 8. Conectar la web (repositorio)

Sólo producción. La supresión en preproducción ya la garantiza
`NEXT_PUBLIC_APP_ENV=preprod`, que es **de tiempo de compilación**: si estuviera
mal, la fuga ocurriría en la siguiente **reconstrucción**, no en un reinicio.

**`client/app/layout.js`** — bajo `IS_PROD` (de `@/lib/env`), tras cerrar
`</CookieConsentProvider>`:

```jsx
{IS_PROD && (
  <>
    <Script id="plausible-init" strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html:
        `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()` }} />
    <Script strategy="afterInteractive"
      src="https://analytics.140d.art/js/pa-<ID>.js" />
  </>
)}
```

El *stub* de cola no hace falta para los pageviews —el propio script los emite—
pero sin él cualquier evento personalizado disparado antes de que cargue el
script externo se pierde de forma intermitente: un fallo dependiente de la
latencia que no se reproduce en local.

**`client/next.config.js`** — `https://analytics.140d.art` en **las dos**
directivas: `script-src` (descargar el tracker) y el array `cspConnectSrc`
(el `POST` de cada evento). Con sólo la primera, el script carga, se ejecuta y
**no registra ni un evento**; la única evidencia queda en la consola del
visitante. `grep -c "analytics.140d.art" client/next.config.js` debe dar `2`.

**`client/app/legal/politica-de-cookies/page.js`** — el tracker no instala
cookies ni identificadores persistentes, así que queda fuera del art. 22.2 LSSI
y **no requiere consentimiento previo**; eso no exime del deber de información.
La página declara que la instancia es autoalojada, que no usa cookies y que por
eso no se pide permiso, diferenciándolo del píxel de Meta, que sí depende del
consentimiento publicitario.

**Verificación antes de desplegar:**

```bash
# NODE_ENV=production es obligatorio: los contenedores locales usan
# 'development' y next build falla bajo él con un error de React engañoso.
docker compose exec -e NODE_ENV=production -e NEXT_PUBLIC_APP_ENV=production \
  client npm run build
docker compose exec client sh -c "grep -rl 'pa-' .next/server/app/*.html | head"

docker compose exec -e NODE_ENV=production -e NEXT_PUBLIC_APP_ENV=preprod \
  client npm run build
docker compose exec client sh -c "grep -rl 'analytics.140d.art' .next/server --include='*.html'"
# debe salir vacío. Una coincidencia en un .js.map es sourcesContent del mapa
# de fuentes del lado servidor y es inocua: el .js emitido tiene 0.
```

**Desplegar:** `./deploy/deploy.sh`. La purga de la caché de nginx es
obligatoria y ya va dentro del script.

> **Aviso sobre el despliegue en el EC2.** `next build` con Turbopack pide del
> orden de 2 GB, y el `t4g.medium` tiene 4 GB compartidos con los contenedores
> viejos, que siguen en marcha a propósito. Sin swap, el kernel mata la
> compilación con `npm error signal SIGKILL` —sin ningún error de compilación—.
> Ver §9.4.

---

## 9. Operación

### 9.1 Copias de seguridad

Qué salvar: el `.env` (sin `SECRET_KEY_BASE` no hay recuperación posible), la
configuración, y los volúmenes `db-data` (cuentas y sitios) y `event-data` (los
eventos). `plausible-data` y `event-logs` se regeneran.

Copia en frío: parar el escritor, volcar Postgres en caliente, parar ClickHouse
y copiar su volumen. Unos 40 s de ingesta perdida de madrugada.

```bash
#!/bin/bash
set -euo pipefail
STACK="$HOME/projects/plausible-ce"; DEST="$HOME/backups/plausible"
DOCKER="$HOME/.orbstack/bin/docker"; STAMP=$(date +%Y-%m-%d); DAY=$(date +%d)
mkdir -p "$DEST/daily" "$DEST/monthly"; cd "$STACK"

"$DOCKER" compose stop plausible
"$DOCKER" compose exec -T plausible_db \
  pg_dump -U postgres -d plausible_db --clean --if-exists \
  | gzip > "$DEST/daily/$STAMP-postgres.sql.gz"
"$DOCKER" compose stop plausible_events_db
"$DOCKER" run --rm -v plausible-ce_event-data:/data:ro -v "$DEST/daily":/backup \
  alpine tar czf "/backup/$STAMP-clickhouse.tar.gz" -C /data .
"$DOCKER" compose start plausible_events_db plausible

tar czf "$DEST/daily/$STAMP-config.tar.gz" -C "$STACK" \
  .env compose.override.yml clickhouse/kuadrat-tuning.xml

[ "$DAY" = "04" ] && cp "$DEST/daily/$STAMP-"*.gz "$DEST/monthly/"
find "$DEST/daily" -name '*.gz' -mtime +15 -delete
echo "$(date -Iseconds) ok" >> "$DEST/last-run.log"
```

Verifica el nombre del volumen con `docker volume ls` (lo prefija el nombre del
directorio del proyecto). Guarda el script en `~/projects/plausible-ce/backup.sh`
con `chmod 700`, y prográmalo con **launchd**, no con cron: en macOS moderno cron
tropieza con los permisos de disco completo, y launchd además ejecuta al
despertar si la máquina estaba suspendida.

```xml
<!-- ~/Library/LaunchAgents/art.140d.plausible-backup.plist -->
<key>Label</key><string>art.140d.plausible-backup</string>
<key>ProgramArguments</key>
<array><string>/Users/USUARIO/projects/plausible-ce/backup.sh</string></array>
<key>StartCalendarInterval</key>
<dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>30</integer></dict>
```

```bash
launchctl load ~/Library/LaunchAgents/art.140d.plausible-backup.plist
launchctl start art.140d.plausible-backup      # probarlo ya, no esperar
```

**Restauración** (ensáyala una vez; una copia sin restaurar no es una copia):

```bash
cd ~/projects/plausible-ce && docker compose down     # NO uses --volumes
docker compose up -d plausible_db
gunzip -c ~/backups/plausible/daily/<FECHA>-postgres.sql.gz | \
  docker compose exec -T plausible_db psql -U postgres -d plausible_db
docker run --rm -v plausible-ce_event-data:/data alpine sh -c 'rm -rf /data/*'
docker run --rm -v plausible-ce_event-data:/data -v ~/backups/plausible/daily:/backup \
  alpine tar xzf /backup/<FECHA>-clickhouse.tar.gz -C /data
docker compose up -d
```

**Dos huecos conocidos.** Una copia en el mismo disco no es una copia: asegúrate
de que `~/backups` entra en Time Machine o se sincroniza fuera —y ten en cuenta
que el tarball de configuración contiene `SECRET_KEY_BASE` y la API key de
Resend—. Y si el script falla, nadie avisa: la alerta vive dentro del proceso que
no se ejecutó. Revisa `last-run.log`, o añade un `trap ... ERR` que dispare un
correo por Resend.

### 9.2 Actualizar Plausible

```bash
cd ~/projects/plausible-ce
git pull origin vX.Y.Z
docker compose up -d
docker images --filter=reference='*plausible*'   # limpiar las viejas con docker rmi
```

Haz copia antes. Los cambios de versión mayor pueden requerir migraciones
descritas en las notas de la release. `compose.override.yml` y
`clickhouse/kuadrat-tuning.xml` no están versionados por el repo oficial y
sobreviven al `git pull` — pero compruébalo tras cada actualización.

### 9.3 Techos de memoria de los vecinos

Los contenedores sin `memory:` pueden llevarse toda la VM. Nginx Proxy Manager
en particular sostiene el acceso a todo lo demás. Valores de referencia (3–5× el
uso observado; más apretado convierte una degradación lenta en un `exit 137`):

| Contenedor | Techo sugerido |
|---|---|
| `nginx-proxy-manager` | 384M |
| MongoDB u otras BBDD | 768M |
| Servicios de aplicación | 256M–512M |

```bash
docker update --memory 384m --memory-swap 384m nginx-proxy-manager  # en caliente, NO persiste
for c in $(docker ps -aq); do
  docker inspect $c --format '{{.Name}} OOM={{.State.OOMKilled}} exit={{.State.ExitCode}}'
done
docker events --filter event=oom     # vigilancia en vivo los primeros días
```

### 9.4 Espacio y memoria del EC2

```bash
sudo dmesg -T | grep -i -E "killed process|out of memory" | tail
free -h ; swapon --show ; df -h /
```

Swap de 2 GB (suficiente; 4 GB compromete demasiado disco):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
```

`swappiness=10` es deliberado: que el swap esté para el pico de la compilación,
no para que el kernel mueva páginas del runtime y añada latencia al render, que
es donde está el cuello de botella medido de esa instancia.

Al calcular espacio libre recuerda que las cachés de nginx tienen reserva
comprometida que `df` todavía no muestra: `kuadrat_img` puede crecer hasta
`max_size=2g` y `kuadrat_html` hasta 500 MB.

---

## 10. Anexo · Fallos ya vividos, por síntoma

| Síntoma | Causa real | Sección |
|---|---|---|
| `db migrate` falla al arrancar | Falta `- default` en `networks` del override | §2.5 |
| `POST /api/event` da `ok` pero no hay filas en ClickHouse | `max_server_memory_usage` por debajo del suelo de ClickHouse | §2.4 |
| `country_code` vacío desde una IP pública | Falta el salto por el EC2; OrbStack sustituye la IP de origen | §0.1, §5 |
| `country_code` vacío en pruebas desde la LAN | Normal: una IP privada no geolocaliza. La prueba es inválida | §7 |
| El panel carga y reconecta sin parar | Websockets Support apagado en NPM, o `proxy_read_timeout` corto en `/live/websocket` | §3, §5 |
| El script carga pero no se registra nada | Falta `analytics.140d.art` en `connect-src` de la CSP | §8 |
| Un `curl` con `X-Forwarded-For` falso fija el país | `$proxy_add_x_forwarded_for` antepone; el EC2 debe usar `$remote_addr` | §0.3 |
| `400 Bad Request` en las pruebas con `curl` | JSON mal escapado al anidar comillas dentro de `ssh "..."` | §7 |
| `npm error signal SIGKILL` en el despliegue | OOM killer durante `next build`: falta swap en el EC2 | §9.4 |
| nginx no arranca tras editar el `.conf` | `ipv6only=on` repetido, `http2 on;` en nginx 1.24, o ruta de certificado inexistente | §5 |
| No se puede registrar el primer usuario | `DISABLE_REGISTRATION=true` puesto antes del alta inicial | §2.3 |

---

## 11. Anexo · Recuperación ante desastre

### Se destruye la instancia EC2

Plausible y sus datos **no están ahí**: viven en el Mac mini. Sólo se pierde el
salto que entrega la IP real.

1. Levantar el EC2 y desplegar el repositorio como de costumbre.
2. Reasignar la IP elástica, o actualizar el registro A de `analytics.140d.art`
   (§4).
3. Reinstalar la configuración de nginx y **emitir el certificado multi-SAN
   incluyendo `analytics.140d.art`** (§5).
4. Repetir la verificación del §7 antes de dar por bueno nada.

Mientras tanto la analítica no recoge nada — el nombre no resuelve o no
responde. No recoge datos malos, que es lo importante: el script falla en
silencio y ningún visitante se entera.

### Se pierde el Mac mini

1. Instalar OrbStack, Nginx Proxy Manager y crear la red `proxy-network`.
2. Rehacer §2 completo. **Restaurar el `.env` de la copia**: si se ha perdido,
   `SECRET_KEY_BASE` es irrecuperable y hay que empezar con cuentas nuevas.
3. Restaurar los volúmenes (§9.1).
4. Rehacer el Proxy Host de NPM (§3).
5. Si el hostname DDNS cambió, actualizar `set $plausible_casa` en
   `deploy/nginx/140d.art.conf` y desplegar.
6. **Si hubo que crear el sitio de nuevo, el id `pa-<...>` cambia** y el literal
   de `client/app/layout.js` queda obsoleto: el script pasa a dar 404 sin ningún
   error visible. Hay que actualizarlo y reconstruir el cliente.

---

## Referencias

- `deploy/nginx/README.md` — el bloque del EC2 y el procedimiento de certificado
- `deploy/README.md` — el script de despliegue
- `openspec/changes/plausible-self-hosted-analytics/` — propuesta, diseño y
  decisiones con su porqué
- `CLAUDE.md`, sección «Plausible Analytics» — resumen para agentes
- [Wiki oficial de Plausible CE](https://github.com/plausible/community-edition/wiki)
