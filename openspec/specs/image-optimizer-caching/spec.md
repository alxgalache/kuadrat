# image-optimizer-caching Specification

## Purpose
Política del optimizador de imágenes de Next.js (`/_next/image`), por el que pasa toda imagen de producto incluida la del lightbox. El original de 1,5 MB es un problema de CPU antes que de ancho de banda: cada variante nueva obliga al contenedor de 1 vCPU a descargar, decodificar, redimensionar y recodificar. Las decisiones de aquí buscan generar el menor número de variantes posible y no regenerarlas nunca.

## Requirements

### Requirement: Las variantes de imagen se cachean durante un año
El optimizador SHALL declarar una vida de caché de un año para las variantes generadas. Los basenames son UUID: una imagen nueva es un fichero nuevo con URL nueva, así que el contenido de una URL `/_next/image` nunca cambia.

#### Scenario: Petición repetida de la misma variante
- **WHEN** se pide dos veces la misma URL de imagen optimizada
- **THEN** la segunda no vuelve a descargar ni a redimensionar el original

#### Scenario: Se sustituye la imagen de una obra
- **WHEN** se sube una imagen nueva para una obra
- **THEN** recibe un basename distinto y por tanto una URL distinta
- **THEN** no hace falta invalidar ninguna caché

### Requirement: La caché de imágenes sobrevive al reinicio del contenedor
Las variantes ya generadas SHALL persistir a un despliegue. La caché propia de Next vive en un tmpfs por el `read_only: true` del contenedor, así que la persistencia la aporta el proxy en disco.

#### Scenario: Despliegue de una versión nueva
- **WHEN** se reconstruye y reinicia el contenedor del cliente
- **THEN** las variantes pedidas antes se siguen sirviendo sin regenerarse

### Requirement: Número acotado de variantes por imagen
El conjunto de anchos generados SHALL limitarse a los que la maquetación usa realmente. Cada ancho nuevo cuesta una decodificación completa del original.

#### Scenario: Imagen en la rejilla de la galería
- **WHEN** un navegador solicita la imagen de una obra en el listado
- **THEN** el ancho servido procede de la lista acotada de tamaños

### Requirement: No se genera AVIF
El optimizador SHALL NOT emitir AVIF. Comprime mejor que WebP pero su codificación es varias veces más cara en CPU, y ese es el recurso escaso de la máquina.

#### Scenario: Navegador que anuncia soporte de AVIF
- **WHEN** un navegador envía `Accept` incluyendo `image/avif`
- **THEN** recibe WebP
