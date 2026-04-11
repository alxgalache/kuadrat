# Informe fiscal para la gestoría — 140d Galería de Arte

> Documento de entrega técnica de la plataforma **140d Galería de Arte** a la gestoría. Describe el modelo fiscal, el formato de los informes de payout exportables desde el panel admin, y cómo importarlos al ERP.
>
> Interlocutor técnico por parte de 140d: `info@140d.art`.
>
> Estado: entregado con el Change #4 (`stripe-connect-fiscal-report`) del roadmap Stripe Connect. Ver el changelog en `docs/stripe_connect/master_plan.md` §13 para el contexto histórico.

---

## 1. Qué es 140d Galería de Arte

| Dato | Valor |
|---|---|
| Nombre comercial | **140d Galería de Arte** |
| Razón social legal | *(valor en `BUSINESS_LEGAL_NAME` del entorno — pendiente de confirmar antes del primer export)* |
| CIF/NIF | *(valor en `BUSINESS_TAX_ID`)* |
| Dirección fiscal | *(valores en `BUSINESS_ADDRESS_LINE1/2/CITY/POSTAL_CODE/PROVINCE/COUNTRY`)* |
| Email fiscal | `info@140d.art` |
| Actividad | Galería de arte en línea. Intermediación en venta de obras originales (pintura, dibujo, escultura, fotografía), productos relacionados con artistas (merchandising, catálogos, ediciones) y eventos en directo (streaming y presencial). |
| Plataforma técnica | Aplicación propia (backend Node.js + frontend Next.js), integración de cobro con Stripe (Stripe Checkout + Stripe Connect para los pagos a artistas). |

> Estos valores se cargan automáticamente en los informes de export desde las variables de entorno del servidor; no se guardan duplicados en la base de datos. Si alguno cambia, se edita el entorno y los informes futuros se actualizan solos.

---

## 2. Modelo de Merchant of Record (MoR)

140d actúa como **Merchant of Record** para todas las ventas realizadas a través de la plataforma:

- El comprador paga a 140d (vía Stripe). La factura emitida al comprador final lleva los datos fiscales de 140d.
- El artista **no emite factura al comprador**. El artista recibe del marketplace el **importe neto de la venta menos la comisión** pactada.
- 140d retiene una comisión sobre cada venta. Es **sobre esta comisión** donde se articula el régimen fiscal declarable por la gestoría (REBU 10 % o IVA estándar 21 %, ver §3).
- El artista, en la parte fiscal que le corresponde, o bien emite factura a 140d por el importe de la comisión (si es autónomo/sociedad), o bien acepta la autofacturación emitida por 140d (si es particular con acuerdo firmado). Ver §5.

La consecuencia operativa es que la gestoría ve dos tipos de ingreso:

1. **Ingresos por ventas al cliente final** (lo cobrado a los compradores), con el IVA repercutido al 10 % (arte) o 21 % (otros productos/eventos).
2. **Ingresos por comisiones retenidas** a los artistas, que es el **dato clave del informe de payout** descrito en este documento. Estas comisiones son el margen real del marketplace.

Los gastos directos de la operación (transporte — ver §6, comisiones de Stripe, etc.) son gastos de 140d y la gestoría los documenta con las facturas habituales recibidas de los proveedores (Sendcloud, Stripe, etc.). Esos gastos **no aparecen en el informe de payout**; este documento se centra exclusivamente en la relación 140d ↔ artista.

---

## 3. Los tres regímenes fiscales aplicables

Cada venta en la plataforma se asigna a **uno y sólo uno** de los tres regímenes. El régimen depende del tipo de item vendido:

### 3.1 Arte — REBU (Régimen Especial de Bienes Usados), art. 135 y ss. Ley 37/1992

- **Tipo de item**: cuadros, dibujos, esculturas, fotografías, originales de artistas. En la plataforma son los items con `item_type = 'art_order_item'`.
- **Base imponible**: el **margen del marketplace** — es decir, la comisión retenida por 140d.
- **Tipo de IVA**: **10 % sobre el margen** (no sobre el precio total de la obra).
- **Cómo se calcula en el informe**:
  - `seller_earning   = price - commission`  (lo que cobra el artista, ya neto)
  - `taxable_base     = commission / 1,10`   (base imponible del margen)
  - `vat_amount       = commission - taxable_base`  (IVA al 10 % incluido en la comisión)
  - `vat_rate         = 10 %`
- **Ejemplo numérico** (obra vendida a 1 000 €, comisión del marketplace 30 %):
  | Concepto | Cálculo | Importe |
  |---|---|---|
  | Precio pagado por el comprador | — | **1 000,00 €** |
  | Comisión retenida por 140d (30 %) | `1000 × 0,30` | **300,00 €** |
  | Ganancia neta del artista | `1000 - 300` | **700,00 €** |
  | Base imponible (margen) | `300 / 1,10` | **272,73 €** |
  | IVA al 10 % (incluido en la comisión) | `300 - 272,73` | **27,27 €** |

  Este payout contribuye a los ingresos declarables por 140d con `272,73 €` de base imponible y `27,27 €` de IVA repercutido (régimen REBU).

### 3.2 Otros productos — IVA estándar 21 %

- **Tipo de item**: merchandising, catálogos, ediciones, productos auxiliares. Items con `item_type = 'other_order_item'`.
- **Tipo de IVA**: **21 % sobre la comisión**, extraído de forma idéntica al régimen REBU pero con tipo distinto.
- **Cómo se calcula**:
  - `seller_earning   = price - commission`
  - `taxable_base     = commission / 1,21`
  - `vat_amount       = commission - taxable_base`
  - `vat_rate         = 21 %`
- **Ejemplo numérico** (producto de 100 € con comisión del 20 %):
  | Concepto | Cálculo | Importe |
  |---|---|---|
  | Precio pagado por el comprador | — | **100,00 €** |
  | Comisión retenida por 140d (20 %) | `100 × 0,20` | **20,00 €** |
  | Ganancia neta del artista | `100 - 20` | **80,00 €** |
  | Base imponible | `20 / 1,21` | **16,53 €** |
  | IVA al 21 % (incluido en la comisión) | `20 - 16,53` | **3,47 €** |

### 3.3 Eventos en directo — IVA estándar 21 %

- **Tipo de item**: entradas a eventos con acceso de pago (`events.access_type = 'paid'`). Items con `item_type = 'event_attendee'`.
- **Tipo de IVA**: **21 % sobre la comisión del evento**, idéntico al régimen 3.2.
- La base imponible y el IVA se calculan exactamente igual: `commission / 1,21` y `commission - taxable_base`.
- Los eventos se acreditan al monedero del artista anfitrión **automáticamente** 24 h después de la finalización del evento (ver §4), no en el mismo instante del pago. Esto permite que la gestoría los agrupe por fecha de acreditación coherente con la realización efectiva del servicio.

> **Importante**: un mismo payout nunca mezcla regímenes. Cada payout es, por diseño, o bien **REBU** o bien **IVA estándar 21 %**. En el informe, el régimen del payout está en el campo `Régimen` / `vat_regime`.

---

## 4. Flujo de cobro y pago

1. **Cobro via Stripe**. El comprador paga el importe total (producto + transporte + IVA al tipo aplicable al item) a la cuenta de Stripe de 140d. El dinero queda en el *platform balance* de 140d.
2. **Acreditación al monedero del artista**. Un proceso programado (`confirmationScheduler`) recorre las órdenes:
   - **Items físicos (arte + otros productos)**: tras **14 días** desde la entrega (plazo de verificación de que el comprador no ha disputado la compra) la comisión correspondiente se calcula con los helpers del §3 y el saldo neto del artista se acredita a uno de sus dos buckets:
     - **Bucket REBU** (`available_withdrawal_art_rebu`) para items `art_order_item`.
     - **Bucket IVA estándar** (`available_withdrawal_standard_vat`) para items `other_order_item`.
   - **Eventos en directo**: tras **1 día** desde el `finished_at` del evento, el scheduler `eventCreditScheduler` calcula la comisión al 21 % y acredita al **bucket IVA estándar** del artista anfitrión. El periodo de gracia (configurable via `EVENT_CREDIT_GRACE_DAYS`) existe por si el admin necesita excluir manualmente el evento (p. ej. disputa, cancelación a posteriori).
3. **Payout manual vía Stripe Transfers**. Un administrador de 140d revisa cada trimestre los artistas con saldo pendiente y ejecuta un payout **por bucket y artista** desde el panel `/admin/payouts`. Cada payout se traduce en una operación `Stripe Transfers` a la cuenta conectada del artista (Stripe Connect, V1 Transfers API). El identificador Stripe del transfer (`stripe_transfer_id`, formato `tr_...`) queda asociado al registro del payout y aparece en el informe.
4. **Decisión arquitectónica clave — un payout = un régimen**. Nunca se envía un único payout que mezcle REBU y 21 %. El panel admin obliga al admin a ejecutar dos payouts separados si el artista tiene saldo en ambos buckets. Esto simplifica radicalmente la trazabilidad fiscal: cada `withdrawal_id` del informe tiene un único `vat_regime` asociado.

---

## 5. Autofacturación (art. 5 Reglamento de Facturación)

140d aplica **autofacturación** (art. 5 del Real Decreto 1619/2012, Reglamento de Facturación) sólo en el caso específico de artistas **particulares** (no profesionales) con acuerdo de autofacturación firmado. El comportamiento es el siguiente:

| Estado fiscal del artista (`tax_status`) | Acuerdo autofactura firmado (`autofactura_agreement_signed_at`) | Modo aplicable | Significado |
|---|---|---|---|
| `particular` | NOT NULL | **`autofactura`** | 140d emite autofactura por la comisión retenida en nombre del artista. El artista particular no tiene que emitir factura. |
| `particular` | NULL | **`pending_agreement`** | Artista particular sin acuerdo firmado. **Debe firmarse antes de declarar el trimestre** o el payout quedará en estado fiscalmente pendiente. |
| `autonomo` | — (no aplica) | **`factura_recibida`** | El artista autónomo emite su propia factura a 140d por el importe de la comisión. 140d recibe y contabiliza esa factura. |
| `sociedad` | — (no aplica) | **`factura_recibida`** | La sociedad artística emite factura a 140d por el importe de la comisión. |

> Esta inferencia es **automática** en el informe: aparece en el campo `Modo facturación` / `invoicing.mode` con una explicación en español adjunta en `invoicing.explanation`. Si la gestoría ve `pending_agreement`, significa que hay que regularizar con el artista antes de poder emitir ninguna factura por esa comisión.
>
> En condiciones normales — es decir, con el onboarding del artista completado por admin y los datos fiscales rellenos — no deberían aparecer registros en `pending_agreement` en el informe. Si aparecen, es una alerta operativa.

El **quinto caso** (artista sin `tax_status` registrado) es técnicamente imposible si el alta del artista se completó correctamente; si aun así ocurriera, el endpoint de export devolvería un error 500 con el mensaje `"Datos fiscales incompletos para el artista"`.

---

## 6. IVA del transporte

Para items físicos (arte y otros productos), 140d gestiona **directamente** el envío al comprador a través del proveedor de transporte (Sendcloud / carrier partners). El tratamiento fiscal del transporte es:

- **No es un suplido.** Las facturas del transportista se emiten a nombre de 140d, no del artista. Por tanto 140d soporta el IVA del transportista como gasto propio y repercute el transporte al comprador en la factura emitida al comprador final.
- **Tipo de IVA aplicado al transporte**: **21 %** en ambos lados (factura recibida del transportista + línea de transporte en la factura emitida al comprador).
- **El transporte no entra en el cálculo de la comisión del artista.** La comisión se calcula sólo sobre el precio del item, no sobre el importe del transporte. El artista cobra siempre `price - commission`, independientemente del transporte.
- **En el informe de payout, el transporte no aparece como línea.** Sólo las comisiones retenidas sobre items vendidos. El transporte se contabiliza por el circuito normal de facturas de proveedores/clientes fuera del informe del payout.

Esta decisión (decisión #18 del master plan) se tomó explícitamente para **no** aplicar el régimen de suplidos (art. 78.Tres.3º LIVA) porque las facturas del transportista no están a nombre del artista y además los suplidos exigen presentar la factura original al comprador, cosa que 140d no hace.

---

## 7. IRPF

El modelo de datos de 140d tiene un campo `irpf_retention_rate` por artista — pensado para reflejar el tipo de IRPF a aplicar en su caso — **pero en la versión actual (v1) ese campo NO se resta del importe del payout**. Decisión explícita tomada con la gestoría (decisión #13 del master plan):

- **El payout transfiere al artista el saldo íntegro del bucket**, sin retención IRPF.
- El campo `irpf_retention_rate` aparece en el informe como **metadato informativo**: la gestoría puede leerlo y aplicar manualmente la retención que corresponda en el trimestre si el artista es autónomo o sociedad con obligación de retención.
- Si en el futuro se decide automatizar la retención (v2), el master plan §8 decisión #13 marca este punto como a reabrir. De momento, **la gestoría es responsable de verificar si procede retención y aplicarla en la autofactura o factura recibida**.

Columnas relevantes en el informe:

- `seller.irpf_retention_rate` — el tipo informado (puede ser `null`, `0`, `0.15`, etc.). Se expresa como fracción decimal.
- El informe **no** incluye un campo `irpf_retained` porque ningún importe se ha retenido fiscalmente en la fuente.

---

## 8. Cómo leer el informe (CSV y JSON)

Hay **dos tipos de export**, ambos accesibles desde el panel admin (`/admin/payouts`):

- **Export individual**: un único payout. Botones "CSV" / "JSON" en el histórico de cada artista. Nombre de archivo: `payout_<withdrawal_id>_<YYYYMMDD>.csv|json`.
- **Export agregado**: todos los payouts en un rango de fechas (máximo **366 días** para evitar queries abusivas). Barra superior del listado de payouts, con filtros `Desde`/`Hasta`/`Régimen`. Nombre de archivo: `payouts_<from>_<to>.csv|json`.

Ambos tipos respetan las convenciones del formato español para máxima compatibilidad con Excel en ordenadores con idioma ES:

- **Codificación**: UTF-8 con BOM inicial (`\uFEFF`). Excel lo reconoce automáticamente.
- **Separador de columnas**: `;` (punto y coma).
- **Separador decimal**: `,` (coma). Sin separador de miles.
- **Formato de fecha**: `DD/MM/YYYY` (zona horaria **Europe/Madrid**).
- **Formato de hora**: `DD/MM/YYYY HH:MM` (sólo cuando aplica — p. ej. metadatos del export).

Los informes filtran los payouts por `status IN ('completed', 'reversed')`. Los payouts en estado `failed`, `pending`, `processing` o `cancelled` **no aparecen** en los informes porque fiscalmente no existen como hechos imponibles (ver §9).

### 8.1 CSV individual — estructura

El CSV de un payout único sigue un patrón típico de informe Excel: primero un bloque de metadatos clave-valor, luego una fila vacía, luego la tabla de líneas del payout con sus totales.

```csv
Informe de payout;;;;;;;;
Generado el;15/04/2026 10:00;;;;;;;
Generado por;admin@140d.art;;;;;;;
;;;;;;;;
ID del payout;1234;;;;;;;
Estado;completado;;;;;;;
Régimen fiscal;REBU (Arte);;;;;;;
Tipo de operación;REBU;;;;;;;
Stripe transfer ID;tr_1PxyzABC;;;;;;;
Stripe transfer group;WITHDRAWAL_1234;;;;;;;
Fecha de ejecución;10/04/2026 11:15;;;;;;;
Ejecutado por;admin@140d.art;;;;;;;
;;;;;;;;
Plataforma;140d Galería de Arte;;;;;;;
Razón social;140D ARTE SL;;;;;;;
CIF;B12345678;;;;;;;
Dirección;Calle Mayor 1, 28001 Madrid, Madrid (ES);;;;;;;
Email fiscal;info@140d.art;;;;;;;
;;;;;;;;
Artista;Juan Pérez García;;;;;;;
Estado fiscal;particular;;;;;;;
NIF/NIE/CIF;12345678Z;;;;;;;
Dirección;Calle del Arte 7, 08001 Barcelona, Barcelona (ES);;;;;;;
IRPF (tipo informado);0%;;;;;;;
Acuerdo autofacturación;Firmado el 01/02/2026;;;;;;;
Modo de facturación;Autofactura;;;;;;;
Explicación;140d emite autofactura por la comisión en nombre del artista (art. 5 Reglamento de Facturación).;;;;;;;
Stripe Connect ID;acct_1PxxxABC;;;;;;;
;;;;;;;;
Tipo;Referencia;Descripción;Comprador;Ganancia artista;Base imponible;% IVA;IVA;Total línea
Arte;art_order_item:789;Cuadro «Sin título» — acuarela sobre papel;order:456/art_order_item:789;700,00;272,73;10%;27,27;300,00
Arte;art_order_item:790;Dibujo «Retrato» — tinta china sobre papel;order:457/art_order_item:790;350,00;136,36;10%;13,64;150,00
;;;;;;;;
Totales;;;;1050,00;409,09;;40,91;450,00
Importe transferido (EUR);;;;1050,00;;;;
Importe revertido (EUR);;;;0,00;;;;
Neto tras reversiones (EUR);;;;1050,00;;;;
```

Puntos a destacar:

- El bloque "Totales" al final suma **sólo las columnas del detalle de líneas**. Representa la suma de bases imponibles, IVA e importes totales de las líneas — pero **la cifra que 140d ha transferido efectivamente al artista** es `Importe transferido` (= suma de `Ganancia artista`).
- Las dos filas `Importe revertido` y `Neto tras reversiones` son siempre visibles. Si el payout está completo y sin reversiones, el revertido es `0,00` y el neto coincide con el transferido.
- La columna `Comprador` enlaza la línea con la orden original (o el attendee, en eventos). Ver §10.
- La columna `% IVA` muestra el tipo aplicado como porcentaje legible (10 % o 21 %).

### 8.2 CSV agregado — estructura

El CSV de rango es una tabla "long" (una fila por cada línea de payout), con las columnas del withdrawal padre repetidas en cada fila. Está pensado para tirar una tabla dinámica de Excel que agrupe por régimen, mes o artista.

```csv
Withdrawal ID;Fecha;Estado;Régimen;Modo facturación;Stripe transfer ID;Artista;NIF artista;Tipo item;Referencia;Descripción;Ganancia artista;Base imponible;% IVA;IVA;Total línea
1234;10/04/2026;completado;REBU (Arte);Autofactura;tr_1PxyzABC;Juan Pérez García;12345678Z;Arte;art_order_item:789;Cuadro «Sin título»;700,00;272,73;10%;27,27;300,00
1234;10/04/2026;completado;REBU (Arte);Autofactura;tr_1PxyzABC;Juan Pérez García;12345678Z;Arte;art_order_item:790;Dibujo «Retrato»;350,00;136,36;10%;13,64;150,00
1235;11/04/2026;completado;IVA estándar 21%;Factura recibida;tr_1PxyzDEF;Ana Gómez López;87654321X;Evento;event_attendee:550e8400-e29b-41d4-a716-446655440000;Entrada: Masterclass acuarela;21,00;6,61;21%;1,39;8,00
1235;11/04/2026;completado;IVA estándar 21%;Factura recibida;tr_1PxyzDEF;Ana Gómez López;87654321X;Evento;event_attendee:6ba7b810-9dad-11d1-80b4-00c04fd430c8;Entrada: Masterclass acuarela;21,00;6,61;21%;1,39;8,00
1236;12/04/2026;completado;IVA estándar 21%;Factura recibida;tr_1PxyzGHI;Marta Ruiz Soler;11223344A;Otro;other_order_item:321;Catálogo «Exposición 2026»;16,00;3,31;21%;0,69;4,00
```

Con una tabla dinámica simple (pivot table de Excel) sobre `Base imponible`, `IVA` e `Importe transferido` agrupando por `Régimen` y `Fecha`, se obtiene directamente lo que necesita el modelo 303.

El CSV agregado **no** incluye fila de totales finales: la gestoría las calcula con el pivot. Esto es deliberado — evita ambigüedad si se aplican filtros parciales sobre el archivo.

### 8.3 JSON agregado — estructura

El export en formato JSON (`format=json`) devuelve un único objeto con esta forma:

```jsonc
{
  "platform": {
    "name": "140d Galería de Arte",
    "legal_name": "...",
    "tax_id": "...",
    "address": { "line1": "...", "line2": null, "city": "...", "postal_code": "...", "province": "...", "country": "ES" },
    "email": "info@140d.art"
  },
  "range":   { "from": "2026-01-01", "to": "2026-03-31" },
  "filters": { "vat_regime": null, "seller_id": null },
  "totals_by_regime": {
    "art_rebu":     { "count": 12, "taxable_base_total": 1200.00, "vat_amount_total": 120.00, "seller_earning_total": 8400.00 },
    "standard_vat": { "count":  5, "taxable_base_total":  500.00, "vat_amount_total": 105.00, "seller_earning_total": 1500.00 }
  },
  "totals_by_month": {
    "2026-01": { "count": 4, "taxable_base_total": 400.00, "vat_amount_total":  40.00, "seller_earning_total": 2800.00 },
    "2026-02": { "count": 6, "taxable_base_total": 620.00, "vat_amount_total":  95.00, "seller_earning_total": 4100.00 },
    "2026-03": { "count": 7, "taxable_base_total": 680.00, "vat_amount_total":  90.00, "seller_earning_total": 3000.00 }
  },
  "payouts": [
    { /* PayoutReport completo — idéntico al export individual */ },
    { /* ... */ }
  ],
  "generated_at": "2026-04-15T10:00:00Z",
  "generated_by_admin_email": "admin@140d.art"
}
```

El JSON agregado **embebe** objetos `PayoutReport` completos dentro de `payouts[]`, por lo que el ERP de la gestoría puede iterar sobre ellos y acceder a cada línea con todos sus datos fiscales. Los bloques `totals_by_regime` y `totals_by_month` son atajos para cuadre rápido.

### 8.4 Endpoint de resumen (`/summary`)

Desde el panel admin hay un botón "Resumen" que llama a `GET /api/admin/payouts/summary` con el mismo rango y filtros que el export agregado. Devuelve únicamente los bloques `totals_by_regime`, `totals_by_month` y el contador de payouts — sin la lista completa. Sirve como verificación rápida antes de descargar el CSV o JSON.

### 8.5 Cómo importar el CSV al ERP

Cada ERP tiene su propio formato de importación, pero todos los ERP españoles aceptan CSV UTF-8 con `;` como separador. Los pasos genéricos son:

1. Abrir el CSV con Excel (doble click — el BOM hace que Excel reconozca UTF-8 automáticamente).
2. Verificar que las columnas, los acentos, los decimales y las fechas están correctos. Si Excel muestra el contenido pegado en una sola columna, revisar que el separador del sistema sea `;` o usar "Datos > Texto en columnas" con separador `;` explícito.
3. Si el ERP requiere un formato específico, usar el CSV como origen de una hoja intermedia con fórmulas que mapean columnas al formato del ERP (p. ej. `Número de factura = CONCATENAR("AF-"; A2)` si se autonumeran las autofacturas).
4. Para el régimen REBU, el ERP debe aceptar el tipo de IVA al **10 %** sobre el margen como operación diferenciada. En el modelo 303, las casillas habituales son las del régimen especial de bienes usados.
5. Para el régimen estándar, el tipo de IVA es el **21 %** habitual.

---

## 9. Casos de borde

| Escenario | Aparece en el export | Cómo se refleja | Qué debe hacer la gestoría |
|---|---|---|---|
| Payout `completed` | Sí | Todas las filas visibles, `reversal_amount = 0`. | Contabilizar normal. |
| Payout `reversed` (parcial o total) | Sí | Bloque `Importe revertido` y `Neto tras reversiones` reflejan la reversión. La fila del payout existe porque el transfer Stripe **ocurrió** — la reversión es un hecho posterior. | Ajustar el trimestre: restar el `reversal_amount` de la base imponible ya declarada (si ya se había declarado) o bajar la operación si aún estamos en el mismo trimestre. |
| Payout `failed` | **NO** | El export excluye los payouts fallidos porque fiscalmente no ocurrió nada (el transfer nunca se realizó). | Nada que hacer. Si un admin solicita el export individual de un payout fallido, recibe un 404 con el mensaje `"El payout falló y no tiene información fiscal"`. |
| Payout `pending` / `processing` | **NO** | Mismo tratamiento: aún no ha ocurrido el hecho imponible. El export individual devuelve 409 con `"El payout aún no ha sido ejecutado"`. | Esperar a que el admin lo ejecute. |
| Reembolso al comprador **antes** del payout | No aparece en el informe de payout | El importe se descuenta del monedero del artista **antes** de que llegue al payout. Fuera del scope del informe de payout. | Si el reembolso afecta una venta ya declarada, ajustar con una factura rectificativa en el trimestre siguiente. |
| Reembolso al comprador **después** del payout | No se refleja automáticamente | El admin debe compensarlo manualmente (descontando del siguiente payout del mismo artista o aplicando una reversión de transfer). | Revisar comunicación operativa con 140d cada trimestre para detectar estos casos y ajustar con factura rectificativa. |
| Evento cancelado tras acreditación | No revierte automáticamente | El admin debe marcar el evento como excluido y compensar manualmente con una reversión de transfer del siguiente payout. | Documentar como factura rectificativa. |
| Evento sin asistentes pagados | No genera línea en el informe | No hay comisión que declarar. | Sin acción. |
| Reversión completa de transfer | Sí — aparece con `net_of_reversals = 0` | La fila existe para trazabilidad Stripe, pero fiscalmente no hay importe a declarar. | Verificar que no se declaró el trimestre anterior; si ya se hizo, emitir rectificativa. |
| Cambio de datos fiscales del artista (NIF, dirección) tras el payout | El informe usa **snapshot actual**, no versionado | Si el admin descarga el export después del cambio, verá los datos nuevos. | Si hace falta guardar los datos "del momento del pago", descargar el CSV inmediatamente tras ejecutar el payout y archivarlo en disco. El informe individual incluye `Generado el` para trazabilidad del momento del export. |

---

## 10. Trazabilidad (back-reference)

Cada línea del informe incluye una columna `Referencia` (o `buyer_reference` en el JSON) que permite remontar del informe a la operación original en la base de datos:

| `item_type` | Formato de la referencia | Significado |
|---|---|---|
| `art_order_item` | `order:<order_id>/art_order_item:<item_id>` | El item `<item_id>` pertenece a la orden `<order_id>`. |
| `other_order_item` | `order:<order_id>/other_order_item:<item_id>` | Ídem para productos no-arte. |
| `event_attendee` | `event:<event_uuid>/attendee:<attendee_uuid>` | El attendee `<attendee_uuid>` asistió al evento `<event_uuid>`. |

Si una línea muestra `"(Item no encontrado)"` en el campo `Descripción`, significa que el registro original fue borrado (caso extremadamente raro — 140d no borra órdenes, pero podría ocurrir si se purgara manualmente en BD). En ese caso, los importes siguen siendo correctos (están copiados en `withdrawal_items`) pero la gestoría debe pedir al admin una aclaración sobre la línea.

---

## 11. Glosario de campos

| Campo (CSV / JSON) | Significado |
|---|---|
| `Withdrawal ID` / `withdrawal.id` | Identificador interno del payout en 140d. No tiene significado fiscal por sí mismo pero sirve para referenciar un payout en cualquier comunicación. |
| `Estado` / `withdrawal.status` | `completado` (`completed`) — transfer Stripe ejecutado con éxito. `revertido` (`reversed`) — transfer Stripe ejecutado y posteriormente revertido parcial o totalmente. |
| `Régimen fiscal` / `withdrawal.vat_regime` | `REBU (Arte)` (`art_rebu`) o `IVA estándar 21%` (`standard_vat`). Un payout sólo puede tener uno. |
| `Tipo de operación` / `withdrawal.operation_type` | `REBU` o `IVA_estandar_21`. Alias humano del régimen. |
| `Stripe transfer ID` / `withdrawal.stripe_transfer_id` | `tr_...` — identificador del transfer en el dashboard de Stripe. Referencia externa oficial. |
| `Stripe transfer group` / `withdrawal.stripe_transfer_group` | Agrupador interno de Stripe (`WITHDRAWAL_<id>`). Útil para correlar los logs. |
| `Fecha de ejecución` / `withdrawal.executed_at` | Instante en que el admin ejecutó el payout (ISO 8601 en el JSON, `DD/MM/YYYY HH:MM` en el CSV, zona **Europe/Madrid**). |
| `Ejecutado por` / `withdrawal.executed_by_admin_email` | Email del admin que ejecutó el payout. Sirve de auditoría. |
| `Artista` / `seller.fiscal_full_name` | Nombre fiscal completo del artista tal y como está registrado en la BD. |
| `Estado fiscal` / `seller.tax_status` | `particular`, `autonomo` o `sociedad`. |
| `NIF/NIE/CIF` / `seller.tax_id` | Documento fiscal del artista. |
| `Dirección` / `seller.address` | Dirección fiscal del artista. |
| `IRPF (tipo informado)` / `seller.irpf_retention_rate` | Tipo de IRPF informado. **No se aplica al payout en v1** — ver §7. |
| `Acuerdo autofacturación` / `seller.autofactura_agreement_signed_at` | Fecha en que el artista firmó el acuerdo de autofacturación (o vacío si no aplica / no firmado). |
| `Modo de facturación` / `invoicing.mode` | `autofactura`, `factura_recibida` o `pending_agreement`. Ver §5. |
| `Explicación` / `invoicing.explanation` | Descripción en español del modo aplicable. |
| `Stripe Connect ID` / `seller.stripe_connect_account_id` | `acct_...` — identificador de la cuenta conectada del artista en Stripe. |
| `Tipo` / `line.item_type_label` | `Arte`, `Otro`, o `Evento`. |
| `Referencia` / `line.buyer_reference` | Traza al registro original en la BD. Ver §10. |
| `Descripción` / `line.description` | Título del producto o nombre del evento. |
| `Comprador` / — | Alias en el CSV individual de `Referencia` (se muestra como columna específica para facilitar lectura). En el JSON es el mismo `buyer_reference`. |
| `Ganancia artista` / `line.seller_earning` | `price - commission`. Lo que el artista cobra neto por esa línea. |
| `Base imponible` / `line.taxable_base` | `commission / (1 + vat_rate)`. Base imponible sobre la que se liquida el IVA. |
| `% IVA` / `line.vat_rate` | `10%` (REBU) o `21%` (estándar). |
| `IVA` / `line.vat_amount` | `commission - taxable_base`. IVA incluido en la comisión. |
| `Total línea` / `line.line_total` | `taxable_base + vat_amount` = commission. Coincide con el importe de comisión retenida en esa línea. |
| `Importe transferido` / `totals.transferred_amount` | Suma de `seller_earning` de todas las líneas del payout. **Es la cifra real transferida** al Stripe Connect account del artista. |
| `Importe revertido` / `totals.reversal_amount_total` | `withdrawal.reversal_amount` (0 si el payout no está revertido). |
| `Neto tras reversiones` / `totals.net_of_reversals` | `transferred - revertido`. Si el payout está `completed`, coincide con `transferred`. |
| `Divisa` / `totals.currency` | Siempre `EUR` en v1. |

---

## Contacto

Cualquier duda sobre este documento, los formatos de export o el flujo operativo: **`info@140d.art`**. Cambios de los datos fiscales del platform (`BUSINESS_LEGAL_NAME`, `BUSINESS_TAX_ID`, `BUSINESS_ADDRESS_*`) se notifican por email y se aplican al entorno de producción; los exports posteriores reflejan automáticamente el nuevo valor.
