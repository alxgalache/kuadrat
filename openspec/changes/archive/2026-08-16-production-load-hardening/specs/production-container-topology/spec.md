## ADDED Requirements

### Requirement: El reparto de CPU deja margen al proxy
La suma de los límites de CPU de los contenedores SHALL ser menor que el número de vCPU de la máquina. nginx corre en el anfitrión, termina TLS y sirve la caché: si los contenedores pueden reclamar todos los vCPU, compite por los restos.

#### Scenario: Máquina de dos vCPU
- **WHEN** la instancia tiene 2 vCPU
- **THEN** la suma de los límites de los contenedores es como máximo 1.75
- **THEN** queda al menos 0.25 para nginx y el sistema

#### Scenario: Reparto entre servicios
- **WHEN** se asignan los límites
- **THEN** el cliente recibe más CPU que la API, porque el cuello medido está en el render y en el optimizador de imágenes

### Requirement: La API se despliega con una imagen de producción
El servicio de API en producción SHALL construirse desde `api/Dockerfile.prod`, no desde el Dockerfile de desarrollo con el `command` sobreescrito.

#### Scenario: Contenido de la imagen
- **WHEN** se construye la imagen de producción
- **THEN** las dependencias se instalan con `npm ci --omit=dev`
- **THEN** la imagen no contiene jest, nodemon ni supertest

#### Scenario: Apagado ordenado
- **WHEN** el contenedor recibe SIGTERM
- **THEN** la señal llega al proceso de Node a través de un init que reenvía señales
- **THEN** se ejecuta el apagado ordenado en lugar de morir por timeout

#### Scenario: Comando de arranque
- **WHEN** se levanta el servicio
- **THEN** arranca con `node server.js` desde el `CMD` de la imagen, sin `command:` en compose

### Requirement: Ambos servicios declaran healthcheck
Los servicios de API y cliente SHALL declarar un `healthcheck`, de modo que un proceso vivo pero que no responde sea visible.

#### Scenario: El proceso deja de responder
- **WHEN** el servicio no atiende peticiones pero el proceso sigue vivo
- **THEN** el contenedor pasa a estado `unhealthy`

#### Scenario: Arranque en frío
- **WHEN** el contenedor acaba de arrancar
- **THEN** dispone de un periodo de gracia antes de contarse como fallo
