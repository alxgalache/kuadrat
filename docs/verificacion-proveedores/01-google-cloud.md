# 01 · Google Cloud: pantalla de consentimiento y clientes OAuth

**Objetivo:** obtener `GOOGLE_OIDC_CLIENT_ID` para producción y otro para preproducción y local, y comprobar antes de programar que Google devuelve lo que el diseño espera.

**Necesitas:** una cuenta de Google con acceso a [Google Cloud Console](https://console.cloud.google.com/). Es gratis y no hace falta tarjeta para esto.

**Lo que vas a registrar:**

| Dato | Valor |
|---|---|
| Nombre de la app | `140d` |
| Página principal | `https://140d.art` |
| Política de privacidad | `https://140d.art/legal/politica-de-privacidad` |
| Condiciones | `https://140d.art/legal/normas-eventos` |
| Dominio autorizado | `140d.art` |
| Ámbitos | `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` |
| URI de vuelta (producción) | `https://api.140d.art/api/events/identity/google/callback` |
| URI de vuelta (preproducción) | `https://api.pre.140d.art/api/events/identity/google/callback` |
| URI de vuelta (local) | `http://localhost:3001/api/events/identity/google/callback` |

---

## 1. Proyecto

1. En la consola, abre el selector de proyecto (arriba a la izquierda) → **Nuevo proyecto**.
2. Nombre: `140d`. Organización: la que tengas, o «Sin organización».
3. Selecciónalo. Todo lo que sigue se hace dentro de este proyecto.

## 2. Pantalla de consentimiento («Google Auth Platform»)

> **Si el proyecto ya tiene una pantalla de consentimiento** (por ejemplo, la del cliente de Plausible en «140d Galeria de Arte»), reutilízala: no se crea otra.
> - Revisa que **Acceso a los datos** solo tenga `openid`, `email` y `profile`.
> - Comprueba **Información de la marca** con los valores de la tabla. El nombre es el que verán los asistentes.
> - Después salta al §3.

1. Menú → **APIs y servicios** → **Pantalla de consentimiento de OAuth**. Ahora se llama *Google Auth Platform*. Pulsa **Comenzar** (*Get started*).
2. **Información de la app:** nombre `140d`; correo de asistencia: el de la galería (p. ej. `info@140d.art`).
3. **Público:** **Externo** (*External*).
4. **Información de contacto:** el mismo correo. Acepta la política de datos de usuario y pulsa **Crear**.
5. **Marca** (*Branding*):
   - Página principal, política de privacidad y condiciones: las de la tabla.
   - **Dominios autorizados:** `140d.art`.
   - **Logotipo:** opcional. Mientras la marca no esté verificada (§3.1), Google no muestra en la pantalla de consentimiento ni el nombre ni el logotipo.
6. **Acceso a datos** (*Data access*) → **Añadir o quitar ámbitos**. Marca `openid`, `.../auth/userinfo.email` y `.../auth/userinfo.profile`, y guarda. Son ámbitos **no sensibles**: no exigen verificación.

## 3. Público externo y en producción (imprescindible)

El objetivo es que **Público** quede así: **Tipo de usuario: Externo** y **Estado de publicación: En producción**.

- **Si muestra «Tipo de usuario: Interno»** (proyectos de una organización de Google Workspace):
  1. Pulsa **Marcar como externo**.
  2. En el diálogo, elige **En producción** como estado de publicación y pulsa **Confirmar**.
  3. Si aparece «¿Enviar a producción?», confírmalo también.
- **Si ya es Externo y está en «Prueba»:** **Publicar app** → confirma.

> **Nunca lo dejes en «Prueba».** En ese estado solo entran los usuarios de prueba añadidos a mano (máximo 100), y el resto ve un error.
>
> Además, en «Prueba» los tokens de actualización de **los demás clientes del proyecto** caducan a los 7 días si piden algo más que nombre y email. El de Plausible pide Search Console: su conexión se cortaría cada semana.
>
> Con solo los tres ámbitos no sensibles, publicar no exige la verificación de ámbitos.

### 3.1 Verificar la marca

Sin este paso, la pantalla de Google **no muestra «140d»** al asistente: Google solo enseña el nombre y el logotipo de una app con la marca verificada. Es un trámite de minutos, sin revisión manual cuando solo hay ámbitos no sensibles.

1. **Información de la marca** → arriba a la derecha, **Estado de verificación** → **Verificar marca**.
2. Si lista errores, corrígelos. Los habituales son:
   - el dominio `140d.art` no está verificado en [Google Search Console](https://search.google.com/search-console) por una cuenta propietaria o editora de este proyecto;
   - la página principal o la política de privacidad no se abren o no están en ese dominio.
3. Cuando termine, pulsa **Publicar marca**.

## 4. Cliente de preproducción y local

1. **Clientes** (*Clients*) → **Crear cliente**.
2. Tipo: **Aplicación web**. Nombre: `140d — preproducción y local`.
3. **Orígenes de JavaScript autorizados:** déjalo vacío. El flujo es por redirección: no hay JavaScript de Google en la página.
4. **URIs de redireccionamiento autorizados:**
   - `https://api.pre.140d.art/api/events/identity/google/callback`
   - `http://localhost:3001/api/events/identity/google/callback`
   - `https://oidcdebugger.com/debug` (**temporal**, solo para la prueba del §6; quítala después)
5. **Crear.** Copia el **ID de cliente**, que termina en `.apps.googleusercontent.com`.
6. Google muestra también un **secreto de cliente**: **no lo guardes en ningún sitio**, porque el diseño no lo usa. Solo haría falta con el plan B (§8).

> Los cambios pueden tardar desde unos minutos hasta algunas horas en aplicarse. Si la prueba da `redirect_uri_mismatch` nada más crearlo, espera y repite.

## 5. Cliente de producción (al pasar a producción)

Igual que el §4, con el nombre `140d — producción` y **una sola URI**: `https://api.140d.art/api/events/identity/google/callback`. Separar los clientes evita que una URI local quede registrada en el cliente de producción.

## 6. Prueba previa con OIDC Debugger (tarea 0.3)

Comprueba, sin una línea de código, que Google acepta `id_token` con `form_post` y qué datos devuelve.

1. Abre [oidcdebugger.com](https://oidcdebugger.com/) y rellena:
   - **Authorize URI:** `https://accounts.google.com/o/oauth2/v2/auth`
   - **Redirect URI:** `https://oidcdebugger.com/debug`
   - **Client ID:** el del §4
   - **Scope:** `openid email profile`
   - **State:** `prueba`. **Nonce:** `prueba123`
   - **Response type:** solo `id_token`
   - **Response mode:** `form_post`
2. Pulsa **Send request**, elige la cuenta y acepta.
   - **Resultado A**: OIDC Debugger muestra un `id_token`. El diseño vale tal cual.
   - **Resultado B**: Google muestra un error (`unsupported_response_type` o similar). Apúntalo: hay que aplicar el plan B (§8).
3. Decodifica el token **en tu ordenador** (no lo pegues en webs de terceros):

   ```bash
   TOKEN='pega-aquí-el-id_token'
   node -e "console.log(JSON.stringify(JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')),null,2))" "$TOKEN"
   ```

4. Repite con tres cuentas y apunta qué claims llegan:

   | Cuenta | Debe traer | Qué hará la API |
   |---|---|---|
   | Gmail personal | `email` …@gmail.com, `email_verified: true`, `given_name`, `family_name` | Aceptarla |
   | Google Workspace (p. ej. una cuenta de empresa con Gmail) | `hd` = su dominio, `email_verified: true` | Aceptarla |
   | Cuenta de Google creada con un email ajeno (Yahoo, Hotmail…) | `email_verified: true`, **sin** `hd` | Mandarla al código por email |

   Comprueba también `iss` (`https://accounts.google.com`) y que `nonce` es `prueba123`.
5. **Quita** `https://oidcdebugger.com/debug` de las URIs del cliente (tarea 0.6).

## 7. Recursos de marca

1. Descarga el paquete oficial: [signin-assets.zip](https://developers.google.com/static/identity/images/signin-assets.zip). La guía es [Sign in with Google branding guidelines](https://developers.google.com/identity/branding-guidelines).
2. El original elegido es `Android + Web/PNG @4x/Light/Theme=Light, Show text=No, Shape=Square, Platform=Android+Web@4x.png`, guardado en `recursos/google-light-square-icon@4x.png`. Es la «G» con degradado de 2025, la vigente; la de cuatro colores planos está retirada.
   - El sitio usa su recorte central de 80×80 px (`google-g-v1.png`): solo la «G», sin el marco del botón y **sin alterar sus píxeles**.
   - El SVG equivalente también se ve bien en Safari para iOS (tarea 0.5, 29/10/2026). Se prefiere el PNG porque el SVG dibuja el degradado con `foreignObject` y desenfoques, que cada vista web de las apps pinta a su manera.
3. Si Google cambia el logotipo, vuelve a descargar el paquete, sustituye el original de `recursos/` y publica el recorte con otro nombre (`-v2`).
4. Reglas que no se pueden saltar:
   - la G nunca en monocromo ni recoloreada;
   - el botón de Google, al menos igual de visible que los demás;
   - colores del tema claro: fondo `#FFFFFF`, borde `#747775` y texto `#1F1F1F`;
   - texto traducido: «Continuar con Google».

## 8. Plan B, solo si la prueba del §6 da el resultado B

Se cambia a flujo de código con secreto, solo para Google:

- se guarda el secreto del cliente en `GOOGLE_OIDC_CLIENT_SECRET`, en el `.env` de la API y nunca en el repositorio;
- la API canjea el código en `https://oauth2.googleapis.com/token`.

El resto (pantalla, cookies, regla del email y canje) no cambia. Hay que actualizar `design.md` (D2) y las tareas antes de programar.

## Avisos

- **Proyecto compartido con Plausible.** Su cliente pide acceso a Search Console, un ámbito sensible que no se verifica.
  - Con la pantalla en Externo, la próxima vez que conectes Plausible con Google verás «Google no ha verificado esta aplicación». Pulsa **Configuración avanzada → Ir a 140d** para continuar. Solo te afecta a ti, que eres quien hace esa conexión.
  - La conexión actual debería seguir funcionando: comprueba en los días siguientes que Plausible sigue mostrando los datos de Search Console.
  - Los asistentes nunca ven ese aviso, porque los clientes de los eventos solo piden `openid`, `email` y `profile`.
- **Clientes sin uso:** Google puede eliminar clientes OAuth que llevan meses sin usarse. Si la tarjeta de Google de preproducción deja de funcionar tras una temporada parada, mira si el cliente sigue en **Clientes**. Si no está, crea otro y actualiza la variable.
- **Qué ve el asistente:** «140d quiere acceder a tu cuenta de Google: nombre, foto de perfil y dirección de correo». La foto llega con el ámbito `profile`, que es el que da el nombre, pero la API la descarta. La política de privacidad lo explica.
