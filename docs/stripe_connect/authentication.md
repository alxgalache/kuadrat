# Cómo hacer llamadas a la API para cuentas conectadas

Descubre cómo agregar la información correcta a tus llamadas a la API para poder hacer llamadas para tus cuentas conectadas.

Puedes hacer llamadas API para tus cuentas conectadas:

- Del lado del servidor con el [encabezado Stripe-Account](https://docs.stripe.com/connect/authentication.md#stripe-account-header) y la identificación de la cuenta conectada, por solicitud
- Client-side by passing the connected account ID as an argument to the client library

To help with performance and reliability, Stripe has established [rate limits and allocations](https://docs.stripe.com/rate-limits.md) for API endpoints.

## Add the Stripe-Account header server-side

To make server-side API calls for connected accounts, use the `Stripe-Account` header with the account identifier, which begins with the prefix `acct_`. Here are four examples using your platform’s [API secret key](https://docs.stripe.com/keys.md) and the connected account’s [Account](https://docs.stripe.com/api/accounts.md) identifier:

#### Create PaymentIntent

```node
// Don't put any keys in code. See https://docs.stripe.com/keys-best-practices.
// Find your keys at https://dashboard.stripe.com/apikeys.
const stripe = require('stripe')('<<YOUR_SECRET_KEY>>');

const paymentIntent = await stripe.paymentIntents.create(
  {
    amount: 1000,
    currency: 'usd',
  },
  {
    stripeAccount: '{{CONNECTEDACCOUNT_ID}}',
  }
);
```

#### Retrieve Balance

```node
// Don't put any keys in code. See https://docs.stripe.com/keys-best-practices.
// Find your keys at https://dashboard.stripe.com/apikeys.
const stripe = require('stripe')('<<YOUR_SECRET_KEY>>');

const balance = await stripe.balance.retrieve({
  stripeAccount: '{{CONNECTEDACCOUNT_ID}}',
});
```

#### List Products

```node
// Don't put any keys in code. See https://docs.stripe.com/keys-best-practices.
// Find your keys at https://dashboard.stripe.com/apikeys.
const stripe = require('stripe')('<<YOUR_SECRET_KEY>>');

const products = await stripe.products.list(
  {
    limit: 5,
  },
  {
    stripeAccount: '{{CONNECTEDACCOUNT_ID}}',
  }
);
```

#### Delete Customer

```node
// Don't put any keys in code. See https://docs.stripe.com/keys-best-practices.
// Find your keys at https://dashboard.stripe.com/apikeys.
const stripe = require('stripe')('<<YOUR_SECRET_KEY>>');

const deleted = await stripe.customers.del(
  '{{CUSTOMER_ID}}',
  {
    stripeAccount: '{{CONNECTEDACCOUNT_ID}}',
  }
);
```

The `Stripe-Account` header approach is implied in any API request that includes the Stripe account ID in the URL. Here’s an example that shows how to [Retrieve an account](https://docs.stripe.com/api/accounts/retrieve.md) with your user’s [Account](https://docs.stripe.com/api/accounts.md) identifier in the URL.

```node
// Don't put any keys in code. See https://docs.stripe.com/keys-best-practices.
// Find your keys at https://dashboard.stripe.com/apikeys.
const stripe = require('stripe')('<<YOUR_SECRET_KEY>>');

const account = await stripe.accounts.retrieve('{{CONNECTEDACCOUNT_ID}}');
```

Todas las bibliotecas del lado del servidor de Stripe admiten este enfoque por solicitud:

```node
// Don't put any keys in code. See https://docs.stripe.com/keys-best-practices.
// Find your keys at https://dashboard.stripe.com/apikeys.
const stripe = require('stripe')('<<YOUR_SECRET_KEY>>');

const customer = await stripe.customers.create(
  {
    email: 'person@example.com',
  },
  {
    stripeAccount: '{{CONNECTEDACCOUNT_ID}}',
  }
);
```

## Add the connected account ID to a client-side application

Las librerías del lado del cliente configuran la identificación de cuenta conectada como argumento de la solicitud del cliente:

#### HTML + JS

El código de JavaScript para especificar la identificación de cuenta conectada a la solicitud del lado del cliente

```javascript
var stripe = Stripe('<<YOUR_PUBLISHABLE_KEY>>', {
  stripeAccount: '{{CONNECTED_ACCOUNT_ID}}',
});
```

#### React

```javascript
import {loadStripe} from '@stripe/stripe-js';

// Make sure to call `loadStripe` outside of a component's render to avoid
// recreating the `Stripe` object on every render.
const stripePromise = loadStripe('<<YOUR_PUBLISHABLE_KEY>>', {
  stripeAccount: '{{CONNECTED_ACCOUNT_ID}}',
});
```

#### iOS

#### Swift

```swift
import UIKit
import StripePayments

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplicationLaunchOptionsKey: Any]?) -> Bool {
        StripeAPI.defaultPublishableKey = "<<YOUR_PUBLISHABLE_KEY>>"
        STPAPIClient.shared.stripeAccount = "{{CONNECTED_ACCOUNT_ID}}"
        return true
    }
}
```

#### Android

#### Kotlin

```kotlin
import com.stripe.android.PaymentConfiguration

class MyActivity: Activity() {
    private lateinit var stripe: Stripe

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        stripe = Stripe(
            this,
            PaymentConfiguration.getInstance(this).publishableKey,
            "{{CONNECTED_ACCOUNT_ID}}"
        )
    }
}
```

#### React Native

```javascript
import {StripeProvider} from '@stripe/stripe-react-native';

function App() {
  return (
    <StripeProvider
      publishableKey="<<YOUR_PUBLISHABLE_KEY>>"
      stripeAccountId="{{CONNECTED_ACCOUNT_ID}}"
    >
      {/* Your app code here */}
    </StripeProvider>
  );
}
```

## Utiliza componentes integrados de Connect

Instead of directly integrating with Stripe’s APIs, you can use [Connect embedded components](https://docs.stripe.com/connect/get-started-connect-embedded-components.md) to provide Stripe functionality to your connected accounts in your platform’s UI. These components require less code to implement and handle all API calls internally.

For example, to show payments data to your connected accounts, embed the [Payments component](https://docs.stripe.com/connect/supported-embedded-components/payments.md) in your platform’s UI. This eliminates the need to make separate calls to the [Charges](https://docs.stripe.com/api/charges.md), [Payment Intents](https://docs.stripe.com/api/payment_intents.md), [Refunds](https://docs.stripe.com/api/refunds.md), and [Disputes](https://docs.stripe.com/api/disputes.md) API.

Note: The following is a preview/demo component that behaves differently than live mode usage with real connected accounts. The actual component has more functionality than what might appear in this demo component. For example, for connected accounts without Stripe dashboard access (custom accounts), no user authentication is required in production.

For a complete list of the available embedded components, see [Supported components](https://docs.stripe.com/connect/supported-embedded-components.md).

## See also

- [Creating charges](https://docs.stripe.com/connect/charges.md)
- [Using subscriptions](https://docs.stripe.com/connect/subscriptions.md)
- [Getting started with Connect embedded components](https://docs.stripe.com/connect/get-started-connect-embedded-components.md)