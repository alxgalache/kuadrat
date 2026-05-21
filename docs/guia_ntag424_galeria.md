# Guía completa: programación y verificación segura de NTAG 424 DNA para CoA de obras de arte — Galería 140d.art

> **Objetivo**: programar pegatinas NFC NTAG 424 DNA pegadas a Certificados de Autenticidad (CoA) de obras de arte de la galería online **140d.art**, de forma que cada *tap* con un móvil abra una URL única y verificable contra el backend, sin posibilidad de clonado, replay ni reescritura tras el sellado final.

> **Para Claude Code**: este documento se ha pensado para ser implementado iterativamente desde la raíz del repositorio. Asume:
> - Repositorio dockerizado con dos contenedores: `frontend` (Next.js) y `backend` (Express).
> - Base de datos: Turso Cloud (libSQL), tabla `art` ya existente, acceso desde Express con queries SQL escritas a mano usando `@libsql/client` (sin ORM).
> - El código y la estructura de directorios propuestos respetan esa arquitectura.

---

## 0. Resumen ejecutivo

Arquitectura final:

- **Chip**: NTAG 424 DNA (no la variante TagTamper salvo que decidas detectar despegado físico de la pegatina).
- **Modo criptográfico**: PICC cifrado + CMAC (Encrypted PICC Mirror + CMAC Mirror).
- **Esquema de claves**: una clave maestra de diversificación en el servidor, de la que se derivan claves únicas por UID de tag siguiendo el método de NXP AN10922. La clave que descifra el PICC se mantiene fija para que el servidor pueda recuperar el UID sin saberlo de antemano.
- **Hardware de programación**: lector **ACS ACR1552U NFC USB-C** + scripts propios en Node.js ejecutados en el host del operador (no dentro de Docker).
- **Base de datos**: Turso Cloud / libSQL / SQLite. Tabla `art` existente + dos nuevas tablas (`nfc_tags`, `verification_events`) con FK a `art.id`.
- **Backend**: endpoint privado en Express `/api/coa/verify` que verifica CMAC y contador anti-replay. Master keys solo viven en el contenedor del backend.
- **Frontend**: página pública Next.js `/coa` que llama internamente al backend vía red Docker y renderiza la obra autenticada al coleccionista.
- **Bloqueo permanente**: paso separado y diferido, ejecutado tras verificación exitosa de cada pegatina.

Resultado: cada pegatina, al ser leída por un móvil, abre una URL del tipo:

```
https://140d.art/coa?picc=A3F1...32hex...&cmac=8B2D...16hex...
```

El servidor descifra `picc`, obtiene UID + contador, deriva la clave CMAC del tag y verifica. Si todo cuadra y el contador es nuevo, devuelve la página de la obra autenticada.

---

## 1. Conceptos clave del NTAG 424 DNA

Términos básicos:

- **UID (7 bytes)**: identificador único del chip, asignado por NXP en fábrica. Inmutable. Es lo que vincula físicamente la pegatina con la obra en BD.
- **5 claves AES-128 (K0..K4)**: el chip almacena cinco claves de 16 bytes cada una. De fábrica vienen todas a ceros (`00...00`).
- **NDEF**: el archivo de 256 bytes del chip (File 02) donde se escribe la URL que se abre al hacer tap.
- **SDM (Secure Dynamic Messaging)**: la función que hace que el chip reescriba dinámicamente partes de la URL en cada lectura.
- **SUN (Secure Unique NFC) message**: el mensaje resultante de SDM, es decir, la URL dinámica generada en cada tap.
- **PICC data**: bloque de 16 bytes con tag de formato + UID + contador + padding. Es lo que el chip emite cifrado.
- **CMAC**: código de autenticación de mensaje basado en AES. Se calcula con una clave de sesión derivada del UID y del contador. Único por tap.
- **SDMReadCtr**: contador de 3 bytes que se incrementa con cada lectura. Base del anti-replay.
- **FileSettings (File 02)**: parámetros del archivo NDEF — incluye derechos de acceso (Read/Write/ReadWrite/Change) y configuración SDM. Es lo que se "congela" en el bloqueo permanente.
- **LRP (Leakage Resilient Primitive)**: modo opcional alternativo al AES estándar, con mayor resistencia a ataques de canal lateral. No necesario para tu volumen actual.

---

## 2. Diseño criptográfico recomendado

### 2.1. Por qué PICC cifrado + CMAC

Dos modos típicos para la URL SUN:

| Modo | URL resultante | Privacidad | Trazabilidad para terceros |
|---|---|---|---|
| Plano (UID + contador en claro + CMAC) | `?uid=04A1B2...&ctr=000017&cmac=...` | Baja | Cualquiera que vea la URL sabe qué tag es y cuántas veces se ha leído |
| **PICC cifrado + CMAC (recomendado)** | `?picc=AB12...32hex&cmac=...16hex` | Alta | URL opaca; nadie excepto tu servidor sabe qué tag es |

Para una galería de arte el modo cifrado es claramente preferible: las URLs que circulen en redes sociales, capturas, etc. no exponen qué obra es ni el patrón de verificaciones.

### 2.2. Asignación de las 5 claves del chip

| Clave | Rol en NTAG 424 DNA | Cómo se establece en cada tag |
|---|---|---|
| **K0** | App Master Key (autoriza cambios de configuración del tag) | Diversificada por UID, derivada de `MASTER_KEY` (label 0x01) |
| **K1** | `SDMFileReadKey` (genera el CMAC) | Diversificada por UID, derivada de `MASTER_KEY` (label 0x02) |
| **K2** | `SDMMetaReadKey` (cifra el PICC data) | **Fija** = `K_PICC` (la misma en todas las pegatinas) |
| **K3** | No usada (pero no debe quedar a ceros) | Diversificada por UID, derivada de `MASTER_KEY` (label 0x03) |
| **K4** | No usada (pero no debe quedar a ceros) | Diversificada por UID, derivada de `MASTER_KEY` (label 0x04) |

**Por qué K2 fija y K1 diversificada**: para descifrar el PICC el servidor necesita la clave antes de conocer el UID (huevo y gallina). Por eso `K_PICC` es la misma en todas las pegatinas. K1, una vez descubierto el UID, se deriva al vuelo a partir de `MASTER_KEY` + UID — y este es el escudo real: comprometer una pegatina solo expone su K1 individual, no la maestra.

### 2.3. Diversificación por tag (NXP AN10922 simplificado)

Para cada tag, su clave diversificada `K_tag` se calcula como:

```
K_tag = AES-CMAC(MASTER_KEY, divInput)

divInput = label || UID(7 bytes) || systemID
```

- `label`: byte que distingue qué clave estás derivando (0x01 para K0, 0x02 para K1, 0x03 para K3, 0x04 para K4).
- `UID`: los 7 bytes del UID del tag.
- `systemID`: 3 bytes ASCII (recomendado `0x313430` = `"140"`) que identifican tu infraestructura. Sirve para que tu derivación no colisione con otras aplicaciones que puedan usar el mismo chip en el futuro.

### 2.4. Secretos que vivirán en tu servidor

Tres valores hexadecimales, además del salt para hash de IPs:

```env
# Identificador de sistema (3 bytes, "140" en ASCII)
NTAG424_SYSTEM_ID=313430

# Clave fija que cifra el PICC (igual en todas las pegatinas)
NTAG424_K_PICC=<32 hex chars>

# Clave maestra de la que se derivan K0, K1, K3, K4 por UID
NTAG424_MASTER_KEY=<32 hex chars>

# Salt para HMAC de IPs en verification_events (privacidad)
IP_HASH_SALT=<32 hex chars o más>
```

Con estas, tu servidor puede recomputar cualquier clave de cualquier tag a partir de su UID. **Si las pierdes, pierdes la capacidad de verificar todas las pegatinas. Si se filtran, pierdes toda la seguridad del sistema**. Sección 12 detalla la custodia.

---

## 3. Hardware necesario

### 3.1. Pegatinas NTAG 424 DNA

Compra a un distribuidor reconocido, no a Aliexpress genérico (abunda el clon falso que se hace pasar por NTAG pero no soporta SDM). Distribuidores fiables: **Identiv**, **GoToTags**, **Shop NFC** (Italia), **RapidNFC** (UK).

Pide explícitamente:

- Chip: **NXP NTAG 424 DNA** (NT4H2421Gx). No NTAG 213/215/216, no Mifare Ultralight, no la variante *TagTamper* salvo que quieras tag-tamper.
- Acabado: pegatina blanca o transparente según diseño del CoA. Diámetro mínimo 22 mm; típico 25 mm. A menor tamaño, menor distancia de lectura.
- Lote: tu cantidad esperada + un 5-10% de pegatinas extra para pruebas y mermas.

### 3.2. Lector USB: ACS ACR1552U NFC USB-C Reader

El modelo confirmado para tu setup. Características relevantes:

- USB-C, plug-and-play en Mac/Linux/Windows con drivers PC/SC nativos.
- Soporta APDU extendido hasta 64 KB (necesario para `AuthenticateEV2First` y `ChangeKey` del NTAG 424 DNA).
- 13.56 MHz, ISO/IEC 14443 A/B + ISO/IEC 15693 + ISO/IEC 18092 (NFC). NTAG 424 DNA es 14443A.
- Velocidad hasta 848 kbps (suficiente sobrado).
- Compatible con `nfc-pcsc` y `@libsql/client` desde Node.js sin configuración especial.
- Precio: ~40-60 €.

> Si en el futuro quisieras una segunda unidad o reemplazo, el modelo ACR1252U también es válido (predecesor del 1552U, mismas capacidades para este caso de uso). Evita el ACR122U: no soporta de forma fiable APDU extendido y la comunidad reporta errores `0x6300/0x6700` en operaciones seguras de NTAG 424 DNA.

### 3.3. Móvil Android (Pixel 9 Pro) como herramienta de inspección

Tu Pixel **no puede personalizar pegatinas** (las apps oficiales de Google Play no cambian claves AES, ver sección 4). Pero es muy útil para:

- **Antes de pegar la pegatina**: verificar que el chip se ha programado correctamente. Pasas el tag por el móvil y debe abrirse el navegador con tu URL dinámica `https://140d.art/coa?picc=...&cmac=...`, distinta en cada lectura.
- **Durante el uso normal**: es la herramienta del propio coleccionista. No necesita ninguna app; basta con acercar el móvil al CoA.

Apps oficiales NXP en Play Store, gratuitas, útiles para inspección:

- **NFC TagInfo by NXP**: lee la configuración completa del chip (estado SDM, contador, offsets, derechos de acceso, claves activas sin revelar). Imprescindible para depurar.
- **NFC TagWriter by NXP**: escribe NDEF y configura SDM en tags ya autenticables. No cambia claves AES.

---

## 4. Software

### 4.1. Ecosistema NTAG 424 DNA — situación real

**Aclaración**: el cambio de claves AES K0–K4 del NTAG 424 DNA (operación obligatoria para sacar el chip del estado de fábrica con claves a ceros) **no está soportado por ninguna app oficial de NXP en Google Play**. Por eso necesitas el ACR1552U + Node.js.

| Herramienta | Cambia claves | Configura SDM | Escribe NDEF |
|---|---|---|---|
| NFC TagInfo by NXP (Android) | ❌ | ❌ (solo lee) | ❌ (solo lee) |
| NFC TagWriter by NXP (Android) | ❌ | ✅ | ✅ |
| TagXplorer Desktop (legacy, Java) | ✅ | ✅ | ✅ |
| **Script Node.js + ACR1552U** | ✅ | ✅ | ✅ |

### 4.2. Stack del script de personalización

Estas dependencias viven en `scripts/nfc-personalization/package.json` (sección 5), no en el backend.

- **`nfc-pcsc`**: comunicación con lectores PC/SC como el ACR1552U.
- **`ntag424`** (npm, AGPL): implementación de la capa de comandos APDU del NTAG 424 DNA — autenticación EV2, ChangeKey, ChangeFileSettings, WriteData. La AGPL aplica solo a redistribución pública del software; un script de uso interno no la activa.
- **`node-aes-cmac`**: AES-CMAC para derivación de claves diversificadas (no viene en `node:crypto`).
- **`@libsql/client`**: cliente Turso para registrar los tags en BD desde el script.
- **`prompts`**: prompts CLI interactivos.
- **`dotenv`**: carga del `.env` con secretos.

### 4.3. Stack del backend (Express)

- **`node:crypto`** (built-in): AES-128-CBC para descifrar PICC, HMAC-SHA256 para hash de IPs, `timingSafeEqual` para comparar CMACs.
- **`node-aes-cmac`**: cálculo del CMAC esperado en cada verificación.
- **`@libsql/client`**: cliente Turso oficial. Queries escritas a mano.

### 4.4. Stack del frontend (Next.js)

- **`@libsql/client`**: solo si Next.js consulta directamente la tabla `art` (lo más probable, para listado de obras). Si toda la consulta de obras pasa por Express, no hace falta aquí.
- No necesita las librerías criptográficas del NTAG 424 DNA — la verificación se delega siempre al backend.

---

## 5. Organización del repositorio Docker

### 5.1. Estructura propuesta

Asumiendo la estructura típica del monorepo dockerizado:

```
140d-art-repo/
├── frontend/                          # Next.js (Docker)
│   ├── Dockerfile
│   ├── app/
│   │   └── coa/
│   │       └── page.tsx               # NUEVO: página pública /coa
│   ├── .env.local                     # vars del frontend
│   └── package.json
│
├── backend/                           # Express (Docker)
│   ├── Dockerfile
│   ├── src/
│   │   ├── routes/
│   │   │   └── coa-verify.js          # NUEVO: endpoint /api/coa/verify
│   │   ├── services/
│   │   │   ├── ntag424-verify.js      # NUEVO: lógica criptográfica
│   │   │   └── db.js                  # cliente libSQL existente o nuevo
│   │   └── utils/
│   │       └── ip-privacy.js          # NUEVO: hashIp
│   ├── migrations/
│   │   └── 002_nfc_tags.sql           # NUEVO: migración Turso (o numera según tu convención)
│   ├── .env                           # vars del backend (con master keys)
│   └── package.json
│
├── scripts/                           # ⚠️ NUEVO directorio
│   └── nfc-personalization/           # NO va en Docker; corre en el host
│       ├── package.json
│       ├── .env.example
│       ├── .env                       # gitignored
│       ├── .gitignore
│       ├── README.md
│       └── src/
│           ├── lib/
│           │   ├── crypto.js          # derivación de claves
│           │   ├── ntag424.js         # wrappers APDU
│           │   └── db.js              # cliente libSQL
│           ├── personalize.js         # script principal
│           ├── lock-tag.js            # bloqueo permanente
│           ├── inspect-tag.js         # diagnóstico
│           └── derive-keys.js         # utilidad CLI
│
├── docker-compose.yml
└── .gitignore
```

### 5.2. Por qué los scripts NFC NO van dentro de Docker

El script de personalización necesita acceso al lector USB físico (ACR1552U) vía PC/SC daemon. Meter eso en un contenedor implica:

- **Linux**: pass-through del dispositivo USB con `--device` y montaje de `/var/run/pcscd/pcscd.comm`. Funciona, pero rompe portabilidad y añade fricción.
- **macOS y Windows**: Docker corre dentro de una VM (HyperKit/WSL2/Hyper-V) sin acceso directo al USB del host. Hay workarounds (USB/IP, VirtualHere), pero son frágiles y lentos.

Como solo programas <50 pegatinas, ocasionalmente, **en una sola máquina (la tuya como operador)**: lo correcto es ejecutar `node` directamente en el host, sin Docker. El script se conecta a Turso por internet usando el mismo `TURSO_DATABASE_URL` que el backend, así que el flujo de datos se mantiene consistente.

### 5.3. Variables de entorno por componente

**`scripts/nfc-personalization/.env`** (vive solo en tu máquina de operador):

```env
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=<token con permisos de escritura>

NTAG424_SYSTEM_ID=313430
NTAG424_K_PICC=<32 hex chars>
NTAG424_MASTER_KEY=<32 hex chars>

GALLERY_BASE_URL=https://140d.art
OPERATOR=tu-nombre
```

**`backend/.env`** (en el contenedor de backend):

```env
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=<token con permisos de escritura>

NTAG424_SYSTEM_ID=313430
NTAG424_K_PICC=<32 hex chars>
NTAG424_MASTER_KEY=<32 hex chars>

IP_HASH_SALT=<32 hex chars o más, aleatorio>

PORT=3001
```

**`frontend/.env.local`** (en el contenedor de frontend):

```env
# URL interna del backend dentro de la red Docker
INTERNAL_API_URL=http://backend:3001

# Si Next.js consulta art directamente
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=<token read-only o el mismo>
```

> **Importante**: el `INTERNAL_API_URL` usa el nombre del servicio Docker (`backend`), no `localhost`. Esto solo funciona desde dentro de la red Docker. Comprueba en tu `docker-compose.yml` que ambos contenedores están en la misma red (por defecto en Docker Compose lo están).

### 5.4. `.gitignore`

Asegúrate de tener estas líneas en el `.gitignore` raíz:

```gitignore
# Secretos: nunca al repositorio
**/.env
**/.env.local
!**/.env.example

# Node modules de scripts
scripts/**/node_modules/

# Logs de personalización
scripts/**/*.log
```

### 5.5. Notas para Claude Code

Cuando implementes esto con Claude Code en este repositorio:

1. **No metas los scripts NFC en `backend/`**. Es tentador porque ya tiene Express y queries a Turso, pero confunde el Dockerfile del backend con dependencias nativas (`nfc-pcsc` requiere compilación nativa de `pcsclite`) y rompe el build del contenedor.
2. **Crea `scripts/nfc-personalization/` como subproyecto Node.js aislado**, con su propio `package.json`, su propio `node_modules`, y sin relación con los workspaces del frontend/backend si los usas.
3. **El módulo de criptografía** (`backend/src/services/ntag424-verify.js`) **es genuinamente compartido** entre el backend y los scripts. Tienes dos opciones:
   - **Duplicar**: copia el archivo a `scripts/nfc-personalization/src/lib/crypto-verify.js`. Más simple, sin sorpresas.
   - **Symlink o paquete local**: monta el módulo como dependencia local con `file:../../backend/src/services`. Más DRY, pero añade fricción si cambia algo.
   - Para 50 tags y un script que se ejecuta esporádicamente, **duplicar es perfectamente aceptable** y lo recomiendo.
4. **Las migraciones** SQL van en la carpeta de migraciones del backend (cualquiera que sea tu convención: `backend/migrations/`, `backend/db/migrations/`, etc.). Mantén numeración correlativa con las que ya tengas.
5. **No conectes el script de personalización al backend Express**. Conéctalo directamente a Turso. El backend solo participa en la fase de verificación, no en la de programación.

---

## 6. Modelo de datos en Turso / libSQL

### 6.1. Tabla `art` existente (referencia)

Ya tienes esta tabla, no se toca. La incluyo aquí solo para referencia y para que la FK que crearemos en `nfc_tags` apunte correctamente:

```sql
-- Tabla existente, NO ejecutar de nuevo
CREATE TABLE art (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id     INTEGER NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  price         REAL NOT NULL,
  basename      TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  visible       INTEGER NOT NULL DEFAULT 1,
  is_sold       INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  type          TEXT NOT NULL DEFAULT 'Físico',
  weight        INTEGER,
  dimensions    TEXT,
  removed       INTEGER NOT NULL DEFAULT 0,
  for_auction   INTEGER NOT NULL DEFAULT 0,
  for_draw      INTEGER NOT NULL DEFAULT 0,
  ai_generated  INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (seller_id) REFERENCES users(id)
);
```

### 6.2. Migración SQL nueva

Crea un archivo de migración en tu carpeta de migraciones del backend (numera según tu convención; uso `002_nfc_tags.sql` a modo de ejemplo):

```sql
-- backend/migrations/002_nfc_tags.sql

-- Pegatinas/tags NFC vinculadas a obras de arte
CREATE TABLE nfc_tags (
  uid                    TEXT PRIMARY KEY,                            -- UID hex (7 bytes = 14 chars)
  art_id                 INTEGER NOT NULL,                            -- FK a art.id
  serial_label           TEXT,                                        -- p.ej. "GAL-2026-007"
  status                 TEXT NOT NULL DEFAULT 'active'
                         CHECK(status IN ('active', 'revoked', 'lost', 'damaged')),
  last_counter           INTEGER NOT NULL DEFAULT -1,                 -- último contador SDM válido visto
  is_permanently_locked  INTEGER NOT NULL DEFAULT 0,                  -- 0/1: NDEF bloqueado en hardware
  personalized_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  personalized_by        TEXT NOT NULL,                               -- operador que la programó
  locked_at              DATETIME,                                    -- cuándo se aplicó el lock permanente
  notes                  TEXT,
  FOREIGN KEY (art_id) REFERENCES art(id) ON DELETE RESTRICT
);

CREATE INDEX idx_nfc_tags_art_id ON nfc_tags(art_id);
CREATE INDEX idx_nfc_tags_status ON nfc_tags(status);

-- Auditoría de cada intento de verificación
CREATE TABLE verification_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uid           TEXT,
  counter       INTEGER,
  status        TEXT NOT NULL
                CHECK(status IN ('ok', 'invalid_cmac', 'replay', 'unknown_tag', 'revoked', 'malformed')),
  ip_hash       TEXT,
  user_agent    TEXT,
  occurred_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_verif_events_uid       ON verification_events(uid);
CREATE INDEX idx_verif_events_status    ON verification_events(status);
CREATE INDEX idx_verif_events_occurred  ON verification_events(occurred_at);
```

### 6.3. Notas sobre los tipos SQLite

- `last_counter INTEGER DEFAULT -1`: empezamos en -1 para que el primer tap (contador SDM = 0) sea aceptado por la lógica anti-replay (`counter > last_counter`).
- `is_permanently_locked INTEGER` 0/1: SQLite no tiene boolean nativo. Mantenemos la convención de tu tabla `art` (que usa INTEGER para flags como `visible`, `is_sold`).
- `personalized_at`/`occurred_at` como `DATETIME DEFAULT CURRENT_TIMESTAMP`: SQLite los guarda internamente como TEXT en formato ISO 8601 (`YYYY-MM-DD HH:MM:SS`). Coherente con el resto de tu schema.
- `ON DELETE RESTRICT` en la FK: evita que se borre una obra de `art` si tiene tags activos asociados. Útil contra borrados accidentales.

### 6.4. Aplicar la migración

```bash
# Desde el directorio del backend
turso db shell <nombre-de-tu-db> < migrations/002_nfc_tags.sql
```

O desde tu sistema de migraciones (si tienes uno, p.ej. `node migrations/run.js`).

---

## 7. Plantilla de URL SUN

### 7.1. URL final

La URL escrita en el NDEF de cada pegatina, **antes** de que la chip rellene los datos dinámicos, es:

```
https://140d.art/coa?picc=00000000000000000000000000000000&cmac=0000000000000000
                          ^                                ^    ^              ^
                          |    32 hex (16 bytes PICC)      |    |  16 hex (8 bytes CMAC)
                          +------ placeholder PICC ---------+    +-- placeholder CMAC -+
```

- **32 ceros** marcan dónde el chip inyectará el **PICC data cifrado** (UID + contador encriptados con K2 = `K_PICC`).
- **16 ceros** marcan dónde el chip inyectará el **CMAC** (8 bytes computados con K1 diversificada).

Cuando alguien hace tap, el chip reescribe esos placeholders al vuelo y el móvil ve, por ejemplo:

```
https://140d.art/coa?picc=AF1B62D5C7E83F90A2748B931E5C0D6F&cmac=8B2D5E9A41F73C68
```

### 7.2. Estructura binaria del archivo NDEF

Para configurar SDM hay que decirle al chip dónde están exactamente esos placeholders dentro del archivo NDEF. La estructura es:

```
Offset  Bytes  Contenido
------  -----  ----------------------------------------------------------
 0-1    2      NLEN (longitud del mensaje NDEF, big-endian)
 2      1      NDEF header (0xD1 = MB+ME+SR+TNF_WellKnown)
 3      1      Type Length (0x01)
 4      1      Payload Length (0x49 = 73 bytes)
 5      1      Type (0x55 = 'U', URI record)
 6      1      URI Prefix (0x04 = "https://")
 7-24   18     "140d.art/coa?picc="
25-56   32     Placeholder PICC (32 bytes a 0x30 = '0' ASCII)
57-62   6      "&cmac="
63-78   16     Placeholder CMAC (16 bytes a 0x30 = '0' ASCII)
```

**Offsets que el chip necesita conocer (en `ChangeFileSettings`)**:

| Parámetro | Valor | Comentario |
|---|---|---|
| `PICCDataMirrorOffset` | 25 (0x19) | Inicio del placeholder PICC |
| `SDMMACInputOffset` | 63 (0x3F) | Inicio de los datos a MACear (vacío) |
| `SDMMACOffset` | 63 (0x3F) | Inicio del placeholder CMAC |

> **Nota**: con `SDMMACInputOffset == SDMMACOffset` el CMAC se calcula sobre datos vacíos. La protección viene de que la **clave de sesión** se deriva del UID + contador con K1 diversificada, lo cual es suficiente. Si quisieras MACear también el PICC cifrado por integridad adicional, pondrías `SDMMACInputOffset = 25` — pero no aporta seguridad real porque el PICC ya está cifrado con clave que solo el servidor conoce.

### 7.3. Acceso del archivo NDEF (FileAR) durante personalización

Durante la programación inicial (antes de aplicar el lock):

| Derecho | Valor | Significado |
|---|---|---|
| Read | `E` | Libre, sin autenticación (necesario para que el tap funcione) |
| Write | `0` | Requiere K0 |
| ReadWrite | `0` | Requiere K0 |
| Change | `0` | Requiere K0 para modificar este FileSettings |

En el paso de bloqueo permanente (sección 9), cambiarás Write, ReadWrite y Change a `F` (sin acceso para nadie).

---

## 8. Procedimiento de programación (Camino A: Node.js + ACR1552U)

Tres caminos realistas, pero para tu setup (Pixel 9 Pro + stack JS + 50 tags) el **Camino A** es claramente el adecuado. Los otros dos están descritos brevemente en el apéndice (sección 8.6).

### 8.1. Setup inicial del directorio `scripts/nfc-personalization/`

```bash
cd /ruta/al/repo
mkdir -p scripts/nfc-personalization/src/lib
cd scripts/nfc-personalization

npm init -y
npm install nfc-pcsc ntag424 node-aes-cmac @libsql/client prompts dotenv
```

Crea `.env.example` (commiteable, sin secretos):

```env
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=replace-with-actual-token

NTAG424_SYSTEM_ID=313430
NTAG424_K_PICC=replace-with-32-hex-chars
NTAG424_MASTER_KEY=replace-with-32-hex-chars

GALLERY_BASE_URL=https://140d.art
OPERATOR=tu-nombre
```

Crea el `.env` real localmente (NO commitear) con los valores efectivos.

### 8.2. Módulos auxiliares

**`scripts/nfc-personalization/src/lib/crypto.js`**:

```javascript
import { aesCmac } from 'node-aes-cmac';

const SYSTEM_ID = Buffer.from(process.env.NTAG424_SYSTEM_ID, 'hex');
const MASTER_KEY = Buffer.from(process.env.NTAG424_MASTER_KEY, 'hex');

/**
 * Deriva una clave diversificada por UID siguiendo NXP AN10922 simplificado.
 * @param {Buffer} uid - 7 bytes del UID del tag
 * @param {number} label - 0x01=K0, 0x02=K1, 0x03=K3, 0x04=K4
 * @returns {Buffer} - 16 bytes de clave AES-128
 */
export function deriveTagKey(uid, label) {
  const divInput = Buffer.concat([Buffer.from([label]), uid, SYSTEM_ID]);
  return aesCmac(MASTER_KEY, divInput);
}

/**
 * Devuelve el set completo de claves a escribir en un tag concreto.
 */
export function deriveAllKeys(uid) {
  return {
    K0: deriveTagKey(uid, 0x01),
    K1: deriveTagKey(uid, 0x02),
    K2: Buffer.from(process.env.NTAG424_K_PICC, 'hex'),  // fija
    K3: deriveTagKey(uid, 0x03),
    K4: deriveTagKey(uid, 0x04),
  };
}
```

**`scripts/nfc-personalization/src/lib/db.js`**:

```javascript
import { createClient } from '@libsql/client';

export const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function findArtBySlug(slug) {
  const result = await turso.execute({
    sql: 'SELECT id, name, slug FROM art WHERE slug = ? AND removed = 0 LIMIT 1',
    args: [slug],
  });
  return result.rows[0] || null;
}

export async function findArtById(id) {
  const result = await turso.execute({
    sql: 'SELECT id, name, slug FROM art WHERE id = ? AND removed = 0 LIMIT 1',
    args: [id],
  });
  return result.rows[0] || null;
}

export async function findActiveTagByArt(artId) {
  const result = await turso.execute({
    sql: "SELECT uid FROM nfc_tags WHERE art_id = ? AND status = 'active' LIMIT 1",
    args: [artId],
  });
  return result.rows[0] || null;
}

export async function insertNfcTag({ uid, artId, serialLabel, operator }) {
  await turso.execute({
    sql: `INSERT INTO nfc_tags (uid, art_id, serial_label, status, personalized_by)
          VALUES (?, ?, ?, 'active', ?)`,
    args: [uid, artId, serialLabel, operator],
  });
}

export async function markAsLocked(uid) {
  await turso.execute({
    sql: `UPDATE nfc_tags SET is_permanently_locked = 1, locked_at = CURRENT_TIMESTAMP
          WHERE uid = ?`,
    args: [uid],
  });
}
```

**`scripts/nfc-personalization/src/lib/ntag424.js`** (capa de wrappers sobre la librería `ntag424` o, alternativamente, sobre APDU directos según AN12196). Este es el módulo más dependiente de la versión exacta de la librería que uses; expón una API limpia como:

```javascript
// API conceptual — adapta al constructor real de la librería ntag424
// que elijas o a APDU directos siguiendo AN12196 cap. 11
export class Ntag424Session {
  constructor(reader) { /* ... */ }

  async getUid() { /* Cmd.GetCardUID o lectura ISO 14443A */ }

  async authenticateEv2First(keyNumber, key) {
    // 3-pass mutual auth, AN12196 §4.1
  }

  async changeKey(keyNumber, newKey, currentKey, version = 0) {
    // ChangeKey APDU 0x90 0xC4
  }

  async writeNdef(url) {
    // WriteData en File 02
  }

  async configureSdm({
    sdmMetaReadKey,        // índice de clave (2 = K2 = K_PICC)
    sdmFileReadKey,        // índice de clave (1 = K1 diversificada)
    piccDataMirrorOffset,  // 25
    sdmMacInputOffset,     // 63
    sdmMacOffset,          // 63
  }) {
    // ChangeFileSettings APDU 0x90 0x5F sobre File 02
    // FileAR durante personalización: Read=E, Write=0, ReadWrite=0, Change=0
  }

  async lockFilePermanently() {
    // ChangeFileSettings con FileAR: Read=E, Write=F, ReadWrite=F, Change=F
    // Tras esto, este file no admite más cambios de settings ni de contenido
  }

  async readFileSettings() {
    // GetFileSettings APDU 0x90 0xF5, para verificación post-programación
  }
}
```

### 8.3. Script principal `personalize.js`

```javascript
// scripts/nfc-personalization/src/personalize.js
import 'dotenv/config';
import { NFC } from 'nfc-pcsc';
import prompts from 'prompts';
import { Ntag424Session } from './lib/ntag424.js';
import { deriveAllKeys } from './lib/crypto.js';
import {
  findArtBySlug,
  findActiveTagByArt,
  insertNfcTag,
} from './lib/db.js';

const BASE_URL = process.env.GALLERY_BASE_URL;     // https://140d.art
const OPERATOR = process.env.OPERATOR;
const FACTORY_KEY = Buffer.alloc(16, 0);            // 00...00

// URL plantilla con placeholders de ceros
const NDEF_URL = `${BASE_URL}/coa?picc=${'0'.repeat(32)}&cmac=${'0'.repeat(16)}`;

const SDM_CONFIG = {
  sdmMetaReadKey: 2,           // K2 (K_PICC, fija)
  sdmFileReadKey: 1,           // K1 (diversificada)
  piccDataMirrorOffset: 25,
  sdmMacInputOffset: 63,
  sdmMacOffset: 63,
};

console.log('🎨 140d.art — Personalización NTAG 424 DNA');
console.log(`Operador: ${OPERATOR}`);
console.log('Coloca una pegatina sobre el lector ACR1552U para empezar...\n');

const nfc = new NFC();

nfc.on('reader', (reader) => {
  console.log(`✓ Lector conectado: ${reader.name}\n`);

  reader.on('card', async () => {
    const session = new Ntag424Session(reader);

    try {
      // 1. Leer UID
      const uid = await session.getUid();
      const uidHex = uid.toString('hex').toUpperCase();
      console.log(`📡 Tag detectado — UID: ${uidHex}`);

      // 2. Pedir slug de la obra
      const { slug } = await prompts({
        type: 'text',
        name: 'slug',
        message: 'Slug de la obra a vincular (campo "slug" en tabla art):',
      });
      if (!slug) {
        console.log('Cancelado.');
        return;
      }

      // 3. Buscar la obra y validar que no tenga ya un tag activo
      const art = await findArtBySlug(slug);
      if (!art) {
        console.error(`✗ No existe obra con slug "${slug}" o está marcada como removed.`);
        return;
      }
      const existing = await findActiveTagByArt(art.id);
      if (existing) {
        console.error(`✗ La obra "${art.name}" (id=${art.id}) ya tiene un tag activo: ${existing.uid}`);
        console.error('  Revoca el anterior primero (UPDATE nfc_tags SET status=\'revoked\' WHERE uid=...)');
        return;
      }

      // 4. Confirmación antes de tocar el chip
      const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: `Vincular tag ${uidHex} → obra "${art.name}" (id=${art.id})?`,
        initial: true,
      });
      if (!confirm) {
        console.log('Cancelado.');
        return;
      }

      // 5. Derivar todas las claves para este UID
      const keys = deriveAllKeys(uid);
      console.log('🔐 Claves derivadas (no se imprimen por seguridad).');

      // 6. Autenticar con K0 de fábrica (ceros) y cambiar claves
      console.log('🔄 Cambiando claves K1 → K2 → K3 → K4 → K0...');
      await session.authenticateEv2First(0, FACTORY_KEY);
      await session.changeKey(1, keys.K1, FACTORY_KEY);
      await session.changeKey(2, keys.K2, FACTORY_KEY);
      await session.changeKey(3, keys.K3, FACTORY_KEY);
      await session.changeKey(4, keys.K4, FACTORY_KEY);
      await session.changeKey(0, keys.K0, FACTORY_KEY);   // K0 al final, crítico
      console.log('✓ Claves cambiadas.');

      // 7. Escribir NDEF y configurar SDM
      // Tras cambiar K0 hay que re-autenticar con la nueva K0
      await session.authenticateEv2First(0, keys.K0);
      await session.writeNdef(NDEF_URL);
      await session.configureSdm(SDM_CONFIG);
      console.log('✓ NDEF escrito y SDM configurado.');

      // 8. Registrar en BD
      const year = new Date().getFullYear();
      const serial = `GAL-${year}-${String(art.id).padStart(4, '0')}`;
      await insertNfcTag({
        uid: uidHex,
        artId: art.id,
        serialLabel: serial,
        operator: OPERATOR,
      });
      console.log(`✓ Insertado en BD con serial ${serial}.\n`);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  PRÓXIMOS PASOS PARA ESTA PEGATINA:');
      console.log('  1. Retira la pegatina del lector.');
      console.log('  2. Pásala por tu móvil. Debe abrirse:');
      console.log('     https://140d.art/coa?picc=<32hex>&cmac=<16hex>');
      console.log('     con valores DISTINTOS en cada lectura.');
      console.log('  3. Verifica en el navegador que la página muestra');
      console.log(`     la obra correcta: "${art.name}"`);
      console.log('  4. Si todo correcto: pega la pegatina al CoA físico');
      console.log('     correspondiente y archiva el CoA.');
      console.log(`  5. CUANDO ESTÉS SEGURO, ejecuta el bloqueo permanente:`);
      console.log(`     npm run lock -- ${uidHex}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('Coloca la siguiente pegatina o pulsa Ctrl+C para salir.\n');

    } catch (err) {
      console.error('✗ Error procesando el tag:', err.message);
      console.error('  Esta pegatina puede haber quedado en estado inconsistente.');
      console.error('  Anota el UID y descártala físicamente o investiga con inspect-tag.js');
    }
  });

  reader.on('error', (err) => console.error('Error de lector:', err.message));
});

nfc.on('error', (err) => console.error('Error NFC:', err.message));
```

### 8.4. Verificación tras programar

Después de cada pegatina (y **antes** del bloqueo permanente):

1. Pasa la pegatina por tu Pixel. Debe abrir el navegador con `https://140d.art/coa?picc=<32hex>&cmac=<16hex>`. Los valores deben ser distintos en cada tap.
2. La página de Next.js debe mostrar la obra correcta vinculada con datos: nombre, descripción, contador de verificaciones = 1, 2, 3...
3. Lee la URL completa y observa que el contador SDM se incremente entre lecturas.
4. Si la URL muestra los placeholders de ceros sin sustituir → SDM no está activado correctamente. Repite la configuración.
5. Si la URL es dinámica pero el servidor responde `invalid_cmac` → la SDM apunta a la clave equivocada o el offset está mal.

### 8.5. Snippet portátil para derivar claves

`scripts/nfc-personalization/src/derive-keys.js` — útil si necesitas las claves de un tag concreto (p.ej. para diagnóstico manual):

```javascript
// node src/derive-keys.js <uidHex>
import 'dotenv/config';
import { deriveAllKeys } from './lib/crypto.js';

const [, , uidHex] = process.argv;
if (!uidHex || !/^[0-9a-fA-F]{14}$/.test(uidHex)) {
  console.error('Uso: node src/derive-keys.js <UID-14-hex-chars>');
  process.exit(1);
}

const uid = Buffer.from(uidHex, 'hex');
const keys = deriveAllKeys(uid);

console.log(`UID = ${uidHex.toUpperCase()}`);
console.log(`K0  = ${keys.K0.toString('hex').toUpperCase()}`);
console.log(`K1  = ${keys.K1.toString('hex').toUpperCase()}`);
console.log(`K2  = ${keys.K2.toString('hex').toUpperCase()}  (fija, no diversificada)`);
console.log(`K3  = ${keys.K3.toString('hex').toUpperCase()}`);
console.log(`K4  = ${keys.K4.toString('hex').toUpperCase()}`);
```

### 8.6. Caminos alternativos (resumen)

- **Camino B — TagXplorer Desktop legacy + ACR1552U**: programa GUI Java de NXP, marcada como "no longer manufactured" pero aún descargable desde el archivo de NXP. Útil si no quieres escribir el script Node.js. Manual y lento (~5 min/tag), no escala.
- **Camino C — Servicio de pre-personalización**: GoToTags, Identiv, NXP Secure Services. Ellos programan en su entorno (idealmente HSM) y te envían los tags listos. Mínimo trabajo técnico tuyo, ~2-5 €/tag extra, dependes del proveedor con tus claves maestras.

Para 50 tags y un repositorio que será mantenido en el tiempo, el Camino A es el correcto: inversión inicial moderada que pagas una vez y reutilizas en cada lote futuro.

---

## 9. Bloqueo permanente del NDEF

Este es un paso **diferenciado, posterior y opcional desde el punto de vista del chip, pero crítico desde el punto de vista operativo**. Una vez aplicado, la pegatina queda inmutable: nadie, ni siquiera tú con la clave maestra, puede modificar la URL ni la configuración SDM nunca más.

### 9.1. Cuándo aplicarlo

**Nunca inmediatamente tras programar**. El protocolo recomendado:

1. **Día 0** — Programación: corres `personalize.js`, programas la pegatina, la verificas con el móvil, registras en BD.
2. **Día 0** — Pegado físico: aplicas la pegatina al CoA correspondiente, archivas el CoA.
3. **Día 1-7** — Periodo de prueba: durante este periodo verificas el tap varias veces, opcionalmente lo verifica un colaborador desde otro móvil. Si encuentras cualquier problema (URL incorrecta, vinculación mal hecha en BD, SDM mal configurado), descartas la pegatina, sustituyes y reprogramas.
4. **Cuando estés 100% seguro** (típicamente antes de entregar al coleccionista, o tras unos días en exhibición): ejecutas el bloqueo permanente, `lock-tag.js`.

Algunos prefieren hacer el lock como paso final justo antes de pegar la pegatina al CoA. Es válido si tu proceso de verificación es exhaustivo y rápido. Yo recomiendo el periodo de prueba diferido para detectar errores que solo se manifiestan en uso real.

### 9.2. Qué se bloquea y qué no

Lo que **sí** queda bloqueado tras el lock:

- El contenido de la URL en el NDEF (File 02). No se puede reescribir.
- La configuración SDM (ofssets, qué clave usa para CMAC, etc.). No se puede modificar.
- Los FileSettings del propio File 02. No se pueden cambiar (porque pones `Change=F`).

Lo que **no** queda bloqueado:

- Las claves AES K0-K4 a nivel PICC. En teoría, si alguien tuviera tu `MASTER_KEY` y conociera el UID, podría usar `ChangeKey` para cambiar las claves. **Pero** esto no le permite modificar el NDEF (que ya está bloqueado), así que como vector de ataque no aporta mucho. Y si tu `MASTER_KEY` se filtra, tienes problemas más serios (puede generar pegatinas falsas para *otras* obras).
- La lectura del NDEF (`Read=E` queda libre). El tap del móvil sigue funcionando para siempre.

Para protección adicional contra `ChangeKey` no autorizado, podrías usar `Cmd.SetConfiguration` para deshabilitar permanentemente ciertas operaciones a nivel PICC. Pero esto es una capa extra que para tu caso no es necesaria.

### 9.3. Script `lock-tag.js`

```javascript
// scripts/nfc-personalization/src/lock-tag.js
import 'dotenv/config';
import { NFC } from 'nfc-pcsc';
import prompts from 'prompts';
import { Ntag424Session } from './lib/ntag424.js';
import { deriveAllKeys } from './lib/crypto.js';
import { turso, markAsLocked } from './lib/db.js';

const [, , targetUidHex] = process.argv;

console.log('🔒 140d.art — Bloqueo permanente NTAG 424 DNA\n');
console.log('⚠️  ATENCIÓN: este paso es IRREVERSIBLE.');
console.log('   Tras ejecutar, la URL y configuración SDM del tag quedan');
console.log('   bloqueadas en hardware. Si hay cualquier error en la grabación,');
console.log('   la pegatina será inutilizable y deberás reemplazarla.\n');

if (targetUidHex && !/^[0-9a-fA-F]{14}$/.test(targetUidHex)) {
  console.error('UID inválido. Debe ser 14 caracteres hex (7 bytes).');
  process.exit(1);
}

console.log('Coloca la pegatina sobre el lector...\n');

const nfc = new NFC();

nfc.on('reader', (reader) => {
  reader.on('card', async () => {
    const session = new Ntag424Session(reader);

    try {
      // 1. Leer UID y validar contra el esperado (si se pasó por CLI)
      const uid = await session.getUid();
      const uidHex = uid.toString('hex').toUpperCase();

      if (targetUidHex && uidHex !== targetUidHex.toUpperCase()) {
        console.error(`✗ UID del tag (${uidHex}) no coincide con el esperado (${targetUidHex.toUpperCase()}).`);
        return;
      }

      // 2. Verificar que existe en BD y no está ya bloqueado
      const result = await turso.execute({
        sql: `SELECT t.uid, t.is_permanently_locked, t.status, a.name as art_name
              FROM nfc_tags t JOIN art a ON a.id = t.art_id
              WHERE t.uid = ? LIMIT 1`,
        args: [uidHex],
      });
      const tag = result.rows[0];
      if (!tag) {
        console.error(`✗ Tag ${uidHex} no encontrado en BD. ¿Lo has personalizado?`);
        return;
      }
      if (tag.is_permanently_locked === 1) {
        console.error(`✗ Tag ${uidHex} ya está marcado como bloqueado en BD.`);
        return;
      }
      if (tag.status !== 'active') {
        console.error(`✗ Tag ${uidHex} está en estado "${tag.status}", no se puede bloquear.`);
        return;
      }

      // 3. Confirmación EXPLÍCITA del operador
      console.log(`Tag ${uidHex} corresponde a la obra: "${tag.art_name}"`);
      const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: '¿Has verificado que el tap del móvil funciona correctamente con esta pegatina?',
        initial: false,
      });
      if (!confirm) {
        console.log('Verifica primero con el móvil antes de bloquear.');
        return;
      }

      const { confirmLock } = await prompts({
        type: 'confirm',
        name: 'confirmLock',
        message: '⚠️  Confirma el bloqueo PERMANENTE e IRREVERSIBLE',
        initial: false,
      });
      if (!confirmLock) {
        console.log('Bloqueo cancelado.');
        return;
      }

      // 4. Derivar K0 y autenticar
      const keys = deriveAllKeys(uid);
      await session.authenticateEv2First(0, keys.K0);

      // 5. Aplicar el lock: ChangeFileSettings en File 02 con FileAR = E0FF
      //    Read=E (libre), Write=F, ReadWrite=F, Change=F
      await session.lockFilePermanently();

      // 6. Verificar leyendo los FileSettings de vuelta
      const settings = await session.readFileSettings(2);
      // Aquí podrías parsear settings y comprobar que efectivamente Change=F
      console.log('✓ FileSettings tras lock:', settings);

      // 7. Marcar en BD
      await markAsLocked(uidHex);
      console.log(`\n🔒 Tag ${uidHex} bloqueado permanentemente y registrado en BD.`);
      console.log('   Cualquier intento futuro de modificar este NDEF fallará.');

    } catch (err) {
      console.error('✗ Error durante el bloqueo:', err.message);
      console.error('  Revisa con inspect-tag.js el estado actual del tag.');
    }
  });

  reader.on('error', (err) => console.error('Error de lector:', err.message));
});
```

### 9.4. Bloqueo por lotes

Para procesar varios bloqueos seguidos sin tener que invocar el script una vez por tag, puedes crear `lock-batch.js` que itere sobre todos los `nfc_tags` con `status='active' AND is_permanently_locked=0` y los procese uno a uno conforme los apoyas en el lector. Estructura similar pero sin pasar UID por CLI; valida cada tag presentado contra los pendientes en BD.

### 9.5. Verificación post-lock

Tras bloquear:

1. El tap del móvil **debe seguir funcionando** (Read sigue libre). Pruébalo.
2. Si intentas ejecutar `personalize.js` o `lock-tag.js` de nuevo sobre el mismo tag, la operación `ChangeFileSettings` debe fallar con un código tipo `9197` (Permission Denied). Esto es el indicador de que el lock está activo.
3. En BD: `SELECT is_permanently_locked, locked_at FROM nfc_tags WHERE uid = ?` debe devolver `1` y la fecha.

---

## 10. Implementación del endpoint de verificación

### 10.1. Módulo compartido de criptografía (backend)

**`backend/src/services/ntag424-verify.js`**:

```javascript
import crypto from 'node:crypto';
import { aesCmac } from 'node-aes-cmac';

const K_PICC     = Buffer.from(process.env.NTAG424_K_PICC, 'hex');
const MASTER_KEY = Buffer.from(process.env.NTAG424_MASTER_KEY, 'hex');
const SYSTEM_ID  = Buffer.from(process.env.NTAG424_SYSTEM_ID, 'hex');

function decryptPicc(piccHex) {
  const ciphertext = Buffer.from(piccHex, 'hex');
  if (ciphertext.length !== 16) throw new Error('PICC longitud inválida');
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv('aes-128-cbc', K_PICC, iv);
  decipher.setAutoPadding(false);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  // Estructura: [tag(1) | UID(7) | counter(3 LE) | padding(5)]
  const piccDataTag = plain[0];
  const uid = plain.subarray(1, 8);
  const ctrLE = plain.subarray(8, 11);
  const counter = ctrLE[0] | (ctrLE[1] << 8) | (ctrLE[2] << 16);
  return { piccDataTag, uid, counter };
}

function deriveTagCmacKey(uid) {
  // label 0x02 = K1 (CMAC), igual que en el script de personalización
  return aesCmac(MASTER_KEY, Buffer.concat([Buffer.from([0x02]), uid, SYSTEM_ID]));
}

function sdmSessionMacKey(kFile, uid, counter) {
  const ctrLE = Buffer.from([counter & 0xFF, (counter >> 8) & 0xFF, (counter >> 16) & 0xFF]);
  const sv2 = Buffer.concat([
    Buffer.from([0x3C, 0xC3, 0x00, 0x01, 0x00, 0x80]),
    uid,
    ctrLE,
  ]);
  return aesCmac(kFile, sv2);
}

function computeSdmMac(sessionKey, macInput = Buffer.alloc(0)) {
  const full = aesCmac(sessionKey, macInput);
  // Truncado: bytes impares (índices 1,3,5,...,15) = 8 bytes
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) out[i] = full[2 * i + 1];
  return out;
}

/**
 * Verifica una URL SUN del NTAG 424 DNA.
 * @param {{piccHex: string, cmacHex: string}} params
 * @returns {{ok: boolean, reason?: string, uidHex?: string, counter?: number}}
 */
export function verifySunParams({ piccHex, cmacHex }) {
  if (!/^[0-9a-fA-F]{32}$/.test(piccHex || '')) return { ok: false, reason: 'MALFORMED' };
  if (!/^[0-9a-fA-F]{16}$/.test(cmacHex || '')) return { ok: false, reason: 'MALFORMED' };

  let uid, counter;
  try {
    ({ uid, counter } = decryptPicc(piccHex));
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
  const uidHex = uid.toString('hex').toUpperCase();

  const kFile      = deriveTagCmacKey(uid);
  const sessionKey = sdmSessionMacKey(kFile, uid, counter);
  const expected   = computeSdmMac(sessionKey);
  const provided   = Buffer.from(cmacHex, 'hex');

  if (expected.length !== provided.length ||
      !crypto.timingSafeEqual(expected, provided)) {
    return { ok: false, reason: 'INVALID_CMAC', uidHex, counter };
  }

  return { ok: true, uidHex, counter };
}
```

### 10.2. Cliente Turso del backend

Si no lo tienes ya, crea **`backend/src/services/db.js`**:

```javascript
import { createClient } from '@libsql/client';

export const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
```

### 10.3. Hash de IP

**`backend/src/utils/ip-privacy.js`**:

```javascript
import crypto from 'node:crypto';

const SALT = process.env.IP_HASH_SALT;

export function hashIp(ip) {
  if (!ip) return null;
  return crypto
    .createHmac('sha256', SALT)
    .update(ip)
    .digest('hex')
    .slice(0, 32);
}
```

### 10.4. Endpoint Express

**`backend/src/routes/coa-verify.js`**:

```javascript
import express from 'express';
import { verifySunParams } from '../services/ntag424-verify.js';
import { turso } from '../services/db.js';
import { hashIp } from '../utils/ip-privacy.js';

export const coaVerifyRouter = express.Router();

coaVerifyRouter.get('/coa/verify', async (req, res) => {
  const { picc, cmac } = req.query;
  const result = verifySunParams({ piccHex: picc, cmacHex: cmac });

  const baseEvent = {
    uid: result.uidHex || null,
    counter: result.counter ?? null,
    ip_hash: hashIp(req.ip),
    user_agent: (req.get('user-agent') || '').slice(0, 256),
  };

  const logEvent = async (status) => {
    await turso.execute({
      sql: `INSERT INTO verification_events (uid, counter, status, ip_hash, user_agent)
            VALUES (?, ?, ?, ?, ?)`,
      args: [baseEvent.uid, baseEvent.counter, status, baseEvent.ip_hash, baseEvent.user_agent],
    });
  };

  if (!result.ok) {
    await logEvent(result.reason.toLowerCase());
    return res.json({ status: result.reason.toLowerCase() });
  }

  // Buscar tag + obra en una sola query
  const tagQuery = await turso.execute({
    sql: `SELECT
            t.uid, t.status, t.last_counter, t.is_permanently_locked,
            a.id as art_id, a.name, a.slug, a.description, a.basename, a.type, a.dimensions
          FROM nfc_tags t
          JOIN art a ON a.id = t.art_id
          WHERE t.uid = ? LIMIT 1`,
    args: [result.uidHex],
  });
  const tag = tagQuery.rows[0];

  if (!tag) {
    await logEvent('unknown_tag');
    return res.json({ status: 'unknown_tag' });
  }

  if (tag.status === 'revoked' || tag.status === 'lost' || tag.status === 'damaged') {
    await logEvent('revoked');
    return res.json({ status: 'revoked' });
  }

  if (result.counter <= tag.last_counter) {
    await logEvent('replay');
    return res.json({ status: 'replay' });
  }

  // Actualización atómica del contador con guard anti-race-condition
  const update = await turso.execute({
    sql: `UPDATE nfc_tags SET last_counter = ?
          WHERE uid = ? AND last_counter < ?`,
    args: [result.counter, result.uidHex, result.counter],
  });
  if (update.rowsAffected === 0) {
    // Otro request más rápido ganó: tratamos como replay
    await logEvent('replay');
    return res.json({ status: 'replay' });
  }

  await logEvent('ok');

  return res.json({
    status: 'ok',
    counter: result.counter,
    art: {
      id: tag.art_id,
      name: tag.name,
      slug: tag.slug,
      description: tag.description,
      basename: tag.basename,
      type: tag.type,
      dimensions: tag.dimensions,
    },
  });
});
```

Registra el router en tu `backend/src/app.js` (o el archivo donde montes los routers):

```javascript
import { coaVerifyRouter } from './routes/coa-verify.js';
app.use('/api', coaVerifyRouter);
```

### 10.5. Página Next.js `/coa`

**`frontend/app/coa/page.tsx`** (App Router, Server Component):

```tsx
import { notFound } from 'next/navigation';
import Image from 'next/image';

type VerifyResult =
  | { status: 'ok'; counter: number; art: ArtInfo }
  | { status: 'malformed' | 'invalid_cmac' | 'unknown_tag' | 'revoked' | 'replay' };

type ArtInfo = {
  id: number;
  name: string;
  slug: string;
  description: string;
  basename: string;
  type: string;
  dimensions: string | null;
};

async function verifyTag(picc: string, cmac: string): Promise<VerifyResult> {
  const url = new URL('/api/coa/verify', process.env.INTERNAL_API_URL);
  url.searchParams.set('picc', picc);
  url.searchParams.set('cmac', cmac);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

export default async function CoaPage({
  searchParams,
}: {
  searchParams: Promise<{ picc?: string; cmac?: string }>;
}) {
  const { picc, cmac } = await searchParams;

  if (!picc || !cmac) return <Failure status="malformed" />;

  let result: VerifyResult;
  try {
    result = await verifyTag(picc, cmac);
  } catch (err) {
    console.error('verifyTag error', err);
    return <Failure status="malformed" />;
  }

  if (result.status === 'ok') {
    return <Success art={result.art} counter={result.counter} />;
  }
  return <Failure status={result.status} />;
}

function Success({ art, counter }: { art: ArtInfo; counter: number }) {
  return (
    <main className="coa-success">
      <header>
        <h1>Certificado de Autenticidad verificado ✓</h1>
        <p className="gallery">galería 140d.art</p>
      </header>
      <section className="artwork">
        {/* Adapta a tu CDN/storage real de imágenes */}
        <Image
          src={`/art/${art.basename}.jpg`}
          alt={art.name}
          width={800}
          height={800}
          priority
        />
        <h2>{art.name}</h2>
        <p className="description">{art.description}</p>
        <dl>
          <dt>Tipo</dt><dd>{art.type}</dd>
          {art.dimensions && (<><dt>Dimensiones</dt><dd>{art.dimensions}</dd></>)}
        </dl>
        <p className="counter">
          Verificación n.º {counter} de este certificado.
        </p>
      </section>
    </main>
  );
}

function Failure({ status }: { status: Exclude<VerifyResult['status'], 'ok'> }) {
  const messages = {
    malformed:    'El enlace de verificación es inválido.',
    invalid_cmac: 'La firma del certificado no es válida. Esta pegatina podría ser una copia.',
    unknown_tag:  'Este certificado no está registrado en nuestra galería.',
    replay:       'Esta lectura ya fue registrada. Verifica que la pegatina no haya sido copiada.',
    revoked:      'Este certificado ha sido revocado o reportado como perdido.',
  };
  return (
    <main className="coa-fail">
      <header>
        <h1>No se ha podido verificar</h1>
        <p className="gallery">galería 140d.art</p>
      </header>
      <p>{messages[status]}</p>
      <p className="contact">
        Si crees que es un error, contacta con la galería indicando la fecha,
        hora y el dispositivo desde el que has hecho el tap.
      </p>
    </main>
  );
}
```

### 10.6. Comunicación interna entre contenedores

El `INTERNAL_API_URL=http://backend:3001` solo resuelve dentro de la red de Docker. Verifica:

```yaml
# docker-compose.yml (extracto)
services:
  frontend:
    # ...
    environment:
      - INTERNAL_API_URL=http://backend:3001
    depends_on:
      - backend

  backend:
    # ...
    expose:
      - "3001"           # interno, no necesita `ports` si no expones al host
    environment:
      - PORT=3001
      # ... resto de envs de backend
```

Si tu setup actual de Docker Compose ya tiene la comunicación entre frontend y backend resuelta para otras llamadas (login, listado de obras, etc.), reutiliza esa configuración. No introduzcas nuevos servicios.

---

## 11. Custodia segura de las claves maestras

Las claves `NTAG424_K_PICC` y `NTAG424_MASTER_KEY` son **el secreto comercial más sensible** del sistema. Si se filtran:

- Cualquiera puede generar pegatinas falsas que pasen tu verificación.
- Cualquiera puede descifrar URLs SUN que circulen por internet y enumerar tu colección.

Prácticas mínimas:

1. **Generación**: produce las claves con un CSPRNG (`openssl rand -hex 16`), nunca a mano, nunca con passphrase memorizable.
2. **Almacenamiento en producción**: usa un secrets manager — **Doppler**, **1Password Secrets Automation**, **Infisical**, **AWS Secrets Manager**, **HashiCorp Vault**. Para tu tamaño actual, Doppler o 1Password son buen compromiso simplicidad/seguridad. Evita `.env` en disco en producción salvo cifrados con `sops` o `age`.
3. **Equipo de programación**: el portátil donde corres `personalize.js` y `lock-tag.js` no debería ser tu equipo de uso diario. Lo ideal: un equipo dedicado (incluso un Raspberry Pi 5 con disco cifrado) que solo se enciende para programar pegatinas, sin email, sin navegación. Las claves se cargan en RAM en cada sesión y se descargan al apagar.
4. **Backup**: imprime las claves en hex en papel, séllalo, guárdalo en una caja fuerte ignífuga (off-site o en banco). En digital: cifradas con GPG con tu clave + la de un socio si tienes. La pérdida implica que no puedes verificar ninguna pegatina jamás.
5. **Acceso**: solo tú (y quizá un socio) tenéis acceso a las claves en claro. Colaboradores que programen pegatinas pueden correr el script con las claves ya cargadas en su sesión, sin verlas, en un equipo controlado por ti.
6. **Rotación**: AES-128 está sobrado para tu caso. Pero por higiene, planifica rotación cada 3-5 años o tras evento sospechoso. Sección 15 detalla el procedimiento.
7. **Logging defensivo**: nunca, nunca loguees las claves. En `verification_events` solo: UID, contador, status, IP hasheada, user-agent.
8. **Variables de entorno**: cuidado con que `pm2`, `systemd` o handlers de excepciones impriman el entorno completo. No imprimas `process.env` en logs. No commitees `.env`. Considera `dotenv-vault` o equivalentes para CI/CD.

---

## 12. Modelo de amenazas y mitigaciones

| Amenaza | Vector | Mitigación en este diseño |
|---|---|---|
| Clonado criptográfico del chip | Crear un chip idéntico que pase verificación | AES-128 con clave en hardware no extraíble. Sin filtrar la clave, clonado computacionalmente inviable. |
| Filtración de la clave maestra | Compromiso del servidor o del equipo de programación | Diversificación per-UID: comprometer una pegatina solo expone su K1 individual. Custodia (sección 11). |
| Replay | Capturar URL legítima y reusarla | Contador SDM creciente; `last_counter` con `UPDATE ... WHERE last_counter < ?`. |
| Suplantación del dominio | Tag clonado apunta a `140d.art.fake.com` | HTTPS obligatorio, HSTS, dominio corto y memorable propiedad de la galería. |
| Canal lateral sobre el chip | Análisis físico avanzado | EAL4 + opción de modo LRP. No necesario para esta fase. |
| Sustitución física de la pegatina | Despegarla del CoA legítimo y pegarla en falsificación | Pegatina con adhesivo tamper-evident y/o laminada al CoA. Alternativa: NTAG 424 DNA TagTamper. |
| Compromiso entorno de programación | Malware en el equipo | Equipo dedicado, sin navegación, disco cifrado, claves solo en RAM durante sesión. |
| Manipulación de la BD | Acceso a Turso para reescribir `last_counter` o `art_id` | Tokens con permisos mínimos, backups, auditoría. La criptografía del tag no se compromete con esto. |
| MITM en la URL | Interceptación del tap | HTTPS obligatorio, HSTS. |
| Enumeración por URL | Atacante prueba URLs aleatorias | PICC cifrado: sin `K_PICC` no se generan URLs válidas. Rate-limit del endpoint `/api/coa/verify` por IP. |
| Modificación post-grabación | Atacante con acceso físico al chip intenta reescribir el NDEF | **Bloqueo permanente** (sección 9): FileSettings con `Change=F`, `Write=F`, `ReadWrite=F`. Permanente en hardware. |

---

## 13. Checklist operativo por lote (imprimible)

```
LOTE Nº: _______        FECHA: __________        OPERADOR: __________

ANTES de empezar:
[ ] Equipo de programación arrancado, disco descifrado
[ ] .env de scripts/nfc-personalization/ cargado en sesión
[ ] Turso accesible y backup reciente confirmado
[ ] Lote de pegatinas verificado (NTAG 424 DNA, no clones)
[ ] Tag dummy reservado para pruebas
[ ] ACR1552U USB-C conectado

POR CADA pegatina del lote (FASE 1 — PROGRAMACIÓN):
[ ] Slug de la obra identificado: _______________
[ ] npm run personalize ejecutado
[ ] UID anotado: __________________
[ ] Confirmación de obra: "_______________"
[ ] Claves K1→K2→K3→K4→K0 cambiadas sin error
[ ] NDEF + SDM configurados
[ ] Insertado en BD con serial GAL-YYYY-XXXX
[ ] Tap con móvil: URL dinámica ≠ ceros
[ ] Página /coa muestra la obra correcta
[ ] Contador SDM incrementa entre lecturas
[ ] Pegatina pegada al CoA físico correspondiente
[ ] CoA archivado / asociado a la obra

FASE 2 — BLOQUEO PERMANENTE (días/semanas después,
tras verificación exhaustiva de FASE 1):
[ ] Verificado con móvil otra vez que el tap funciona
[ ] npm run lock -- <UID>
[ ] Confirmación doble aceptada
[ ] FileSettings post-lock leído y verificado
[ ] BD actualizada (is_permanently_locked=1, locked_at=...)
[ ] Tap final post-lock: sigue funcionando

AL ACABAR el lote:
[ ] Programadas ___ / esperadas ___
[ ] Pegatinas descartadas/falladas: ____ (motivo: __________)
[ ] BD exportada como backup post-lote
[ ] Sesión del equipo cerrada, claves descargadas de RAM
```

---

## 14. Pruebas finales antes de producción

Antes de pegar la primera pegatina en un CoA real:

1. **Tag dummy**: programa una pegatina dummy vinculada a una obra ficticia (o real pero marcada como test) en BD.
2. **Tap × 20**: léela 20 veces seguidas. Cada URL distinta, cada CMAC distinto. La página muestra contador incrementándose.
3. **Replay manual**: copia la URL de la lectura #10, pégala en el navegador. Debe dar `replay`. Comprueba en `verification_events`.
4. **CMAC inválido**: edita un carácter del CMAC. Debe dar `invalid_cmac`. Comprueba el evento.
5. **PICC inválido**: edita un carácter del `picc`. Debe dar `invalid_cmac` (CMAC ya no cuadra).
6. **Tag desconocido**: borra el registro de BD sin cambiar el chip. Vuelve a leer. Debe dar `unknown_tag`.
7. **Revocación**: marca `status='revoked'` en BD. Lee. Debe dar `revoked`.
8. **Lector externo**: un colaborador lee la pegatina con su propio móvil. Confirma HTTPS y página correcta.
9. **Concurrencia**: dispara 50 verificaciones simuladas con `autocannon` o similar contra `/api/coa/verify` con URLs distintas. Verifica que no hay race conditions sobre `last_counter` (el `UPDATE ... WHERE last_counter < ?` debe garantizarlo).
10. **Prueba completa de lock**: en una pegatina dummy, ejecuta `lock-tag.js`. Tras locking, intenta ejecutar `personalize.js` de nuevo sobre la misma pegatina: debe fallar con error de permisos.

---

## 15. Casos especiales

### 15.1. Pegatina defectuosa durante personalización

Si falla a mitad (p.ej. comunicación interrumpida tras cambiar K1 pero antes de K0): el tag queda en estado inconsistente. Apunta su UID, márcala como `status='damaged'` en BD si llegaste a registrarla, y descártala físicamente (córtala). Contabiliza 2-5% de mermas por lote.

### 15.2. Obra vendida — transferencia de titularidad

La pegatina permanece válida; lo que cambia es la titularidad. Considera añadir una tabla `art_ownership_history` con dueños sucesivos. La página `/coa` puede mostrar cadena de propietarios anonimizada como prueba de procedencia adicional. No requiere cambio criptográfico.

### 15.3. CoA perdido o pegatina dañada por el dueño

El coleccionista reporta pérdida. `UPDATE nfc_tags SET status='lost' WHERE uid=?`. A partir de entonces, cualquier intento de verificación devuelve `revoked`. Para reemisión: emite un CoA nuevo con pegatina nueva (UID nuevo) vinculada al mismo `art_id`. Mantén ambos registros con `notes` que indique la relación.

### 15.4. Pegatina dañada físicamente

Si el chip no se puede leer, irrecuperable. Procede como 15.3.

### 15.5. Rotación de claves maestras

Si sospechas filtración:

1. Inmediato: `UPDATE nfc_tags SET status='revoked'` en todas las activas afectadas y muestra aviso en la página pública.
2. Genera nuevas claves (`MASTER_KEY_v2`, `K_PICC_v2`).
3. Versiona el endpoint: añade columna `key_version INTEGER NOT NULL DEFAULT 1` a `nfc_tags` y soporta verificación con v1 y v2 en paralelo.
4. Reprograma todas las pegatinas con claves v2. **Esto NO es posible si están bloqueadas permanentemente** (sección 9.2). En ese caso, hay que reemplazar físicamente cada pegatina.
5. Desactiva v1 una vez todas migradas.

Si el compromiso es de un único tag (coleccionista filtra dump): basta con revocar ese tag concreto. La diversificación protege al resto.

### 15.6. Migración a TagTamper

NTAG 424 DNA TagTamper detecta despegado físico. El modelo es idéntico; añade un byte de estado de tamper en el PICC. El verificador lo lee y la página pública refleja "íntegra" / "despegada". Compatible con la arquitectura actual.

### 15.7. Backup de la tabla `nfc_tags`

Imprescindible. Turso ofrece backups automáticos pero conviene también:

```bash
# Export periódico
turso db shell <db> "SELECT * FROM nfc_tags" --output-format csv > nfc_tags_backup_$(date +%F).csv
```

Almacena estos CSV cifrados en almacenamiento off-site. Pierde la BD y pierdes la trazabilidad de qué UID corresponde a qué obra; aunque las pegatinas funcionen criptográficamente, el servidor ya no sabe vincularlas a su obra hasta que restaures.

---

## 16. Referencias

- **NXP AN12196** — *NTAG 424 DNA and NTAG 424 DNA TagTamper features and hints*, Rev. 2.0 (marzo 2025). Documento técnico de referencia para SDM, formatos PICC, derivación de claves de sesión y APDU.
  https://www.nxp.com/docs/en/application-note/AN12196.pdf
- **NXP AN10922** — *Symmetric key diversifications*. Método estándar para derivar claves diversificadas.
  https://www.nxp.com/docs/en/application-note/AN10922.pdf
- **NTAG 424 DNA datasheet** — `NT4H2421Gx` en el sitio NXP.
- **`@libsql/client`** — cliente oficial Turso para Node.js. https://github.com/tursodatabase/libsql-client-ts
- **`ntag424-js`** (MxAshUp, MIT) — librería Node.js para verificar CMAC y descifrar PICC. https://github.com/MxAshUp/ntag424-js
- **`ntag424`** (nikeee, AGPL) — librería Node.js completa con comunicación PC/SC. https://github.com/nikeee/node-ntag424
- **`nfc-pcsc`** — librería Node.js para lectores PC/SC. https://github.com/pokusew/nfc-pcsc
- **`node-aes-cmac`** — implementación AES-CMAC para Node.js.
- **NFC TagInfo by NXP** y **NFC TagWriter by NXP** — apps Android oficiales en Google Play. No cambian claves AES.
- Serie AndroidCrypto en Medium — *Demystify the Secure Dynamic Message with NTAG 424 DNA NFC tags* (parte 1 y 2). Buena referencia práctica.
- **ACS ACR1552U** — ficha técnica del lector. https://www.acs.com.hk/en/products/

---

## Anexo A. Decisiones tomadas y por qué

| Decisión | Razón |
|---|---|
| Dominio y path: `https://140d.art/coa` | Confirmado por el cliente; la galería es 140d.art y `coa` es semántico (Certificate of Authenticity) |
| PICC cifrado en lugar de plano | Privacidad y profesionalidad: nadie ve UIDs ni contadores en URLs filtradas |
| K_PICC fija + K1 diversificada | Permite descifrar PICC sin conocer UID a priori, pero aísla el CMAC por tag |
| Diversificación NXP AN10922 con SystemID="140" | Estándar documentado; el SystemID identifica esta aplicación frente a otras que puedan usar el mismo chip |
| K0 cambiada al final | Si se cambia primero y falla la sesión, el tag queda inaccesible |
| Bloqueo permanente como paso separado | Permite verificación post-pegado antes de comprometer irreversiblemente; reduce pegatinas perdidas por errores |
| ACR1552U USB-C como hardware principal | Modelo confirmado por el cliente; sucesor del 1252U con extended APDU y USB-C |
| Scripts NFC fuera de Docker | Acceso USB físico complicado en contenedores Mac/Windows; mejor ejecutar en host |
| Turso/libSQL con SQL escrito a mano | Confirmado por el cliente; sin ORM, código directo y predecible |
| FK a `art.id` con `ON DELETE RESTRICT` | Coherente con tipo INTEGER del PK existente; evita borrados accidentales que rompan trazabilidad |
| Booleans como INTEGER 0/1 | Coherente con la convención de la tabla `art` existente (visible, is_sold, etc.) |
| Express verifica, Next.js renderiza | Master keys solo en backend; separación de responsabilidades |
| Comunicación interna `http://backend:3001` | Red interna de Docker, sin exposición pública del endpoint API |
| Hash de IP con HMAC-SHA256 | GDPR-friendly; permite detectar abuso sin guardar datos personales |
| `last_counter` con `UPDATE WHERE counter < ?` | Anti-replay robusto incluso bajo concurrencia |
| No activar LRP por ahora | Complejidad innecesaria para tu volumen; reservar para v2 si la galería crece |
| No TagTamper en v1 | Coste y complejidad mayores; adhesivo tamper-evident + laminado físico cubre el caso de uso ahora |

---

*Documento generado para la galería 140d.art como referencia técnica completa para programación de pegatinas NTAG 424 DNA. Pensado para ser usado como contexto en Claude Code dentro del repositorio del proyecto. Revisa y adapta según evolución real del sistema.*
