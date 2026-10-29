# 02 · Microsoft Entra: app para cuentas personales

**Objetivo:** obtener `MICROSOFT_OIDC_CLIENT_ID` y comprobar antes de programar que una cuenta personal (Outlook, Hotmail, Live) devuelve nombre, apellido y email.

**Decisión de producto:** **solo cuentas personales**. Las profesionales o educativas (Entra ID) no entran, porque su email lo escribe un administrador y no prueba que la persona sea dueña del buzón.

**Lo que vas a registrar:**

| Dato | Valor |
|---|---|
| Nombre | `140d` |
| Tipos de cuenta | **Solo cuentas personales de Microsoft** (*Personal Microsoft accounts only*) |
| Plataforma | **Web** |
| URI de vuelta (producción) | `https://api.140d.art/api/events/identity/microsoft/callback` |
| URI de vuelta (preproducción) | `https://api.pre.140d.art/api/events/identity/microsoft/callback` |
| URI de vuelta (local) | `http://localhost:3001/api/events/identity/microsoft/callback` |
| Tokens | **Tokens de id** (flujos implícitos e híbridos) activado |
| Claims opcionales del token de id | `email`, `given_name`, `family_name` |
| Permisos | `openid`, `email` y `profile` (Microsoft Graph, delegados). **Sin** `User.Read` |

---

## 1. Antes de empezar: un inquilino de Entra

Registrar una app exige un inquilino (*tenant*) de Microsoft Entra. Una cuenta **personal** de Microsoft, incluida la de un Microsoft 365 Personal o Familia, **no tiene inquilino propio**.

**Cómo saber si tienes inquilino:** entra en https://entra.microsoft.com en una ventana privada.

- Si carga normal, tienes inquilino: sigue en el §2.
- Si da `AADSTS16000 … from identity provider 'live.com' does not exist in tenant 'Microsoft Services'` y arriba a la derecha aparece el inquilino `f8cdef31-a31e-4b4a-93e4-5f571e91255a`, tu cuenta es personal y no tiene inquilino. `f8cdef31-…` es el inquilino genérico de las cuentas personales, no uno tuyo. Sigue con «Crear el inquilino».

**Crear el inquilino con una cuenta gratuita de Azure:**

1. En una ventana privada, abre https://azure.microsoft.com/free → **Empezar gratis** e inicia sesión con tu cuenta personal.
2. Completa el alta:
   - país, nombre y teléfono, verificado por SMS;
   - una tarjeta para verificar tu identidad. Puede aparecer un cargo temporal pequeño que se devuelve.

   Al terminar, Azure crea un inquilino («Directorio predeterminado») del que eres administrador.
3. Vuelve a https://entra.microsoft.com. Arriba a la derecha, el inquilino debe ser **Directorio predeterminado**, con un GUID distinto de `f8cdef31-…`. Si no lo es: ⚙ **Configuración** → **Directorios y suscripciones** → elige **Directorio predeterminado** → **Cambiar**.
4. Opcional: renómbralo a `140d` en **Identidad** → **Información general** → **Propiedades** → **Nombre**. Es solo estético.
5. **Antes de que pasen 30 días**, convierte la suscripción a **Pago por uso**: https://portal.azure.com → **Suscripciones** → tu suscripción → **Actualizar**.
   - No cobra nada mientras no crees recursos: registrar apps es gratis.
   - Sin este paso, Azure desactiva la suscripción a los 30 días, y un inquilino sin suscripción ni actividad puede acabar bloqueado por inactividad (`AADSTS5000225`). Eso apagaría la tarjeta de Microsoft.
   - Para más tranquilidad, crea un presupuesto de 1 € con aviso por email: **Administración de costos** → **Presupuestos**.

Una sola app sirve para los tres entornos: tiene una URI de vuelta por entorno.

## 2. Registrar la app

1. Entra en el [centro de administración de Microsoft Entra](https://entra.microsoft.com/) → **Identidad** → **Aplicaciones** → **Registros de aplicaciones** → **Nuevo registro**.
2. **Nombre:** `140d`. Es lo que verá el asistente: «140d quiere acceder a tu cuenta».
3. **Tipos de cuenta compatibles:** **Solo cuentas personales de Microsoft**.
4. **URI de redirección:** plataforma **Web** → `https://api.140d.art/api/events/identity/microsoft/callback`.
5. **Registrar.** En **Información general**, copia el **Id. de aplicación (cliente)**, un GUID: es `MICROSOFT_OIDC_CLIENT_ID`.

**No crees ningún secreto ni certificado** («Certificados y secretos»): el diseño no los usa.

## 3. Autenticación: URIs y tokens de id

**Autenticación** → plataforma **Web**:

1. **Agregar URI**, una por línea:
   - `https://api.pre.140d.art/api/events/identity/microsoft/callback`
   - `http://localhost:3001/api/events/identity/microsoft/callback`
   - `https://oidcdebugger.com/debug` (**temporal**, solo para el §7; quítala después)
2. En **Concesión implícita y flujos híbridos**, marca **Tokens de id (usados para flujos implícitos e híbridos)**. **No** marques «Tokens de acceso».
3. **Guardar.**

> Sin «Tokens de id», Microsoft responde `unsupported_response_type` a `response_type=id_token`.

## 4. Claims opcionales: email, nombre y apellido

**Configuración de token** → **Agregar notificación opcional** → tipo **Id.** → marca `email`, `family_name` y `given_name` → **Agregar**.

Si pregunta «Activar el permiso de Microsoft Graph email, profile», márcalo y acepta.

## 5. Permisos: lo mínimo

**Permisos de API:**

1. Debe haber `email`, `openid` y `profile` (Microsoft Graph, **delegados**). Si falta alguno: **Agregar un permiso** → **Microsoft Graph** → **Permisos delegados** → *OpenId permissions*.
2. **Quita `User.Read`** (⋯ → **Quitar permiso**). Viene por defecto, y sin él la pantalla de consentimiento pide menos.

## 6. Marca y propiedades

**Personalización de marca y propiedades:**

- **URL de la página principal:** `https://140d.art`
- **URL de las condiciones del servicio:** `https://140d.art/legal/normas-eventos`
- **URL de la declaración de privacidad:** `https://140d.art/legal/politica-de-privacidad`
- **Logotipo:** opcional. El cuadrado de 140d sobre fondo blanco.

**Dominio y editor verificados: opcional, fuera de este change.** Sin ellos, Microsoft muestra la app como «no verificada» en el consentimiento, pero no bloquea a las cuentas personales. Verificarlo exige servir `/.well-known/microsoft-identity-association.json` en `140d.art` y, para el editor, una cuenta del programa de partners de Microsoft.

## 7. Prueba previa con OIDC Debugger (tarea 0.3)

1. Abre [oidcdebugger.com](https://oidcdebugger.com/) y rellena:
   - **Authorize URI:** `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize`
   - **Redirect URI:** `https://oidcdebugger.com/debug`
   - **Client ID:** el del §2
   - **Scope:** `openid email profile`
   - **State:** `prueba`. **Nonce:** `prueba123`
   - **Response type:** solo `id_token`. **Response mode:** `form_post`
2. **Send request** con una cuenta **Outlook o Hotmail**. Decodifica el token en tu ordenador:

   ```bash
   TOKEN='pega-aquí-el-id_token'
   node -e "console.log(JSON.stringify(JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')),null,2))" "$TOKEN"
   ```

3. Comprueba y apunta:

   | Claim | Valor esperado |
   |---|---|
   | `iss` | `https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0` |
   | `tid` | `9188040d-6c67-4c5b-b112-36a304b66dad` (cuentas personales) |
   | `aud` | tu Id. de aplicación |
   | `nonce` | `prueba123` |
   | `email` | tu dirección de Outlook o Hotmail |
   | `given_name`, `family_name` | tu nombre y tu apellido. Si no llegan, revisa el §4 |

4. Repite con:
   - **una cuenta profesional o educativa:** Microsoft debe decir que solo admite cuentas personales;
   - **una cuenta personal creada con un Gmail**, si tienes una: llega con `email` de Gmail, y la API la mandará al código por email.
5. **Dentro de Instagram** (tarea 0.4): envíate la URL de autorización por mensaje directo, ábrela desde la app y comprueba que deja iniciar sesión.
6. **Quita** `https://oidcdebugger.com/debug` de las URIs (tarea 0.6).

## 8. Recursos de marca

- **Guía y descargas:** [Sign in with Microsoft branding guidelines](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps). Usa el símbolo de cuatro cuadrados, `ms-symbollockup_mssymbol_19.svg`, **sin alterarlo**: colores `#F25022`, `#7FBA00`, `#00A4EF` y `#FFB900`.
- **Tema claro de la tarjeta:** fondo `#FFFFFF`, borde 1 px `#8C8C8C` y texto `#5E5E5E`. Texto: «Continuar con Microsoft».
- No nombres Azure ni Entra en la interfaz. Como solo entran cuentas personales, tampoco se habla de «cuenta profesional».

## Qué ve el asistente

La pantalla de Microsoft: «140d necesita permiso para: ver tu perfil básico, ver tu dirección de correo electrónico, mantener el acceso…». Con solo `openid`, `email` y `profile`, la lista es la mínima. La primera vez la acepta, y las siguientes Microsoft lo recuerda.
