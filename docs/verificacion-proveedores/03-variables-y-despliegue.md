# 03 · Variables de entorno y despliegue

**Objetivo:** activar las tarjetas de Google y Microsoft en cada entorno, y saber apagarlas.

## Las tres variables

Todas van en el fichero de entorno del servicio **api**, y ninguna es secreta. No son `NEXT_PUBLIC_*`: el cliente no necesita reconstruirse para que aparezcan o desaparezcan las tarjetas, porque las pide a la API.

| Entorno | Fichero (`env_file` del servicio `api`) |
|---|---|
| Producción (`docker-compose.prod.yml`) | `api/.env` |
| Preproducción (`docker-compose.pre2.yml`, `docker-compose.m1.yml`) | `api/.env.staging` |
| Local con Docker (`docker-compose.local.yml`) | `api/.env.local` |
| Local con `docker-compose.yml` o `npm run dev` | `api/.env` |

| Variable | Qué es | Formato | Si falta |
|---|---|---|---|
| `GOOGLE_OIDC_CLIENT_ID` | ID de cliente de Google (guía 01, §4 o §5) | termina en `.apps.googleusercontent.com` | No hay tarjeta de Google |
| `MICROSOFT_OIDC_CLIENT_ID` | Id. de aplicación de Microsoft (guía 02, §2) | GUID | No hay tarjeta de Microsoft |
| `IDENTITY_CALLBACK_BASE_URL` | Origen público de la API para las URIs de vuelta | URL sin barra final | Se usa `SITE_API_BASE_URL` |

Un valor con formato incorrecto **impide arrancar la API**, con un mensaje que nombra la variable.

## Valores por entorno

**Producción** (cliente de Google «140d — producción»):

```env
GOOGLE_OIDC_CLIENT_ID=<id de producción>.apps.googleusercontent.com
MICROSOFT_OIDC_CLIENT_ID=<GUID de la app>
# IDENTITY_CALLBACK_BASE_URL sin definir: vale SITE_API_BASE_URL = https://api.140d.art
```

**Preproducción** (cliente «140d — preproducción y local»):

```env
GOOGLE_OIDC_CLIENT_ID=<id de preproducción>.apps.googleusercontent.com
MICROSOFT_OIDC_CLIENT_ID=<GUID de la app>
# IDENTITY_CALLBACK_BASE_URL sin definir: vale SITE_API_BASE_URL = https://api.pre.140d.art
```

**Local** (mismo cliente que preproducción):

```env
GOOGLE_OIDC_CLIENT_ID=<id de preproducción>.apps.googleusercontent.com
MICROSOFT_OIDC_CLIENT_ID=<GUID de la app>
IDENTITY_CALLBACK_BASE_URL=http://localhost:3001
```

> En local, `SITE_API_BASE_URL` apunta por defecto a preproducción, porque alimenta los enlaces de los emails. Por eso hace falta `IDENTITY_CALLBACK_BASE_URL`: sin ella, la vuelta de Google iría a la API de preproducción, que no tiene la cookie del flujo, y fallaría con «Tu navegador no conservó la verificación».
>
> **En local, prueba con Chrome o Firefox.** Las cookies del flujo son `Secure`, y Safari no las acepta en `http://localhost`.

## Desplegar

1. Añade las variables al fichero de entorno de la API del entorno (tabla de arriba).
2. Despliega **API y cliente juntos** con `./deploy/deploy.sh`, la primera vez: el cliente nuevo llama a rutas nuevas.
3. Comprueba:

   ```bash
   curl -s https://api.140d.art/api/events/identity/providers
   # {"success":true,"providers":["google","microsoft"]}
   ```

   (En preproducción, `https://api.pre.140d.art/...`.)
4. Recorre la matriz de la guía 04.

## Apagar una tarjeta sin desplegar

Borra (o comenta) su variable del fichero de entorno de la API y reinicia solo la API. En cinco minutos, el tiempo de caché de `/identity/providers`, la tarjeta desaparece. Una página ya abierta no se entera hasta que se recarga, y si alguien la pulsa, vuelve al paso de métodos con «No hemos podido confirmar tu cuenta». El código por email no depende de nada de esto.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Google muestra `redirect_uri_mismatch` | La URI de vuelta no coincide con la registrada en el cliente | Compara carácter a carácter con la tabla del README (sin barra final, `https` en servidores). Comprueba `IDENTITY_CALLBACK_BASE_URL` |
| Microsoft muestra `AADSTS50011` | Lo mismo en Microsoft | Guía 02, §3 |
| Microsoft muestra `unsupported_response_type` | «Tokens de id» sin marcar | Guía 02, §3 punto 2 |
| Vuelve con «Tu navegador no conservó la verificación» | La cookie del flujo no volvió: más de 10 min en la pantalla del proveedor, cookies bloqueadas o, en local, Safari | Repetir; usar el código por email; en local, Chrome |
| Vuelve con «Tu cuenta usa un email que gestiona otro proveedor» | Cuenta de Google o Microsoft con un email ajeno | Es lo esperado: pasa al código por email |
| La tarjeta de Google de preproducción dejó de funcionar tras meses parada | Google borró el cliente sin uso | Guía 01, «Avisos» |
