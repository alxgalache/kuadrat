# gemini-conversation
Exported on: 9/4/2026, 14:28:38

---

**You:**
¿A partir de qué versión del paquete NPM de Stripe se soporta `stripeClient.v2.core.accounts.create` y `parseThinEvent`? Actualmente tengo la 20.3.1

**Gemini:**
En tu versión actual (**20.3.1**), la API de Accounts V2 (`stripeClient.v2.core.accounts.create`) está **completamente soportada**, pero `parseThinEvent` **ya no existe** porque fue renombrado.

Aquí tienes el historial exacto de cuándo se introdujeron (y modificaron) estas funciones en el paquete `stripe-node`:

### 1. `stripeClient.v2.core.accounts.create` (Accounts v2 API)

* **Introducción (Preview):** Los endpoints de la versión V2 de Accounts empezaron a integrarse gradualmente en versiones preliminares alrededor de las versiones `18.x` y `19.x`.
* **General Availability (GA):** Se soportan oficialmente de forma estable a partir de la versión **`20.0.0`**, versión que está anclada a la versión de la API de Stripe `2025-12-15.clover`. Al estar en la 20.3.1, tienes acceso total a esta API.

### 2. `parseThinEvent`

* **Introducción:** Se añadió por primera vez en la versión **`17.0.0`** (junto con la API `2024-09-30.acacia`) para dar soporte al nuevo modelo de eventos de Stripe.
* **Renombramiento (Breaking Change):** En la versión **`19.0.0`**, este método **fue eliminado y reemplazado**. Pasó de llamarse `parseThinEvent` a `parseEventNotification`. Además, la interfaz de TypeScript `Stripe.ThinEvent` fue reemplazada por `Stripe.V2.EventNotification`.

---

### ¿Cómo proceder en tu versión (20.3.1)?

No hay una versión que soporte *ambas* llamadas con esos nombres exactos al mismo tiempo de forma estable. Dado que ya estás en una versión muy reciente (`20.3.1`), la solución es actualizar la forma en la que procesas los webhooks V2.

**Para crear cuentas:**
El código funciona exactamente como lo buscas en el namespace de V2:

```
const account = await stripe.v2.core.accounts.create({
  // Tus configuraciones (customer, merchant, recipient, etc.)
});

```

**Para procesar Thin Events (Webhooks V2):**
Debes sustituir `parseThinEvent` por el nuevo método en tu lógica de webhooks:

```
// ❌ Lo que funcionaba en la v17 / v18:
// const event = stripe.parseThinEvent(payload);

// ✅ Lo que debes usar en la v20.3.1:
const eventNotification = stripe.parseEventNotification(payload);

// Opcional: Ahora los eventos tienen métodos integrados útiles, 
// como fetchRelatedObject() y fetchEvent().

```

---

