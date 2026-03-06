## 1. Email Service

- [x] 1.1 Add `sendNewProductNotificationEmail({ sellerName, productName, productType })` function in `api/services/emailService.js` — HTML template with logo, escaped seller/product names, Spanish text indicating the product needs validation. Skips with `logger.warn` if `config.registrationEmail` is not set. Catches and logs SMTP errors.
- [x] 1.2 Export `sendNewProductNotificationEmail` in the `module.exports` block of `api/services/emailService.js`.

## 2. Controller Integration

- [x] 2.1 In `api/controllers/artController.js`, import `sendNewProductNotificationEmail` from emailService and call it (fire-and-forget with `.catch(err => logger.error(...))`) in `createArtProduct` after the successful DB insert and before the 201 response. Pass `{ sellerName: req.user.full_name, productName: name, productType: 'art' }`.
- [x] 2.2 In `api/controllers/othersController.js`, import `sendNewProductNotificationEmail` from emailService and call it (fire-and-forget with `.catch(err => logger.error(...))`) in `createOthersProduct` after the successful DB insert and before the 201 response. Pass `{ sellerName: req.user.full_name, productName: name, productType: 'other' }`.
