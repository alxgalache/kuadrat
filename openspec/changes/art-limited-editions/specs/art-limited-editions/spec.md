## ADDED Requirements

### Requirement: Esquema de ediciones limitadas en `art`
La tabla `art` SHALL incluir dos columnas nuevas definidas idempotentemente en `api/config/database.js` (CREATE TABLE actualizado + `safeAlter` para bases existentes, sin migraciones sueltas):

- `edition_size INTEGER NOT NULL DEFAULT 1` — tamaño de la tirada de la obra.
- `editions_sold INTEGER NOT NULL DEFAULT 0` — ejemplares reservados o vendidos.

`is_sold` SHALL pasar a significar "edición agotada" y SHALL mantenerse siempre en la misma sentencia SQL que modifica `editions_sold` (nunca por separado): vale `1` si y solo si `editions_sold >= edition_size`. Con `edition_size = 1` la semántica es idéntica a la actual, por lo que ningún lector existente de `is_sold` (filtro de galería, elegibilidad de subastas, badge de vendida, dashboard del seller) requiere cambios.

La inicialización SHALL incluir un backfill idempotente para bases existentes: `UPDATE art SET editions_sold = 1 WHERE is_sold = 1 AND editions_sold = 0`.

#### Scenario: Esquema idempotente con backfill
- **WHEN** `initializeDatabase()` se ejecuta sobre una base existente con obras `is_sold = 1`
- **THEN** las columnas `edition_size` y `editions_sold` existen con sus defaults
- **AND** toda obra con `is_sold = 1` queda con `editions_sold = 1`
- **AND** un segundo arranque no produce errores ni cambios adicionales

#### Scenario: Obra única conserva el comportamiento actual
- **WHEN** una obra tiene `edition_size = 1` y se vende su único ejemplar
- **THEN** `editions_sold = 1` e `is_sold = 1` en la misma operación
- **AND** la obra desaparece del listado de galería exactamente como hoy

#### Scenario: Edición con ejemplares restantes sigue visible
- **WHEN** una obra tiene `edition_size = 15` y `editions_sold = 6`
- **THEN** `is_sold = 0` y la obra sigue apareciendo en el listado público de galería

### Requirement: El seller fija la tirada al publicar, de forma inmutable
El endpoint de creación `POST /api/art` SHALL aceptar un campo opcional `edition_size` (entero, mínimo 1, máximo 1000, default 1), validado vía Zod en `api/validators/productSchemas.js`. El formulario de publicación del seller (`ProductForm.js` en `/seller/publish`) SHALL incluir el campo "Nº de ejemplares de la edición" con valor por defecto 1. Una vez creada la obra, `edition_size` SHALL ser inmutable: ningún endpoint de edición lo modifica.

#### Scenario: Publicación de una obra con tirada
- **WHEN** un seller publica una obra con `edition_size = 15`
- **THEN** la fila se crea con `edition_size = 15` y `editions_sold = 0`

#### Scenario: Publicación sin indicar tirada
- **WHEN** un seller publica una obra sin el campo `edition_size`
- **THEN** la fila se crea con `edition_size = 1` (obra única)

#### Scenario: Valor de tirada inválido
- **WHEN** un seller envía `edition_size = 0`, negativo o no entero
- **THEN** la validación Zod rechaza la petición con error 400 y mensaje es-ES

### Requirement: Ficha pública muestra la edición sin revelar el remanente
La respuesta pública de `artController` SHALL incluir `edition_size`. La ficha de producto (`galeria/p/[id]`) SHALL mostrar el texto "Edición limitada de N ejemplares" (texto es-ES centralizado en `client/lib/constants.js`) cuando `edition_size > 1`, y SHALL NO mostrar el número de ejemplares restantes ni `editions_sold`. Para obras con `edition_size = 1` la ficha no cambia.

#### Scenario: Ficha de obra con edición
- **WHEN** un visitante abre la ficha de una obra con `edition_size = 15`
- **THEN** la página muestra "Edición limitada de 15 ejemplares"
- **AND** no muestra cuántos ejemplares quedan disponibles

#### Scenario: Ficha de obra única
- **WHEN** un visitante abre la ficha de una obra con `edition_size = 1`
- **THEN** la página no muestra ningún texto de edición

### Requirement: Disponibilidad restante en el dashboard del seller
El listado de productos del seller (`sellerRoutes.js`) SHALL calcular el stock de arte como `edition_size - editions_sold` (en lugar del actual `is_sold ? 0 : 1`).

#### Scenario: Seller ve el remanente de su edición
- **WHEN** una seller consulta sus productos y una obra tiene `edition_size = 15` y `editions_sold = 6`
- **THEN** la respuesta refleja `total_stock = 9`

### Requirement: Recompra de ejemplares por el mismo comprador
El sistema SHALL permitir que un mismo usuario compre ejemplares distintos de la misma obra en pedidos sucesivos (sin bloqueo por historial). El carrito SHALL seguir impidiendo añadir dos veces la misma obra dentro del mismo carrito (id de item `art_<id>`), y el checkout SHALL seguir rechazando ids de arte duplicados en una misma petición.

#### Scenario: Compra de un segundo ejemplar en un pedido posterior
- **WHEN** un usuario que ya compró un ejemplar de una edición añade la misma obra al carrito en una sesión posterior y completa el pago
- **THEN** el pedido se crea con normalidad y consume un segundo ejemplar

#### Scenario: La misma obra no puede duplicarse en un carrito
- **WHEN** un usuario intenta añadir al carrito una obra que ya tiene en él
- **THEN** el carrito no añade una segunda línea para esa obra
