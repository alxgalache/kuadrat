# Tipos de contratos de servicios

Learn how a service agreement establishes the relationship between Stripe and a platform's users.

The connected account’s service agreement type determines what [capabilities](https://docs.stripe.com/connect/account-capabilities.md) the account has access to, and which service agreement applies to the platform’s users.

This content is only applicable if your platform is liable for negative balances and your connected accounts don’t have access to the full Stripe Dashboard, which includes Express and Custom accounts.

## Supported agreement types

Connected accounts can be under one of the following service agreement types: `full` or `recipient`. After a connected account accepts it, you can’t modify the type of service agreement.

### Full service agreement

A `full` service agreement creates a service relationship between Stripe and the connected account holder. Connected accounts under the `full` service agreement can process card payments and request the [card_payments](https://docs.stripe.com/connect/account-capabilities.md#card-payments) capability.

For the legal language, see the [Stripe Connected Account Agreement](https://stripe.com/connect-account/legal/full).

### Recipient service agreement

A [recipient service agreement](https://stripe.com/connect-account/legal/recipient) acknowledges that Stripe has no direct service relationship with the recipient. Instead, the recipient has a relationship only with the platform. Accounts under this agreement can’t process payments or request the `card_payments` capability. Transfers to `recipient` accounts take an additional 24 hours to become available in the [connected account’s balance](https://docs.stripe.com/connect/account-balances.md).

The recipient service agreement is available in select countries. Refer to the [required verification information](https://docs.stripe.com/connect/required-verification-information.md) to verify the supported countries.

Stripe supports cross-border payouts for platforms using a `recipient` service agreement through [Global payouts](https://docs.stripe.com/global-payouts.md). Stripe doesn’t provide direct support to accounts on the `recipient` service agreement, but you (the platform) can contact Stripe for support on behalf of those accounts.

## Choosing the agreement type

You can specify the agreement type through the [Accounts](https://docs.stripe.com/api/accounts.md) API.

> #### Accounts v2
>
> You don’t need to actively set the service agreement type for Accounts created in the v2 API because adding the `recipient` configuration automatically sets the recipient service agreement for a connected account. Accounts without the `recipient` configuration have the full service agreement.

### Accounts API

To choose a `recipient` service agreement when [creating an account](https://docs.stripe.com/api.md#create_account), specify the agreement type with [tos_acceptance[service_agreement]](https://docs.stripe.com/api/accounts/object.md#account_object-tos_acceptance):

#### With controller properties

```node
// Don't put any keys in code. See https://docs.stripe.com/keys-best-practices.
// Find your keys at https://dashboard.stripe.com/apikeys.
const stripe = require('stripe')('<<YOUR_SECRET_KEY>>');

const account = await stripe.accounts.create({
  country: 'ES',
  controller: {
    stripe_dashboard: {
      type: 'none',
    },
    fees: {
      payer: 'application',
    },
    losses: {
      payments: 'application',
    },
    requirement_collection: 'application',
  },
  capabilities: {
    transfers: {
      requested: true,
    },
  },
  tos_acceptance: {
    service_agreement: 'recipient',
  },
});
```

#### With account type

```node
// Don't put any keys in code. See https://docs.stripe.com/keys-best-practices.
// Find your keys at https://dashboard.stripe.com/apikeys.
const stripe = require('stripe')('<<YOUR_SECRET_KEY>>');

const account = await stripe.accounts.create({
  country: 'ES',
  type: 'custom',
  capabilities: {
    transfers: {
      requested: true,
    },
  },
  tos_acceptance: {
    service_agreement: 'recipient',
  },
});
```

The same principle applies when [updating an account](https://docs.stripe.com/api.md#update_account):

```node
// Don't put any keys in code. See https://docs.stripe.com/keys-best-practices.
// Find your keys at https://dashboard.stripe.com/apikeys.
const stripe = require('stripe')('<<YOUR_SECRET_KEY>>');

const account = await stripe.accounts.update(
  '{{CONNECTEDACCOUNT_ID}}',
  {
    tos_acceptance: {
      service_agreement: 'recipient',
    },
  }
);
```

> Changing the service agreement type fails if the service agreement has already been accepted; in those cases, create a new account with the desired service agreement.

### Connect Configuration settings

To choose a `recipient` service agreement for connected accounts with access to the Express Dashboard, select the **Transfers** option with the **Restricted Capability Access** icon in the [Configuration settings](https://dashboard.stripe.com/account/applications/settings/express) section of the Stripe Dashboard.

You can override the Configuration settings for an individual account by specifying its capabilities and service agreement type with the Accounts API.

## Accepting the correct agreement

Stripe handles the service agreement acceptance if you use [Stripe-hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding.md) or [Embedded onboarding](https://docs.stripe.com/connect/embedded-onboarding.md). For [API onboarding](https://docs.stripe.com/connect/api-onboarding.md), the platform must attest that their user has seen and accepted the service agreement. See [service agreement acceptance](https://docs.stripe.com/connect/updating-service-agreements.md#tos-acceptance) for more information.