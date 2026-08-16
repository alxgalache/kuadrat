## ADDED Requirements

### Requirement: El tráfico interno del despliegue está exento del limitador general
Las peticiones que nacen dentro del despliegue SHALL quedar exentas del limitador general. El renderizado del servidor no lleva la IP del visitante, así que sin esta exención todos los renders comparten una única cubeta.

#### Scenario: Petición del renderizado del servidor
- **WHEN** llega una petición desde la red interna sin cabecera `X-Forwarded-For`
- **THEN** no consume cuota del limitador general
- **THEN** no puede recibir `429`

#### Scenario: Petición de un visitante
- **WHEN** llega una petición a través del proxy, con `X-Forwarded-For`
- **THEN** consume cuota normalmente

### Requirement: La exención no es falsificable desde el exterior
La exención SHALL basarse en la ausencia de `X-Forwarded-For`, nunca sólo en el rango de la IP de origen. El proxy añade siempre esa cabecera, de modo que su ausencia sólo es posible desde la red interna.

#### Scenario: Cliente externo que finge una IP privada
- **WHEN** un cliente externo envía `X-Forwarded-For` con una dirección de rango privado
- **THEN** la petición sigue sujeta al limitador

#### Scenario: Cadena de proxies
- **WHEN** la cabecera contiene varias direcciones, todas de rango privado
- **THEN** la petición sigue sujeta al limitador

### Requirement: Un límite abierto se anuncia al arrancar
Cuando el límite general se configure por encima de 100 000 peticiones por ventana, el servicio SHALL emitir un aviso al arrancar. El valor se sube a propósito para medir el techo en pruebas de carga y olvidar revertirlo deja la API sin protección.

#### Scenario: Arranque con el límite subido para pruebas
- **WHEN** el servicio arranca con el límite general por encima de 100 000
- **THEN** registra un `warn` indicando que la API queda efectivamente sin límite

#### Scenario: Arranque con el límite por defecto
- **WHEN** el servicio arranca con el valor por defecto
- **THEN** no emite ese aviso

### Requirement: El endpoint de salud sigue exento
`/health` SHALL seguir sin consumir cuota.

#### Scenario: Sondeo de salud
- **WHEN** el healthcheck del contenedor consulta `/health` de forma periódica
- **THEN** no consume cuota y nunca recibe `429`
