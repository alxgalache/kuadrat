## ADDED Requirements

### Requirement: Subproyecto Node.js aislado fuera de Docker
El repositorio SHALL incluir un subproyecto en `scripts/nfc-personalization/` con su propio `package.json`, `node_modules` y `.env`. SHALL NO depender de los workspaces de `api/` ni `client/`. SHALL NO ejecutarse dentro de ningún contenedor Docker.

Dependencias mínimas: `nfc-pcsc`, `node-aes-cmac`, `@libsql/client`, `prompts`, `dotenv`.

El subproyecto SHALL incluir un `.gitignore` propio con al menos `node_modules/`, `.env`, `*.log`. El `.env.example` SHALL documentar todas las variables sin valores reales.

#### Scenario: Build del backend no se ve afectado
- **WHEN** se construye la imagen Docker del backend (`api/`)
- **THEN** el build SHALL completarse sin instalar `nfc-pcsc` ni dependencias nativas PC/SC
- **AND** el contenedor resultante SHALL NO contener el directorio `scripts/`.

#### Scenario: `.env` con secretos nunca commiteado
- **WHEN** se inspecciona `git status` tras crear `scripts/nfc-personalization/.env` con valores reales
- **THEN** el fichero SHALL aparecer como ignorado por `.gitignore`.

### Requirement: Variables de entorno del subproyecto
El `.env` de `scripts/nfc-personalization/` SHALL definir:
- `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` (mismos valores que el backend, con permisos de escritura sobre `nfc_tags`).
- `NTAG424_SYSTEM_ID`, `NTAG424_K_PICC`, `NTAG424_MASTER_KEY` (los mismos valores que el backend; las claves DEBEN coincidir o las pegatinas no podrán verificarse).
- `GALLERY_BASE_URL` (p. ej. `https://140d.art`) — base de la URL escrita en el NDEF.
- `OPERATOR` — nombre humano del operador, almacenado en `nfc_tags.personalized_by` para auditoría.

#### Scenario: Las claves del script coinciden con las del backend
- **WHEN** el operador personaliza un tag con cierto valor de `MASTER_KEY` y `K_PICC`
- **AND** el backend está corriendo con los mismos valores
- **THEN** un tap posterior con un móvil SHALL ser verificado correctamente por el endpoint `/api/coa/verify`.

### Requirement: Derivación de claves diversificadas (NXP AN10922 simplificado)
El módulo `scripts/nfc-personalization/src/lib/crypto.js` SHALL implementar `deriveTagKey(uid, label)` y `deriveAllKeys(uid)` tales que:
- `K_tag = AES-CMAC(MASTER_KEY, label_byte || UID_7bytes || SYSTEM_ID_3bytes)`.
- `deriveAllKeys(uid)` retorna `{ K0, K1, K2, K3, K4 }` donde `K2 = K_PICC` (fija) y `K0, K1, K3, K4` son diversificadas con labels `0x01, 0x02, 0x03, 0x04` respectivamente.

Esta derivación SHALL producir los mismos valores que el backend usa al verificar (excepto K0/K3/K4 que el backend nunca usa).

#### Scenario: Vectores conocidos coinciden
- **WHEN** se ejecutan los tests unitarios con un set de vectores conocidos (UID fijo, `MASTER_KEY` y `SYSTEM_ID` fijos del proyecto)
- **THEN** las claves derivadas SHALL coincidir byte a byte con las precomputadas en los vectores
- **AND** el resultado SHALL coincidir con el cálculo equivalente del backend (`api/services/ntag424Service.js`).

### Requirement: Comando `personalize` — programación de pegatinas
El script `scripts/nfc-personalization/src/personalize.js` SHALL implementar un flujo interactivo que:
1. Detecta el tag NFC vía `nfc-pcsc` cuando se coloca sobre el lector ACR1552U.
2. Lee el UID y muestra al operador.
3. Pide por CLI (`prompts`) el `slug` de la obra a vincular.
4. Consulta `art` en Turso por `slug` con `removed = 0 AND status = 'approved'`. Si no existe o no cumple, aborta con mensaje claro.
5. Comprueba que no existe ya un tag activo para esa obra (`SELECT uid FROM nfc_tags WHERE art_id = ? AND status = 'active'`). Si existe, aborta.
6. Pide confirmación explícita al operador antes de tocar el chip.
7. Deriva las 5 claves para el UID.
8. Autentica con K0 = 16 bytes a `0x00` (clave de fábrica) y ejecuta `ChangeKey` en orden K1→K2→K3→K4→K0.
9. Re-autentica con la nueva K0 y escribe el NDEF con la URL plantilla: `${GALLERY_BASE_URL}/coa?picc=<32 ceros ASCII>&cmac=<16 ceros ASCII>`.
10. Configura SDM mediante `ChangeFileSettings` sobre el File 02 con: `Read=E, Write=0, ReadWrite=0, Change=0`, `SDMMetaReadKey=2`, `SDMFileReadKey=1`, `PICCDataMirrorOffset=25`, `SDMMACInputOffset=63`, `SDMMACOffset=63`.
11. Inserta en `nfc_tags`: `uid`, `art_id`, `serial_label` autogenerado (`GAL-YYYY-<art_id zero-padded>`), `status='active'`, `personalized_by=<OPERATOR>`.
12. Imprime instrucciones al operador: retirar la pegatina, probar con móvil, verificar URL dinámica, **NO** bloquear todavía (paso separado).

El script SHALL NO imprimir las claves derivadas en consola ni logs.

#### Scenario: Personalización exitosa de una pegatina virgen
- **WHEN** se coloca un NTAG 424 DNA virgen sobre el lector y se ejecuta `npm run personalize`
- **AND** el operador introduce un `slug` válido de una obra `status='approved' AND removed=0` sin tag activo
- **AND** confirma
- **THEN** el script SHALL completar todos los pasos y mostrar mensaje de éxito
- **AND** SHALL aparecer una nueva fila en `nfc_tags` con los datos correctos
- **AND** un tap posterior con un móvil SHALL abrir la página `/coa` correctamente.

#### Scenario: Operador introduce slug inexistente
- **WHEN** el operador introduce un `slug` que no existe en `art` o tiene `removed=1`
- **THEN** el script SHALL mostrar error claro
- **AND** SHALL NO ejecutar ninguna operación sobre el chip
- **AND** SHALL NO insertar fila en `nfc_tags`.

#### Scenario: Obra ya tiene tag activo
- **WHEN** el operador introduce el `slug` de una obra que ya tiene una fila en `nfc_tags` con `status='active'`
- **THEN** el script SHALL mostrar error indicando el UID del tag existente
- **AND** SHALL mostrar la instrucción SQL para revocarlo (`UPDATE nfc_tags SET status='revoked' WHERE uid=...`)
- **AND** SHALL NO tocar el chip.

#### Scenario: Interrupción durante ChangeKey deja el tag inconsistente
- **WHEN** se interrumpe el script (Ctrl+C, fallo de comunicación) entre ChangeKey de K1 y K0
- **THEN** el script SHALL imprimir un aviso instando al operador a anotar el UID y descartar físicamente la pegatina
- **AND** SHALL NO dejar fila en `nfc_tags` con datos inconsistentes (o la marcará como `damaged` si llegó a insertarse).

### Requirement: Comando `lock` — bloqueo permanente, IRREVERSIBLE, diferido
El script `scripts/nfc-personalization/src/lock-tag.js` SHALL implementar el bloqueo permanente del File 02 del chip. El bloqueo es IRREVERSIBLE en hardware. SHALL:
1. Aceptar el UID esperado opcionalmente como argumento CLI (`npm run lock -- <UID>`).
2. Detectar el tag vía `nfc-pcsc`. Si se pasó UID, validar que coincide.
3. Consultar `nfc_tags` en BD: SHALL existir con `status='active' AND is_permanently_locked=0`.
4. Mostrar al operador la obra asociada y pedir **dos confirmaciones separadas**: primero "¿Has verificado el tap con el móvil?", segundo "Confirma bloqueo PERMANENTE e IRREVERSIBLE".
5. Autenticar con K0 derivada.
6. Ejecutar `ChangeFileSettings` sobre el File 02 reescribiendo el FileAR a `Read=E, Write=F, ReadWrite=F, Change=F`.
7. Leer los FileSettings de vuelta para verificar el cambio.
8. Marcar en BD: `UPDATE nfc_tags SET is_permanently_locked = 1, locked_at = CURRENT_TIMESTAMP WHERE uid = ?`.

#### Scenario: Bloqueo exitoso tras dos confirmaciones
- **WHEN** se coloca el tag, se pasan ambas confirmaciones y el ChangeFileSettings tiene éxito
- **THEN** el script SHALL marcar `is_permanently_locked=1` en BD
- **AND** un tap con móvil posterior SHALL seguir funcionando (Read sigue libre)
- **AND** una llamada a `personalize.js` posterior sobre el mismo tag SHALL fallar con error de permisos.

#### Scenario: Operador no confirma
- **WHEN** el operador responde "no" a cualquiera de las dos confirmaciones
- **THEN** el script SHALL abortar sin tocar el chip ni la BD.

#### Scenario: Tag ya bloqueado
- **WHEN** el tag presentado tiene `is_permanently_locked=1` en BD
- **THEN** el script SHALL abortar antes de pedir confirmación, con mensaje informativo.

### Requirement: Comando `inspect` — diagnóstico sin modificación
El script `scripts/nfc-personalization/src/inspect-tag.js` SHALL leer y mostrar:
1. UID del tag.
2. Tipo de chip (debe ser NTAG 424 DNA, `NT4H2421Gx`); si no coincide, advertir.
3. FileSettings del File 02 (offsets SDM, FileAR, qué claves usa).
4. Contador SDM actual.
5. Estado en BD: existencia en `nfc_tags`, `status`, `is_permanently_locked`, `last_counter`, fecha de personalización, obra asociada.

SHALL NO modificar nada en el chip ni en la BD.

#### Scenario: Diagnóstico de un tag personalizado
- **WHEN** se coloca un tag previamente personalizado
- **THEN** el script SHALL mostrar todos los datos con formato legible
- **AND** SHALL marcar claramente si el tag está bloqueado permanentemente o no.

#### Scenario: Tag falso o no NTAG 424 DNA
- **WHEN** se coloca un tag de tipo distinto (NTAG 213, Mifare Ultralight, clon genérico)
- **THEN** el script SHALL advertir explícitamente que NO es un NTAG 424 DNA válido
- **AND** SHALL NO intentar comandos específicos del NTAG 424 DNA.

### Requirement: Documentación operativa y checklist
El directorio `scripts/nfc-personalization/` SHALL incluir un `README.md` con:
1. Resumen del propósito y advertencia sobre custodia de claves.
2. Setup inicial (instalación de drivers PC/SC, conexión del ACR1552U, creación de `.env`).
3. Procedimiento paso a paso para personalizar un lote de pegatinas.
4. Procedimiento de bloqueo permanente (sólo tras periodo de prueba con móvil).
5. Procedimiento de revocación manual vía SQL (`UPDATE nfc_tags SET status='revoked'/'lost'/'damaged'`).
6. Procedimiento de rotación de claves maestras y sus implicaciones (las pegatinas ya bloqueadas son irreemplazables criptográficamente).
7. Checklist operativo por lote (programación + bloqueo + AL ACABAR).
8. Avisos de seguridad: nunca commitear `.env`, nunca imprimir las claves, equipo con disco cifrado recomendado, backup impreso de claves off-site.

#### Scenario: README presente con todas las secciones requeridas
- **WHEN** se revisa `scripts/nfc-personalization/README.md`
- **THEN** SHALL contener al menos los 8 puntos listados con instrucciones ejecutables (comandos exactos, no genéricos).
