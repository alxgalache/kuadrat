# Modelo fiscal de comisiones y facturación de payouts

> **Contexto:** 140d Galería de Arte actúa como marketplace intermediario. Los artistas (sellers) venden productos a través de la plataforma y esta retiene una comisión por cada venta. Cuando se ejecuta un payout (transferencia al artista vía Stripe Connect), es necesario documentar fiscalmente la comisión retenida. Este documento explica el modelo fiscal, los cálculos, y las obligaciones de facturación.
>
> **Referencia técnica:** `docs/stripe_connect/master_plan.md` (§2.1–§2.3, §9), `api/utils/vatCalculator.js`, `openspec/changes/stripe-connect-manual-payouts/design.md` (§3).

---

## 1. Comisiones de la plataforma

La plataforma retiene un porcentaje del precio de venta como comisión por el servicio de intermediación:

| Tipo de producto | Variable de configuración | Valor por defecto | Régimen fiscal |
|---|---|---|---|
| Obra de arte (`art`) | `DEALER_COMMISSION_ART` | 25% | REBU 10% |
| Otros productos (`others`) | `DEALER_COMMISSION_OTHERS` | 10% | IVA estándar 21% |
| Eventos de pago | `DEALER_COMMISSION_OTHERS` | 10% | IVA estándar 21% |

La comisión se calcula sobre el precio de venta y se almacena en la columna `commission_amount` de `art_order_items` y `other_order_items`. El artista recibe el neto: `precio - comisión`.

---

## 2. Qué es la base imponible y el IVA que aparecen en el panel de pagos

Cuando el admin accede a `/admin/payouts/[sellerId]`, el panel muestra para cada bucket (REBU / estándar):

- **Saldo disponible**: lo que el artista va a recibir (= precio - comisión)
- **Base imponible**: la parte neta de la comisión (sin IVA)
- **IVA incluido**: el IVA contenido dentro de la comisión
- **Total a pagar**: = saldo disponible (lo que se transfiere al artista)

La base imponible y el IVA **no se refieren al pago al artista**, sino al **desglose fiscal de la comisión que la plataforma retiene**. Es la información que la gestoría necesita para declarar los ingresos de la plataforma ante Hacienda.

---

## 3. Fórmulas de cálculo

La comisión siempre se almacena como un importe bruto (IVA incluido). Para obtener la base imponible, se extrae el IVA del importe bruto.

### 3.1 Productos "others" y eventos — IVA estándar 21%

```
Ejemplo: producto a 200 €, comisión 10%

comisión         = 200 × 0.10 = 20.00 €
sellerEarning    = 200 - 20   = 180.00 €  (lo que recibe el artista)

base_imponible   = comisión / (1 + 0.21)
                 = 20.00 / 1.21
                 = 16.53 €

IVA              = comisión - base_imponible
                 = 20.00 - 16.53
                 = 3.47 €

Verificación:    16.53 + 3.47 = 20.00 ✓
                 16.53 × 1.21 = 20.00 ✓
```

### 3.2 Obras de arte — REBU 10% (Régimen Especial de Bienes Usados)

```
Ejemplo: obra a 500 €, comisión 25%

comisión         = 500 × 0.25 = 125.00 €
sellerEarning    = 500 - 125  = 375.00 €  (lo que recibe el artista)

base_imponible   = comisión / (1 + 0.10)
                 = 125.00 / 1.10
                 = 113.64 €

IVA REBU         = comisión - base_imponible
                 = 125.00 - 113.64
                 = 11.36 €

Verificación:    113.64 + 11.36 = 125.00 ✓
                 113.64 × 1.10  = 125.00 ✓
```

### 3.3 Implementación en código

Las funciones `computeStandardVat` y `computeRebuVat` en `api/utils/vatCalculator.js` implementan estas fórmulas. Reciben `{ price, commission }` en euros (floats) y devuelven `{ sellerEarning, taxableBase, vatRate, vatAmount }`.

---

## 4. Diagrama del flujo económico de una venta

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   Comprador paga: 200.00 €                              │
│                          │                                              │
│          ┌───────────────┴────────────────┐                             │
│          │                                │                             │
│  Comisión plataforma: 20 €        Earning artista: 180 €                │
│  (retenida por 140d)              (transferido vía Stripe Connect)      │
│          │                                │                             │
│          ▼                                ▼                             │
│  ┌─────────────────────┐      ┌──────────────────────┐                  │
│  │ Base imp.: 16.53 €  │      │ Se transfiere al     │                  │
│  │ IVA 21%:   3.47 €  │      │ artista como payout   │                  │
│  │ Total:    20.00 €  │      │ desde el panel admin   │                  │
│  └─────────────────────┘      └──────────────────────┘                  │
│          │                                                              │
│          ▼                                                              │
│  Factura/autofactura por la comisión                                    │
│  (la plataforma declara 16.53 € de ingreso + 3.47 € de IVA)           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Obligaciones de facturación

### 5.1 El pago al artista NO es una factura

La transferencia de 180 € al artista vía Stripe Connect es una operación financiera (un pago), no un servicio facturable. No genera factura por sí misma.

### 5.2 La comisión SÍ requiere documentación fiscal

La comisión de 20 € es el ingreso de la plataforma por el servicio de intermediación. Debe documentarse fiscalmente. El tipo de documento depende del estatus fiscal del artista:

#### Caso A — Artista **particular** (no autónomo)

La plataforma emite una **autofactura** (art. 5 del Reglamento de Facturación) en nombre del artista:

```
┌──────────────────────────────────────────────────────────────────┐
│                  AUTOFACTURA nº AF-2026/XXX                       │
│                                                                   │
│  Emisor:       140d Galería de Arte, S.L.                         │
│               (en nombre de [Nombre del artista] — particular)    │
│  Destinatario: 140d Galería de Arte, S.L.                         │
│                                                                   │
│  Concepto:     Comisión por intermediación en venta de             │
│               "[Nombre del producto]" (pedido #XXXX)              │
│                                                                   │
│  Base imponible:          16.53 €                                 │
│  IVA 21%:                  3.47 €                                 │
│  ─────────────────────────────────                                │
│  Total:                   20.00 €                                 │
│                                                                   │
│  Nota: transferido al artista 180.00 € vía Stripe Connect         │
│        (transfer ID: tr_XXXXXXXXXXXX)                              │
└──────────────────────────────────────────────────────────────────┘
```

La plataforma declara los 16.53 € como ingreso y los 3.47 € como IVA repercutido en su declaración trimestral (modelo 303).

#### Caso B — Artista **autónomo**

Es el artista quien emite factura a la plataforma por la venta realizada. La plataforma registra esa factura como gasto. El artista facturaría el neto que recibe (180 €) como ingreso por la venta de su producto.

La plataforma, por su parte, puede emitir una factura al artista por el servicio de intermediación (los 20 € de comisión), o reflejar la comisión como deducción en la liquidación.

#### Caso C — Artista que opera como **sociedad**

Mismo flujo que el autónomo. La sociedad emite factura a la plataforma.

### 5.3 Particularidades del régimen REBU (arte)

Para obras de arte bajo REBU:

- La plataforma actúa como "dealer" que compra al artista y revende al comprador
- El IVA REBU (10%) se calcula sobre el **margen** (= comisión), no sobre el precio total
- **No se desglosa IVA al comprador final** en el ticket/factura de venta
- La autofactura/factura entre plataforma y artista refleja el margen con IVA REBU incluido
- En la declaración trimestral, el IVA REBU se declara de forma específica

---

## 6. Flujo documental completo por venta

```
  Venta de un producto (200 €)
       │
       ├──▶ 1. Factura/ticket al COMPRADOR
       │       Emite: la plataforma
       │       Importe: 200 € (IVA incluido en precio para REBU;
       │                        desglosado para productos estándar)
       │
       ├──▶ 2. Factura/autofactura de la COMISIÓN
       │       Emite: la plataforma (si artista particular → autofactura)
       │               el artista (si autónomo → factura del artista)
       │       Base imponible: 16.53 €
       │       IVA: 3.47 €
       │       Total comisión: 20.00 €
       │       → Esto es lo que la plataforma declara como ingreso
       │
       └──▶ 3. Transferencia al ARTISTA
               Importe: 180.00 € vía Stripe Connect
               No es una factura — es un movimiento bancario
               Documentado en la tabla `withdrawals` con `stripe_transfer_id`
```

---

## 7. Resumen de cantidades por actor

| Concepto | Importe | Quién lo usa |
|---|---|---|
| Precio de venta | 200.00 € | Factura al comprador |
| Comisión (IVA incluido) | 20.00 € | Ingreso bruto de la plataforma |
| Base imponible de la comisión | 16.53 € | Declaración fiscal de la plataforma (modelo 303) |
| IVA de la comisión | 3.47 € | IVA repercutido de la plataforma |
| Earning del artista | 180.00 € | Transferencia vía Stripe Connect |

**Relación fundamental:** `earning + comisión = precio` → `180 + 20 = 200 ✓`

Y dentro de la comisión: `base_imponible + IVA = comisión` → `16.53 + 3.47 = 20.00 ✓`

---

## 8. Estado actual de la automatización

| Funcionalidad | Estado | Change |
|---|---|---|
| Cálculo automático de base/IVA por item | Implementado | Change #2 |
| Panel admin con desglose por régimen | Implementado | Change #2 |
| Ejecución de transferencia vía Stripe Connect | Implementado | Change #2 |
| Registro de `withdrawal_items` con desglose fiscal | Implementado | Change #2 |
| Export CSV/JSON para la gestoría | Pendiente | Change #4 |
| Generación automática de PDFs de autofactura | Out of scope v1 | — |

La gestoría puede consultar la tabla `withdrawal_items` (directamente o vía el futuro export del Change #4) para obtener todas las líneas con `taxable_base`, `vat_rate`, `vat_amount`, `vat_regime` y `seller_earning` por cada item incluido en cada payout.
