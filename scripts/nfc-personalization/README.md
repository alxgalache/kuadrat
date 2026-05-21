# NFC personalization — `scripts/nfc-personalization/`

Subproyecto **operativo** para programar las pegatinas NTAG 424 DNA que se
adhieren a los Certificados de Autenticidad físicos enviados con cada obra
vendida en 140d Galería de Arte.

> ⚠️ **Este código no se ejecuta dentro de Docker.** Necesita acceso USB
> directo al lector ACS ACR1552U. Se ejecuta en el equipo del operador.
>
> ⚠️ **El `.env` de este directorio contiene los secretos más sensibles del
> sistema.** Si las claves se filtran, cualquiera puede generar pegatinas
> falsas. Si se pierden, ninguna pegatina podrá verificarse jamás. Lee la
> sección §7 antes de seguir.

---

## Implementación: librería `ntag424` (AGPL)

Toda la complejidad criptográfica del NTAG 424 DNA
(`AuthenticateEV2First`, `ChangeKey`, `ChangeFileSettings`, cifrado de
sesión, command counter, MAC sobre el comando) la maneja la librería
[nikeee/node-ntag424](https://github.com/nikeee/node-ntag424) (paquete
npm: `ntag424`, licencia AGPL-3.0).

* `src/lib/crypto.js` — derivación de claves per-UID (AN10922).
* `src/lib/db.js` — cliente Turso.
* `src/lib/ntag424.js` — capa fina sobre la librería con las constantes
  específicas del proyecto (NDEF buffer, FileSettings para
  personalización vs lock, parámetros del chip).
* `src/personalize.js`, `lock-tag.js`, `inspect-tag.js`, `derive-keys.js`
  — flujos operativos.

### Licencia AGPL — implicaciones para 140d

La AGPL exige liberar el código fuente derivado a cualquiera que lo use a
través de una red. Esto **no se activa** en nuestro escenario: el script
se ejecuta en el equipo del operador, en local, sin servir nada por red a
terceros. Para más confianza:

* No redistribuimos el código de la librería (sólo lo usamos
  internamente).
* No exponemos un servicio público basado en este código.
* Si en el futuro se quisiera publicar el subproyecto como herramienta
  open-source, habría que adoptar AGPL o reescribir la capa APDU.

---

## 1. Setup inicial

### 1.1 Drivers PC/SC

Tu sistema necesita un daemon PC/SC vivo y el ACR1552U conectado por USB-C.

* **Linux / Ubuntu**:
  ```bash
  sudo apt install pcscd pcsc-tools libpcsclite-dev
  sudo systemctl enable --now pcscd
  pcsc_scan        # debe listar el ACR1552U
  ```
* **macOS**: nativo, sin instalación adicional. Conecta el lector y listo.
* **Windows**: Windows Smart Card service viene instalado por defecto. El
  driver del ACR1552U se instala automáticamente al conectarlo (o se
  descarga de [acs.com.hk](https://www.acs.com.hk/en/products/)).

### 1.2 Instalación del subproyecto

```bash
cd scripts/nfc-personalization
cp .env.example .env
$EDITOR .env       # rellena con valores reales (sección §3 de este README)
npm install        # compila nfc-pcsc (puede tardar unos segundos)
```

`nfc-pcsc` tiene dependencias nativas (`pcsclite`). Si la compilación
falla, asegúrate de tener `libpcsclite-dev`/`pcsc-lite-headers`/etc.
instalados para tu plataforma.

### 1.3 Verificar el lector

```bash
npm run inspect    # coloca cualquier tag para confirmar comunicación
```

Si no detecta el lector, revisa permisos USB (Linux puede necesitar regla
udev) y reinicia `pcscd`.

---

## 2. Programación de un lote

Por cada pegatina:

```bash
npm run personalize
```

1. Coloca una pegatina virgen sobre el ACR1552U.
2. El script muestra el UID detectado y la versión del chip.
3. Introduce el `slug` de la obra (el campo `slug` en la tabla `art`).
4. Confirma el binding.
5. El script cambia las cinco claves del chip, escribe el NDEF y configura
   SDM. Registra la pegatina en `nfc_tags` (`status='active'`,
   `is_permanently_locked=0`).
6. Retira la pegatina y pásala por un móvil. El navegador debe abrir:
   `https://140d.art/coa?picc=<32hex>&cmac=<16hex>` con valores **distintos
   en cada lectura**. La página `/coa` debe mostrar la obra correcta.
7. Si todo correcto: pega la pegatina al CoA físico.
8. **NO ejecutes `lock` todavía.** Espera 1-7 días con uso real para
   detectar errores antes de bloquear.

---

## 3. Bloqueo permanente (paso diferido)

⚠️ **IRREVERSIBLE.** Sólo cuando estés 100% seguro de que la pegatina
funciona y está pegada en el CoA correcto:

```bash
npm run lock -- <UID>
```

El script pide dos confirmaciones explícitas. Tras ejecutarse:
- La URL NDEF del chip queda en hardware para siempre.
- La configuración SDM queda en hardware para siempre.
- Los FileSettings del File 02 (Read=E, Write=F, ReadWrite=F, Change=F)
  no se pueden modificar nunca más.

Si la pegatina queda mal pegada o se daña tras el lock, la única salida es
**sustituirla físicamente** y emitir un CoA nuevo con un UID distinto.

---

## 4. Revocación manual

V1 no tiene UI de admin para revocar pegatinas. Las operaciones de
revocación se hacen vía SQL directo sobre Turso (o vía el endpoint admin
`PATCH /api/admin/coa/tags/:uid/status` cuando esté disponible).

```sql
-- Coleccionista reporta pérdida del CoA
UPDATE nfc_tags
  SET status = 'lost',
      notes  = COALESCE(notes, '') || char(10) || '[2026-05-17] Coleccionista reporta pérdida'
  WHERE uid = '04A1B2C3D4E5F6';

-- Pegatina dañada físicamente (no se puede leer)
UPDATE nfc_tags SET status = 'damaged' WHERE uid = '...';

-- Sospecha de copia / fraude
UPDATE nfc_tags SET status = 'revoked' WHERE uid = '...';
```

A partir del cambio de estado, el endpoint `/api/coa/verify` devolverá
`status='revoked'` y la página `/coa` mostrará el aviso correspondiente.

Para reemitir un CoA tras pérdida: programa una pegatina nueva (UID nuevo)
con el mismo `art_id`, y deja la fila vieja con `status='lost'`.

---

## 5. Rotación de claves maestras

`NTAG424_K_PICC` y `NTAG424_MASTER_KEY` son AES-128. Sobrado para el
volumen esperado. Aun así, rotarlas tras un evento sospechoso (filtración,
robo de portátil del operador, cambio de personal) es buena higiene.

**Procedimiento**:

1. Marca todas las pegatinas activas afectadas como `status='revoked'` (si
   la sospecha es generalizada).
2. Genera valores nuevos:
   ```bash
   echo "NTAG424_K_PICC_v2=$(openssl rand -hex 16)"
   echo "NTAG424_MASTER_KEY_v2=$(openssl rand -hex 16)"
   ```
3. Como soporte de v2 en paralelo requiere cambios en el backend, el
   protocolo realista en v1 es:
   - Sustituir las claves en producción (backend `.env` + script `.env`).
   - Cualquier pegatina **no bloqueada permanentemente** se puede
     reprogramar con claves v2 (ejecutar `personalize` de nuevo).
   - Las pegatinas **ya bloqueadas** con claves v1 **NO se pueden
     migrar** — ese es el coste del lock permanente. Hay que sustituirlas
     físicamente: pegatina nueva + CoA nuevo.
4. Guarda v1 en la caja fuerte por si necesitas verificar historiales
   antiguos en un sistema legacy mientras dure la transición.

Si el compromiso es de UN SOLO TAG (por ejemplo un coleccionista filtra un
dump del chip): basta con `UPDATE nfc_tags SET status='revoked'` de ese
UID. La diversificación per-UID protege al resto.

---

## 6. Checklist operativo por lote

```
LOTE Nº: ______        FECHA: __________        OPERADOR: __________

ANTES de empezar:
[ ] Equipo de programación arrancado, disco descifrado
[ ] .env de scripts/nfc-personalization/ cargado (claves correctas)
[ ] Turso accesible (`npm run inspect` con un tag de prueba responde)
[ ] Lote de pegatinas verificado (NTAG 424 DNA NT4H2421Gx, 22 mm)
[ ] Tag dummy reservado para pruebas
[ ] ACR1552U USB-C conectado

POR CADA pegatina (FASE 1 — PROGRAMACIÓN):
[ ] Slug de la obra identificado: _______________
[ ] `npm run personalize` ejecutado sin errores
[ ] UID anotado: __________________
[ ] Confirmación de obra: "_______________"
[ ] Claves K1→K2→K3→K4→K0 cambiadas sin error
[ ] NDEF + SDM configurados
[ ] Insertado en BD con serial GAL-YYYY-XXXX
[ ] Tap con móvil: URL dinámica ≠ ceros, valores cambian entre lecturas
[ ] Página /coa muestra la obra correcta
[ ] Contador SDM incrementa entre lecturas
[ ] Pegatina pegada al CoA físico correspondiente
[ ] CoA archivado / asociado a la obra

FASE 2 — BLOQUEO PERMANENTE (días/semanas después,
tras verificación exhaustiva de FASE 1):
[ ] Verificado con móvil otra vez que el tap funciona
[ ] `npm run lock -- <UID>`
[ ] Confirmación doble aceptada
[ ] FileSettings post-lock leído y verificado
[ ] BD actualizada (is_permanently_locked=1, locked_at=…)
[ ] Tap final post-lock: sigue funcionando

AL ACABAR el lote:
[ ] Programadas ___ / esperadas ___
[ ] Pegatinas descartadas/falladas: ____ (motivo: __________)
[ ] BD exportada como backup post-lote
[ ] Sesión del equipo cerrada, claves descargadas de RAM
```

---

## 7. Custodia de las claves

Las claves de `.env` son **el activo criptográfico más sensible del
proyecto**. Reglas mínimas:

1. **Generación**: `openssl rand -hex 16` (CSPRNG). Nunca pensadas a mano.
2. **Almacenamiento**:
   - `.env` con permisos `600` (`chmod 600 .env`).
   - Backup impreso en papel sellado en caja fuerte ignífuga.
   - Copia GPG-cifrada en almacenamiento off-site.
3. **Equipo de programación**: idealmente un portátil dedicado con disco
   cifrado (FileVault / LUKS), sin navegación general, sin email. Las
   claves se cargan en RAM en cada sesión y desaparecen al apagar.
4. **Acceso**: sólo el operador (y un socio de respaldo). Colaboradores
   pueden ejecutar `personalize.js` con la sesión ya iniciada por el
   operador, sin ver las claves.
5. **NUNCA**:
   - commitear `.env` al repo (revisa `.gitignore`).
   - imprimir `process.env` en logs.
   - copiar las claves a un chat, email, ticket, captura de pantalla.
   - reutilizar las claves en otros proyectos.

Pérdida = ninguna pegatina futura puede verificarse, y para las antiguas
hay que confiar en la BD para vincular UID → obra.

Filtración = cualquiera puede generar pegatinas falsas que pasen
verificación. Mitigación: revocar todas y rotar (sección 5).

---

## 8. Comandos disponibles

| Comando | Descripción |
|---|---|
| `npm run personalize` | Programa una pegatina virgen (flujo interactivo). |
| `npm run lock -- <UID>` | **IRREVERSIBLE.** Bloquea permanentemente el NDEF de la pegatina indicada. |
| `npm run inspect` | Diagnóstico read-only. Compara chip vs BD. |
| `npm run derive <UID>` | Imprime las 5 claves derivadas para un UID. **Sólo para diagnóstico**. |
| `npm test` | Tests unitarios (vectores conocidos de cripto). |

---

## Referencias

* **NXP AN12196** — *NTAG 424 DNA and NTAG 424 DNA TagTamper features and
  hints*. Documento técnico de referencia para SDM, PICC, derivación de
  claves de sesión y APDUs.
* **NXP AN10922** — *Symmetric key diversifications*.
* **NTAG 424 DNA datasheet** — `NT4H2421Gx`.
* **ACS ACR1552U** — ficha técnica del lector.
* `openspec/changes/ntag424-coa-programming/` — propuesta y diseño del cambio
  dentro del repositorio del proyecto.
