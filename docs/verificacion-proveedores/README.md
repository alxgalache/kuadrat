# Verificación con Google y Microsoft en los eventos: guías del operador

Un asistente puede confirmar su email en el registro de un evento de `/live` con su cuenta de Google o con su cuenta personal de Microsoft, en lugar del código por email. Estas guías cubren todo lo que vive **fuera del código**: las consolas de Google y de Microsoft, las variables de entorno y las pruebas a mano. Cada una se lee sola.

El porqué de cada decisión (qué cuentas se aceptan, por qué ningún secreto viaja en una URL, la salida de los navegadores de las apps) está en `.claude/rules/events/identity-providers.md` y en `openspec/changes/archive/*-event-identity-provider-verification/design.md`. El flujo del asistente, en [`docs/acceso-eventos.md`](../acceso-eventos.md).

| Guía | Para qué | Cuándo |
|---|---|---|
| [01-google-cloud.md](01-google-cloud.md) | Pantalla de consentimiento, verificación de marca y clientes OAuth de Google; prueba con OIDC Debugger | Al crear un entorno o pasar a producción |
| [02-microsoft-entra.md](02-microsoft-entra.md) | Inquilino de Entra y registro de la app para cuentas personales; prueba con OIDC Debugger | Al crear un entorno o pasar a producción |
| [03-variables-y-despliegue.md](03-variables-y-despliegue.md) | Las tres variables, en qué fichero va cada entorno, cómo activar o apagar cada tarjeta y qué hacer si falla | Al desplegar |
| [04-pruebas-manuales.md](04-pruebas-manuales.md) | Matriz de pruebas en escritorio, móvil y navegadores de Instagram y Facebook | Tras cada despliegue que toque el acceso, y tras actualizaciones grandes de Instagram o Facebook |
| [recursos/](recursos/README.md) | Los logotipos oficiales de origen y cómo se derivan los del sitio | Si Google o Microsoft cambian su logotipo |

## Resumen en una pantalla

- **Qué se configura:**
  - un cliente OAuth «Web» de Google por entorno (producción, y preproducción + local);
  - una app de Microsoft para «solo cuentas personales» con varias URIs de vuelta.
- **Qué se obtiene:** dos identificadores **públicos** (no son secretos): `GOOGLE_OIDC_CLIENT_ID` y `MICROSOFT_OIDC_CLIENT_ID`. **No se guarda ningún secreto de cliente.**
- **URIs de vuelta** (se registran exactamente así, sin barra final):

  | Entorno | Google | Microsoft |
  |---|---|---|
  | Producción | `https://api.140d.art/api/events/identity/google/callback` | `https://api.140d.art/api/events/identity/microsoft/callback` |
  | Preproducción | `https://api.pre.140d.art/api/events/identity/google/callback` | `https://api.pre.140d.art/api/events/identity/microsoft/callback` |
  | Local | `http://localhost:3001/api/events/identity/google/callback` | `http://localhost:3001/api/events/identity/microsoft/callback` |

- **Qué cuentas pasan sin código:** Gmail y Google Workspace; cuentas personales de Microsoft con un email de Outlook, Hotmail, Live o MSN. Cualquier otra (una cuenta de Google creada con un email de Yahoo, por ejemplo) pasa al código por email con un aviso.
- **Coste:** ninguno. Ni Google ni Microsoft cobran por iniciar sesión con OpenID Connect. El inquilino de Entra exige una suscripción de Azure en «Pago por uso» sin recursos (guía 02 §1).
- **Apagar una tarjeta:** borrar su variable del fichero de entorno de la API y reiniciarla (guía 03). El código por email sigue siempre disponible.
