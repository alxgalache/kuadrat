# Desarrollo local — problemas conocidos

## `EMFILE: too many open files, watch '/app'` al arrancar la API

### Síntoma

El contenedor `kuadrat-api` levantado con `docker-compose.local.yml` (que ejecuta
`npm run dev`, es decir nodemon) muere en bucle nada más arrancar:

```
[nodemon] starting `node --inspect=0.0.0.0:9229 server.js`
[nodemon] Internal watch failed: EMFILE: too many open files, watch '/app'
```

El contenedor `kuadrat-client` sigue funcionando, lo que despista: parece un
problema de la API.

### Qué NO es

**No es un límite de descriptores de fichero del proceso** (`ulimit -n` son 1024
blandos / 524288 duros dentro del contenedor, de sobra) **ni un exceso de ficheros
vigilados**. `fs.inotify.max_user_watches` está en 65536 y `api/` tiene menos de
1000 ficheros.

Tampoco es un problema de nodemon: la llamada primitiva falla igual.

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml \
  run --rm --entrypoint sh api -c 'node -e "require(\"fs\").watch(\"/app\",()=>{})"'
# EMFILE: too many open files, watch '/app'
```

### Qué es

`fs.inotify.max_user_instances` — el número de **instancias** de inotify que puede
tener abiertas un mismo UID — agotado. Cuando se agota, `inotify_init1()` devuelve
`EMFILE`, y ese es el errno que Node propaga textualmente.

Dos hechos lo hacen inevitable en esta máquina:

1. El límite por defecto de Ubuntu es **128**, que es muy bajo para un escritorio
   moderno.
2. `api/Dockerfile` termina en `USER node`, y el usuario `node` de la imagen
   `node:20-alpine` es **UID 1000** — el mismo UID que el usuario del host. Sin
   `userns-remap`, los límites de inotify se contabilizan por UID real, así que
   **el contenedor de la API compite por el mismo pool de 128 instancias que el
   escritorio**. El contenedor del cliente corre como root (UID 0), que tiene su
   propio pool: por eso sobrevive.

En el diagnóstico de 18/08/2026 el pool del UID 1000 estaba en 122/128, con **33
procesos `junie`** (el agente de JetBrains) consumiendo entre 3 y 6 instancias cada
uno — unas 80 de las 128. Cualquier IDE, navegador o herramienta de sincronización
que se abra puede agotarlo.

Para comprobar el estado actual:

```sh
# límite
cat /proc/sys/fs/inotify/max_user_instances

# instancias en uso por el usuario
for p in /proc/[0-9]*; do
  n=$(ls -l $p/fd 2>/dev/null | grep -c 'anon_inode:inotify')
  [ "$n" -gt 0 ] && echo "$(stat -c %u $p 2>/dev/null) $n"
done | awk -v u=$(id -u) '$1==u {s+=$2} END {print "instancias en uso: " s}'
```

### Solución

Subir el límite del host. Es configuración de la máquina de desarrollo: no vive en
el repositorio, no entra en ninguna imagen y **no afecta a staging ni a producción**
(que además arrancan con `npm run start` / `node server.js`, sin nodemon ni ningún
watcher).

```sh
sudo tee /etc/sysctl.d/99-inotify.conf >/dev/null <<'CONF'
# Ubuntu trae 128 instancias por UID, insuficiente para un escritorio con IDE,
# navegador y contenedores de desarrollo compartiendo el UID 1000 (ver
# docs/desarrollo-local.md). 1024 es el valor que usan Docker Desktop y VS Code.
fs.inotify.max_user_instances = 1024
fs.inotify.max_user_watches = 524288
CONF

sudo sysctl --system
```

El cambio es inmediato y persistente entre reinicios. Después:

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d api
```

### Alternativa si no se puede tocar el host

`npm run dev:poll` arranca nodemon con `--legacy-watch`, que sondea el sistema de
ficheros en lugar de usar inotify y por tanto no consume ninguna instancia. Cuesta
CPU (por eso no es el modo por defecto), pero `api/nodemon.json` reduce el ámbito
vigilado a 177 ficheros, así que el sondeo es asumible.

Para usarlo de forma permanente, sobreescribir el comando en
`docker-compose.local.yml`:

```yaml
services:
  api:
    command: npm run dev:poll
```

## `api/nodemon.json`

Existe para acotar lo que vigila nodemon en desarrollo. **Solo tiene efecto con
`npm run dev` / `npm run pre`**: staging arranca con `npm run start` y producción
usa `Dockerfile.prod`, que instala con `npm ci --omit=dev` y ni siquiera contiene
nodemon.

Las exclusiones no son cosmética:

- `uploads/**` — 758 MB y 568 ficheros montados por bind mount. Vigilarlos gasta
  descriptores inotify sin ninguna razón.
- `coverage/**` — lo regenera `npm test` y contiene `.json`, es decir, una de las
  extensiones que reinician la API. Lanzar los tests reiniciaba el servidor.
- `.tmp/**` — la base SQLite local de los tests.
- `tests/**`, `assets/**`, `*.db`, `*.log` — nunca forman parte del servidor en
  ejecución.
