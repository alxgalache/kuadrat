## Context

La página `/seller/pedidos` muestra actualmente items de pedidos como tarjetas individuales. El endpoint `GET /api/seller/orders` ejecuta dos queries paralelas (art_order_items + other_order_items), las combina en un array plano ordenado por `status_modified DESC`, y pagina por items.

El backend ya integra Sendcloud para crear shipments (`sendcloudProvider.createShipments`), descargar etiquetas (`getLabelPdf`, `getLabelUrl`), y recibir webhooks de estado. La config de cada seller está en `user_sendcloud_configuration` (dirección de envío, first_mile, carriers preferidos, etc.), gestionada exclusivamente vía rutas admin.

El `carrier_code` no se almacena actualmente en los order items (solo `sendcloud_shipping_option_code`), y no existe infraestructura para pickups.

## Goals / Non-Goals

**Goals:**
- Reestructurar la respuesta del endpoint para agrupar por `order_id` con paginación por pedidos
- Proporcionar layout consistente (`max-w-7xl`) y UX mejorada con tarjetas de pedido
- Permitir a sellers con `first_mile='pickup'` o vacío/null programar recogidas vía Sendcloud
- Persistir pickups y carrier codes para trazabilidad
- Informar a todos los sellers sobre la opción de pickup vía email

**Non-Goals:**
- Cancelación automática de pedidos tras 7 días sin pickup
- Soporte de campos carrier-specific en el payload de pickup
- Imágenes independientes por variante de producto
- Gestión de estados mixtos dentro de un mismo pedido (items con distintos status)
- Modificación de otros emails además de `sendSellerNewOrderEmail`

## Decisions

### 1. Agrupación en backend (no frontend)

La agrupación por `order_id` se realiza en el backend antes de devolver la respuesta. El frontend recibe pedidos ya estructurados.

**Alternativa descartada:** Agrupar en frontend. Requeriría recibir todos los items sin paginar (o paginar items y agrupar parcialmente), complicando la lógica del cliente y haciendo la paginación inconsistente.

**Rationale:** La paginación debe ser por pedidos (no por items). Solo el backend puede hacerlo correctamente porque necesita contar pedidos distintos, no items.

**Estrategia SQL:** Las dos queries existentes (art + others) se mantienen pero incluyen `o.created_at` y info de variante (JOIN con `other_vars` para others). Tras combinar, se agrupan en JS por `order_id`, contando quantities por `(product_type, product_id, variant_id)`. Se ordena por `created_at DESC` y se pagina sobre los pedidos agrupados.

### 2. sellerConfig embebido en respuesta de orders

La config del seller (firstMile + dirección por defecto) se incluye como campo top-level en la respuesta de `GET /api/seller/orders`, evitando un API call adicional.

**Alternativa descartada:** Endpoint separado `GET /api/seller/sendcloud-config`. Requiere una segunda petición y coordinación en el frontend.

**Estructura de respuesta:**
```json
{
  "data": {
    "orders": [
      {
        "orderId": 1023,
        "createdAt": "2026-03-25T17:47:00Z",
        "status": "paid",
        "deliveryAddress": { "line1", "city", "postalCode", "country" },
        "items": [
          {
            "productType": "art",
            "productId": 5,
            "productName": "Pintura A",
            "productBasename": "pintura-a",
            "variantName": null,
            "quantity": 1,
            "sendcloudShipmentId": "...",
            "sendcloudTrackingUrl": "...",
            "sendcloudCarrierCode": "correos"
          }
        ],
        "pickup": { "id": 294, "status": "ANNOUNCING", "createdAt": "..." }
      }
    ],
    "pagination": { "page", "limit", "total", "totalPages" },
    "sellerConfig": {
      "firstMile": "pickup",
      "defaultAddress": {
        "name": "...", "companyName": "...", "address1": "...",
        "address2": "...", "houseNumber": "...", "city": "...",
        "postalCode": "...", "country": "...", "phone": "...", "email": "..."
      }
    }
  }
}
```

### 3. Nueva columna sendcloud_carrier_code

Se añade `sendcloud_carrier_code TEXT` a `art_order_items` y `other_order_items` en el `CREATE TABLE` de database.js.

Se puebla durante `sendcloudProvider.createShipments`: el response de `POST /v3/shipments` incluye info del carrier en `shipment.carrier.code` o similar. Se extrae y retorna junto con `sendcloudShipmentId`. El `paymentsController.createSendcloudShipmentsForOrder` lo almacena en la columna.

**Alternativa descartada:** Consultar Sendcloud en el momento del pickup para obtener el carrier. Añade latencia y dependencia de API en el momento crítico de la acción del usuario.

### 4. Tabla sendcloud_pickups

```sql
CREATE TABLE IF NOT EXISTS sendcloud_pickups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  sendcloud_pickup_id TEXT,
  carrier_code TEXT NOT NULL,
  status TEXT DEFAULT 'ANNOUNCING',
  pickup_address TEXT,
  time_slot_start DATETIME NOT NULL,
  time_slot_end DATETIME NOT NULL,
  special_instructions TEXT,
  total_weight_kg REAL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (seller_id) REFERENCES users(id)
)
```

`pickup_address` almacena la dirección completa como JSON string (no necesita queries por campos individuales). Los campos esenciales para queries (order_id, seller_id, carrier_code) son columnas propias.

Se incluye un LEFT JOIN en la query de seller orders para mostrar el pickup asociado a cada pedido.

### 5. Flujo del pickup

```
Frontend (modal)                    Backend                          Sendcloud
─────────────────                   ───────                          ─────────
POST /seller/orders/:orderId/pickup
  { address, timeSlots,             1. Validar seller owns items
    specialInstructions }           2. Obtener carrier_code de items
                                    3. Calcular peso total (sum weights)
                                    4. Obtener sellerConfig (para contract si necesario)
                                    5. POST /v3/pickups ──────────────────────────────►
                                    6. ◄──────────────── { id, status: ANNOUNCING }
                                    7. INSERT sendcloud_pickups
                                    8. UPDATE items SET status='sent'
  ◄── { success, pickup }          9. Devolver pickup creado
```

**Peso:** Suma de pesos de los productos del seller en el pedido. Los pesos están en las tablas `art` (campo `weight`) y `others` (campo `weight`), en gramos. Se convierten a kg para la API de Sendcloud.

**Items del pickup:** Un solo item con `quantity: 1`, `container_type: 'parcel'`, `total_weight: suma`.

### 6. Payload común para pickup

Se envía el payload mínimo común a todos los carriers:
```json
{
  "carrier_code": "correos",
  "address": { "name", "company_name", "country_code", "city", "address_line_1", "house_number", "address_line_2", "postal_code", "email", "phone_number" },
  "time_slots": [{ "start_at": "ISO8601", "end_at": "ISO8601" }],
  "items": [{ "quantity": 1, "container_type": "parcel", "total_weight": { "value": "2.50", "unit": "kg" } }],
  "special_instructions": "..."
}
```

Errores de validación de Sendcloud (campos carrier-specific faltantes) se propagan al frontend para que el seller los vea.

### 7. Cambio de estado a 'sent' al programar pickup

Tras crear el pickup exitosamente en Sendcloud, todos los order items del seller en ese pedido se actualizan a `status = 'sent'` y `status_modified = CURRENT_TIMESTAMP`. Esto mueve el pedido a la pestaña "Enviados" donde el botón de pickup no aparece.

El webhook de Sendcloud puede posteriormente enviar actualizaciones de tracking que confirmen el estado. El webhook handler ya previene transiciones backwards (no revierte 'sent' a 'paid').

### 8. Visibilidad del botón de pickup

El botón "Programar recogida" es visible cuando:
1. `sellerConfig.firstMile === 'pickup'` O `sellerConfig.firstMile` es null/vacío/undefined
2. El status del pedido es `'paid'` (no aparece en 'sent', 'arrived', 'confirmed')
3. No existe un pickup previo para ese pedido+seller (se verifica via el campo `pickup` en la respuesta)

## Risks / Trade-offs

**[Carrier-specific validation]** → Sendcloud puede rechazar el pickup si faltan campos específicos del carrier (ej: Correos requiere `volumetric_weight_kind`). **Mitigación:** Los errores de Sendcloud se muestran al seller en el modal. Se documentan y abordan caso por caso según los carriers que se usen en la práctica.

**[Carrier code no disponible en shipment response]** → Si la respuesta de `POST /v3/shipments` no incluye `carrier_code` directamente, será necesario extraerlo de otro campo o hacer una petición adicional. **Mitigación:** Verificar la estructura de respuesta real. Fallback: parsear del `shipping_option_code` o consultar el shipment status endpoint.

**[Paginación en memoria]** → La agrupación por order_id se realiza en JS tras obtener todos los items (no SQL-level pagination). Para sellers con muchos pedidos, esto puede ser lento. **Mitigación:** Aceptable para el volumen actual. Si escala, se puede optimizar con CTEs o subqueries en SQLite.

**[Peso 0 en productos]** → Algunos productos pueden no tener peso definido (campo `weight` null). **Mitigación:** Default a 1000g (1kg) como ya hace `createShipments`.
