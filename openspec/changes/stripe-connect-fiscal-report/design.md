# Design — stripe-connect-fiscal-report

> Lectura previa obligatoria: `docs/stripe_connect/master_plan.md` §6 (los tres regímenes), §7.4 (scope), §9 (datos fiscales del platform), decisiones #13 (IRPF), #18 (IVA transporte) y #19 (Option B sin PDFs). Los artefactos de Changes #1, #2 y #3 son prerrequisitos lógicos — sus datos son la única fuente de este change.

## 1. Decisiones clave

| # | Decisión | Justificación |
|---|---|---|
| 1 | **Sin PDFs en v1** — sólo CSV y JSON. | Decisión #19 master plan. Generar PDFs fiscales válidos (con numeración correlativa, firmas, Verifactu, etc.) tiene superficie regulatoria enorme. La gestoría ya tiene un ERP que lo hace bien; le damos los datos y punto. |
| 2 | **Sin almacenamiento del export** — se genera on-demand, no se persiste. | Evita una capa más de state management y una tabla adicional. El admin descarga cuando necesita; la reproducibilidad viene de que los datos fuente son inmutables una vez el withdrawal está `completed`. |
| 3 | **Snapshot "live" de los datos fiscales del artista**, no versionado. | Los datos fiscales cambian rara vez. Una capa de versionado añadiría una tabla `user_fiscal_history` y lógica compleja para cambios que ocurren ~0 veces al año. Si un artista cambia su NIF entre el payout y el export, la gestoría lo resuelve manualmente mirando el commit de cambio (o SQL directo). |
| 4 | **Datos del platform desde `config.business.*`**, no desde BD. | El platform nunca cambia; si cambiase, sería un cambio legal mayor que requeriría una migración de datos completa. Env vars es el sitio natural. |
| 5 | **CSV con formato "español"**: UTF-8 BOM, separador `;`, decimal `,`, fechas `DD/MM/YYYY`. | Compatibilidad directa con Excel en Windows con locale ES. La gestoría abre el archivo sin importar nada. |
| 6 | **CSV agregado en formato "long"** (una fila por item, con columnas del withdrawal padre repetidas). | Permite tirar tablas dinámicas directamente. Alternativa "wide" obligaría a pivotar; la gestoría no vive en SQL. |
| 7 | **Rango máximo 366 días** en el export agregado. | Protege de queries accidentales a toda la historia en un deployment con muchos payouts. Si la gestoría necesita más, lo pide. |
| 8 | **Filtra `status='completed'`** por defecto en el export (individual y agregado). | Los payouts `failed` no existen fiscalmente. Los `reversed` sí se incluyen (con `reversal_amount` visible) porque la transferencia original sí ocurrió. |
| 9 | **`inferInvoicingMode` como función pura**, no columna almacenada. | Se puede calcular desde `tax_status` + `autofactura_agreement_signed_at`. Guardarlo en BD sería duplicar estado. |
| 10 | **Endpoint de resumen opcional (`/summary`)** — retorna JSON sin export de filas. | El admin puede ver "cuánto hay para declarar este trimestre" sin generar un CSV. Barato de implementar porque usa las mismas queries agregadas. |
| 11 | **Bloqueo 503 si `BUSINESS_LEGAL_NAME` / `BUSINESS_TAX_ID` / `BUSINESS_ADDRESS_*` faltan.** | Un export sin estos datos no es útil para la gestoría (no puede emitir facturas). Mejor fallar ruidoso en el momento del export que entregar un CSV incompleto. |
| 12 | **Implementación del CSV manual**, sin dependencia externa. | Dos columnas de escape y un join con `;`. Añadir `papaparse` o similar sería over-engineering para 20 líneas de código. |
| 13 | **No se toca ningún controlador existente** del Change #2. | Los endpoints de export viven en su propio controller. Si la query de `withdrawal_items` necesita ampliarse, se hace desde el nuevo módulo; no se acopla al flujo de payout. |

## 2. Estructura del objeto canónico `PayoutReport`

```jsonc
{
  "platform": {
    "name": "140d Galería de Arte",
    "legal_name": "<BUSINESS_LEGAL_NAME>",
    "tax_id": "<BUSINESS_TAX_ID>",
    "address": { "line1": "...", "line2": null, "city": "...", "postal_code": "...", "province": "...", "country": "ES" },
    "email": "info@140d.art"
  },
  "seller": {
    "user_id": 42,
    "fiscal_full_name": "...",
    "tax_status": "particular" | "autonomo" | "sociedad",
    "tax_id": "...",
    "address": { "line1": "...", "line2": null, "city": "...", "postal_code": "...", "province": "...", "country": "ES" },
    "irpf_retention_rate": null,
    "autofactura_agreement_signed_at": "2026-02-01T12:34:56Z" | null,
    "stripe_connect_account_id": "acct_..."
  },
  "withdrawal": {
    "id": 1234,
    "status": "completed" | "reversed",
    "vat_regime": "art_rebu" | "standard_vat",
    "operation_type": "REBU" | "IVA_estandar_21",
    "stripe_transfer_id": "tr_...",
    "stripe_transfer_group": "WITHDRAWAL_1234",
    "executed_at": "2026-04-10T09:15:00Z",
    "executed_at_local": "10/04/2026",
    "executed_by_admin_email": "admin@140d.art",
    "reversed_at": null,
    "reversal_amount": null,
    "reversal_reason": null
  },
  "invoicing": {
    "mode": "autofactura" | "factura_recibida" | "pending_agreement",
    "explanation": "Human-readable reason in Spanish"
  },
  "lines": [
    {
      "item_type": "art_order_item" | "other_order_item" | "event_attendee",
      "item_id": 789,
      "description": "Cuadro «Sin título» — acuarela sobre papel",
      "buyer_reference": "order:456/item:789",
      "seller_earning": 210.00,
      "taxable_base": 81.82,
      "vat_rate": 0.10,
      "vat_amount": 8.18,
      "line_total": 90.00
    }
  ],
  "totals": {
    "seller_earning_total": 210.00,
    "taxable_base_total": 81.82,
    "vat_amount_total": 8.18,
    "transferred_amount": 210.00,
    "net_of_reversals": 210.00,
    "currency": "EUR"
  },
  "generated_at": "2026-04-15T10:00:00Z",
  "generated_by_admin_email": "admin@140d.art"
}
```

## 3. Mapeo CSV individual (payout único)

Cabeceras (fila 1) y una línea por cada `withdrawal_items` row. Las primeras filas son "metadatos" estilo clave-valor; luego una fila vacía; luego las cabeceras de detalle; luego las líneas. Es un patrón habitual para informes de gestoría en Excel.

```csv
# Metadatos (bloque superior)
Informe de payout;;;;
Generado el;15/04/2026 10:00;;;
ID del payout;1234;;;
Estado;completado;;;
Régimen fiscal;REBU (Arte);;;
Stripe transfer ID;tr_XXX;;;
Fecha de ejecución;10/04/2026;;;
Ejecutado por;admin@140d.art;;;
;;;;
Plataforma;140d Galería de Arte;;;
Razón social;<BUSINESS_LEGAL_NAME>;;;
CIF;<BUSINESS_TAX_ID>;;;
Dirección;Calle ... ;;;
;;;;
Artista;<fiscal_full_name>;;;
Estado fiscal;particular;;;
NIF/NIE/CIF;<tax_id>;;;
Dirección;<fiscal_address...>;;;
IRPF (tipo informado);0%;;;
Acuerdo autofacturación;Firmado el 01/02/2026;;;
Modo de facturación;Autofactura;;;
;;;;
# Detalle
Tipo;Referencia;Descripción;Comprador;Ganancia artista;Base imponible;% IVA;IVA;Total línea
Arte;art_order_item:789;Cuadro «Sin título»;order:456/item:789;210,00;81,82;10%;8,18;90,00
...
;;;;
Totales;;;;210,00;81,82;;8,18;90,00
Importe transferido (€);;;;210,00;;;;
```

Las celdas con decimales usan coma; las vacías son literalmente vacías; las líneas que empiezan con `#` son comentarios opcionales (Excel las ignora como texto). El separador es `;`. Prefijo BOM `\uFEFF` al inicio para forzar UTF-8 en Excel ES.

## 4. Mapeo CSV agregado (rango)

Tabla "long" con una fila por item y columnas redundantes del withdrawal padre:

```csv
Withdrawal ID;Fecha;Estado;Régimen;Stripe transfer ID;Artista;NIF artista;Modo facturación;Tipo item;Referencia item;Descripción;Ganancia artista;Base imponible;% IVA;IVA;Total línea
1234;10/04/2026;completado;REBU;tr_XXX;Juan Pérez;12345678Z;Autofactura;Arte;art_order_item:789;Cuadro «Sin título»;210,00;81,82;10%;8,18;90,00
1234;10/04/2026;completado;REBU;tr_XXX;Juan Pérez;12345678Z;Autofactura;Arte;art_order_item:790;Dibujo;150,00;54,55;10%;5,45;60,00
1235;11/04/2026;completado;IVA 21%;tr_YYY;Ana Gómez;87654321X;Factura recibida;Evento;event_attendee:12;Entrada: Masterclass;21,00;6,61;21%;1,39;8,00
```

Una única fila de totales al final no — la gestoría los calcula con una pivot table sobre las columnas `Base imponible`, `IVA`, y `Total línea`.

## 5. Estructura JSON agregado (rango)

```jsonc
{
  "platform": { ... },              // igual que el individual
  "range": { "from": "2026-01-01", "to": "2026-03-31" },
  "filters": { "vat_regime": null, "seller_id": null },
  "totals_by_regime": {
    "art_rebu":      { "count": 12, "taxable_base_total": 1200.00, "vat_amount_total": 120.00, "seller_earning_total": 8400.00 },
    "standard_vat":  { "count":  5, "taxable_base_total":  500.00, "vat_amount_total": 105.00, "seller_earning_total": 1500.00 }
  },
  "totals_by_month": {
    "2026-01": { ... },
    "2026-02": { ... },
    "2026-03": { ... }
  },
  "payouts": [ PayoutReport, PayoutReport, ... ]
}
```

El JSON agregado embebe los objetos `PayoutReport` completos (con sus lines). No lo-fi/alto-fi; misma estructura que el individual.

## 6. Reglas de `inferInvoicingMode(user)`

| `tax_status` | `autofactura_agreement_signed_at` | Resultado | Explicación en es-ES |
|---|---|---|---|
| `'particular'` | NOT NULL | `autofactura` | "140d emite autofactura por la comisión en nombre del artista (art. 5 Reglamento de Facturación)." |
| `'particular'` | NULL | `pending_agreement` | "Artista particular sin acuerdo de autofacturación firmado. Debe firmarse antes de declarar el trimestre." |
| `'autonomo'` | — | `factura_recibida` | "El artista autónomo emite su propia factura a 140d por el importe de la comisión." |
| `'sociedad'` | — | `factura_recibida` | "La sociedad artística emite factura a 140d por el importe de la comisión." |
| NULL | — | **error 500** | "Datos fiscales incompletos para el artista." — no debería ocurrir post-Change #1 (el onboarding bloquea withdrawals sin fiscal_*). |

## 7. Validaciones de entrada

| Endpoint | Validaciones |
|---|---|
| `GET /api/admin/payouts/:withdrawalId/fiscal-export` | `withdrawalId` es entero, existe, `status='completed'` o `'reversed'`. `format ∈ {csv,json}` (default csv). |
| `GET /api/admin/payouts/fiscal-export` | `from ≤ to`, ambos YYYY-MM-DD válidos, diferencia ≤ 366 días. `format ∈ {csv,json}`. `vat_regime ∈ {art_rebu,standard_vat}` opcional. `sellerId` entero opcional. |
| `GET /api/admin/payouts/summary` | `from ≤ to`, diferencia ≤ 366 días. |

En todos: admin auth + rate limit `general`.

## 8. Rendimiento

- Rango típico trimestral: ~100 payouts, ~500 items → <1 MB de payload, <1 s de query en Turso. No es un problema v1.
- `describeBatch(rows)` — un único `SELECT ... WHERE id IN (...)` por `item_type`, luego merge en memoria. Evita N+1.
- El CSV se construye como array de strings y se une con `\n` al final. No se usa streaming: el tamaño esperado cabe cómodo en RAM.
- Si el rango llegase a ser demasiado grande (>10k items), la limitación ya la impone el cap de 366 días; si aun así duele, v2 podría streamear por chunks.

## 9. Manejo de reversiones y fallos

| Estado withdrawal | Aparece en export individual | Aparece en export agregado | Totals afectados |
|---|---|---|---|
| `completed` | Sí | Sí | Sí |
| `reversed` (parcial) | Sí, con `reversal_amount` visible | Sí | `net_of_reversals = amount - reversal_amount` |
| `reversed` (total) | Sí, con `net_of_reversals = 0` | Sí | Mismo; la fila existe porque la operación Stripe existió |
| `failed` | 404 si el admin pide su export individual | No | N/A |
| `pending` / `processing` | 409 con mensaje "payout aún en proceso" | No | N/A |

La distinción importante: el export refleja **realidad fiscal**, no estado operativo. Un `reversed` sigue siendo un evento fiscal que la gestoría debe conocer.

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Env vars `BUSINESS_*` ausentes → export sin datos de plataforma | 503 con mensaje explícito listando qué falta. El admin no puede exportar sin completarlos. |
| Datos fiscales del artista incompletos en un payout pasado | Imposible: el Change #1 bloquea la creación de la cuenta sin ellos. Si aun así ocurre (dato borrado a mano), devolver 500 con "Artista <id> tiene datos fiscales incompletos". |
| Cambio de NIF del artista post-payout | Documentado: el export usa snapshot actual. La gestoría debe congelar el export en disco justo tras el payout si quiere garantía de "momento del pago". |
| Rango muy grande | Cap 366 días. |
| CSV mal formado en Excel (coma vs punto) | Locale español explícito, BOM, separador `;`. Pruebas manuales en pre con Excel ES. |
| Doble export del mismo payout | Inofensivo: no hay escritura. La gestoría puede descargar N veces. |
| Gestoría pide formato distinto | V1 entrega CSV/JSON. Si piden XBRL/SII, lo hace su ERP desde el CSV. Out of scope. |
| PII en los archivos | Los descargan admins autenticados; el CSV lleva datos fiscales por diseño. Sin distribución externa automatizada. |

## 11. Lo que NO entra

Ver Non-goals del proposal. En particular: PDFs, numeración de facturas, historial versionado, envío automático, IRPF aplicado, soporte multi-país, XBRL/SII/Verifactu.
