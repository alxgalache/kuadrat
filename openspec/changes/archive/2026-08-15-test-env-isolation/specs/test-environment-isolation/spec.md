## ADDED Requirements

### Requirement: Aislamiento de la base de datos en tests
La ejecución de la suite de tests del backend SHALL usar exclusivamente una base de datos local efímera y NO SHALL escribir ni leer de la base de datos Turso remota, cualquiera que sea el resultado de los tests.

#### Scenario: La suite usa una base local
- **WHEN** se ejecuta `npm test` en `api/`
- **THEN** el cliente libsql se conecta a una URL `file:` local
- **AND** no se abre ninguna conexión de red hacia Turso

#### Scenario: La base se crea desde el origen único de esquema
- **WHEN** arranca la suite de tests
- **THEN** el esquema de la base local se crea invocando `initializeDatabase()` de `api/config/database.js`
- **AND** no existe ninguna definición de esquema duplicada en ficheros de test

#### Scenario: No queda residuo tras la ejecución
- **WHEN** la suite termina, tanto si todos los tests pasan como si alguno falla
- **THEN** el fichero de base de datos local se elimina
- **AND** la base de datos de preproducción no contiene ninguna entidad creada por los tests

#### Scenario: Se conserva la base para diagnóstico bajo demanda
- **WHEN** la suite se ejecuta con `KEEP_TEST_DB=1`
- **THEN** el fichero de base de datos local se conserva al terminar para poder inspeccionarlo

### Requirement: Guardia contra base de datos remota en modo test
El sistema SHALL abortar el proceso antes de ejecutar ninguna sentencia cuando se ejecute en modo test contra una base de datos remota.

#### Scenario: URL remota en modo test
- **WHEN** el proceso arranca con `NODE_ENV=test` y una `TURSO_DATABASE_URL` que no empieza por `file:`
- **THEN** el proceso escribe un mensaje de error que identifica la variable y la URL ofensiva
- **AND** termina con código de salida distinto de cero
- **AND** no se ejecuta ninguna sentencia SQL

#### Scenario: URL local fuera de modo test
- **WHEN** el proceso arranca con `NODE_ENV` distinto de `test` y una `TURSO_DATABASE_URL` de tipo `file:`
- **THEN** el sistema registra un aviso indicando que se está usando una base local
- **AND** el arranque continúa con normalidad

#### Scenario: Credencial no exigida para bases locales
- **WHEN** la `TURSO_DATABASE_URL` es de tipo `file:`
- **THEN** la validación de entorno no exige `TURSO_AUTH_TOKEN`
- **AND** el cliente libsql se crea sin token de autenticación

### Requirement: Bloqueo del envío de email en tests
El sistema SHALL disponer de un modo de transporte de email inerte que NO SHALL contactar con ningún proveedor externo, y SHALL activarlo automáticamente en modo test.

#### Scenario: Ningún envío real durante los tests
- **WHEN** un test ejercita una funcionalidad que envía email, con el proveedor configurado como Resend o como SMTP
- **THEN** no se realiza ninguna petición a la API de Resend ni ninguna conexión SMTP
- **AND** la función de envío devuelve un objeto con `messageId`, de modo que el código llamante sigue funcionando sin cambios

#### Scenario: Los mensajes quedan disponibles para aserción
- **WHEN** un test provoca el envío de un email en modo inerte
- **THEN** el mensaje (destinatario, remitente, asunto y cuerpo) queda registrado en un buzón en memoria consultable desde el test
- **AND** el test puede vaciar ese buzón entre casos

#### Scenario: Los emails de marketing también quedan bloqueados
- **WHEN** un test ejercita el envío de newsletter o cualquier email a través del cliente de marketing
- **THEN** tampoco se realiza ninguna petición al proveedor de marketing

#### Scenario: Sin verificación de transporte en tests
- **WHEN** la aplicación arranca en modo test
- **THEN** no se realiza la verificación de conexión del transporte SMTP

#### Scenario: Activación explícita fuera de tests
- **WHEN** el proceso arranca fuera de modo test con la variable de transporte de email fijada al valor inerte
- **THEN** no se envía ningún email real
- **AND** el sistema registra un aviso indicando que el envío de correo está desactivado

### Requirement: Importar la aplicación no produce efectos secundarios
Importar el módulo de aplicación del backend SHALL construir la aplicación Express y Socket.IO sin abrir puertos, sin inicializar la base de datos, sin verificar el correo y sin arrancar procesos programados.

#### Scenario: Los tests importan la app sin arrancar el servidor
- **WHEN** un test hace `require` del módulo de aplicación
- **THEN** no se abre ningún puerto de escucha
- **AND** no se arranca ningún scheduler (subastas, limpieza de reservas, confirmación de envíos, reintento de envíos, créditos de eventos)
- **AND** no se ejecuta la inicialización de esquema ni la migración de wallet

#### Scenario: El arranque de producción no cambia
- **WHEN** se ejecuta el proceso servidor normalmente
- **THEN** se inicializa el esquema, se ejecuta la migración de wallet, se verifica el correo, se abre el puerto y se arrancan los cinco schedulers, igual que antes del cambio

### Requirement: Configuración de entorno específica de test
El sistema SHALL cargar una configuración de entorno propia de test que tenga prioridad sobre las variables de entorno ya presentes en el proceso.

#### Scenario: Prioridad sobre variables inyectadas por el contenedor
- **WHEN** la suite se ejecuta dentro del contenedor de desarrollo, donde las variables de preproducción ya están en el entorno del proceso
- **THEN** los valores del fichero de entorno de test sobrescriben esas variables antes de cargar cualquier módulo de la aplicación

#### Scenario: El fichero de entorno de test no contiene secretos
- **WHEN** se inspecciona el fichero de entorno de test versionado
- **THEN** todos sus valores son sintéticos y válidos únicamente para satisfacer la validación de arranque
- **AND** no contiene ninguna credencial real de base de datos, correo, pagos ni claves NTAG
