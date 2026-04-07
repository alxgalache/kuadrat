# Recommended Connect integrations and charge types

Learn about the implications of Connect configuration options for different charge types and connected accounts.

This document describes some of the Connect configuration options and their relationships, including the implications of using different types of charges. We recommend that you read it after [learning about Connect’s essential features](https://docs.stripe.com/connect/how-connect-works.md), but before designing your integration.

## Recommended configurations

The following table shows some of Stripe’s recommendations for settings to use with each charge type. The rest of this document provides additional detail and reasoning.

| Opción                     | Cargos directos                | Destination/Separate Charges  |
| -------------------------- | ------------------------------ | ----------------------------- |
| Dashboard                  | - Completa
  - Custom/Embedded | - Custom/Embedded
  - Express |
| Negative Balance Liability | - Stripe                       | - Plataforma                  |
| Payment fee collector      | - Plataforma
  - Stripe        | - Plataforma                  |

## Configurations for direct charges

[Direct charges](https://docs.stripe.com/connect/direct-charges.md) are transactions between your connected accounts and their customers. They usually involve the transfer of funds from the connected account to your platform.
Cargos directos (See full diagram at https://docs.stripe.com/connect/integration-recommendations)
For integrations using direct charges, we recommend assigning responsibility for connected account negative balances to Stripe. Direct charges involve greater risk of negative balances on connected accounts, because associated refunds directly reduce their balances. When a connected account has a negative balance and your platform is responsible, Stripe [holds a reserve amount](https://docs.stripe.com/connect/account-balances.md#understanding-connected-reserve-balances) on your platform’s available balance. You can use direct charges with Express connected accounts. However, the fee behavior for direct charges on Express accounts [varies between Stripe features](https://docs.stripe.com/connect/direct-charges-fee-payer-behavior.md#fee-payer-behaviors), which may affect your monetization strategy decisions.

We also recommend allowing access to the [full Stripe Dashboard](https://docs.stripe.com/connect/stripe-dashboard.md) or a [custom interface using embedded components](https://docs.stripe.com/connect/get-started-connect-embedded-components.md), not the [Stripe Express Dashboard](https://docs.stripe.com/connect/express-dashboard.md), for the following reasons:

- Connected accounts can’t define their own [Radar](https://docs.stripe.com/connect/radar.md) rules using the Express Dashboard. Also, your platform Radar rules don’t apply to direct charges made on your connected accounts. To configure Radar rules for a connected account, your platform must set them up using the [View Dashboard as this account](https://docs.stripe.com/connect/dashboard/managing-individual-accounts.md#view-the-dashboard-as-a-connected-account) feature.
- When connected accounts use the Express Dashboard, your platform is always responsible for their negative balances.

## Configurations for destination charges or separate charges and transfers

[Destination charges](https://docs.stripe.com/connect/destination-charges.md) and [separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers.md) are transactions between your platform and customers of your connected accounts. They usually involve the transfer of funds from your platform to the connected account, but the connected account doesn’t charge the customer directly. Therefore, certain connected account settings don’t apply to these types of charges.
Destination & Separate Charges (See full diagram at https://docs.stripe.com/connect/integration-recommendations)
Avoid the following configurations in integrations that use destination charges or separate charges and transfers:

- Don’t assign Stripe [liability for negative balances on connected accounts](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration.md#set-responsibilities). Because these charges occur on the platform, the platform is responsible for related negative balances.
    - Stripe always applies negative transactions, such as refunds and disputes, to the account where the associated charge was made. So any negative amount associated with a charge on the platform reduces the platform’s balance. The platform is always responsible for its own negative balances.
    - When your platform is liable for negative balances on connected accounts, you have more flexibility in moving funds between accounts. For example, a marketplace can accept a customer payment for items from multiple sellers, then transfer appropriate portions of the payment to the individual seller accounts.
    - In the case of refunds or disputes related to charges made on the platform, your platform can’t easily [recover those funds from connected accounts](https://docs.stripe.com/connect/disputes.md#destination-and-separate-charges-and-transfers).
- Don’t have Stripe [bill payment fees directly to connected accounts](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration.md#set-responsibilities). Because these charges are created on the platform, Stripe takes the associated payment fees directly from the platform. If you configure Stripe to bill payment fees directly to connected accounts, it applies only to direct charges created on connected accounts.
- Don’t allow connected accounts to configure their own [Radar](https://docs.stripe.com/connect/radar.md) rules. Rules configured for a connected account don’t apply to charges created on the platform.

## Tipos de cuenta conectados

Legacy connected account types (Standard, Express, and Custom) support limited configurations and can have complex fee behaviors. We recommend that you instead define your connected accounts using controller properties (Accounts v1) or configurations and defaults (Accounts v2).

If you use legacy connected account types, we recommend that you replace them with [controller property-based accounts](https://docs.stripe.com/connect/migrate-to-controller-properties.md) or [configuration and default-based accounts](https://docs.stripe.com/connect/accounts-v2.md).