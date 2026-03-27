## 1. Backend: New shipping methods endpoint

- [x] 1.1 Add `getShippingMethods` function to `sendcloudApiClient.js` that calls `POST /api/v3/shipping-options` with `{from_country_code: "ES", to_country_code: "ES"}` and returns `data[].{code, name}`
- [x] 1.2 Create controller function in `api/controllers/sendcloudConfigController.js` for `GET /api/admin/shipping-methods`
- [x] 1.3 Add route `GET /shipping-methods` to `api/routes/admin/authorRoutes.js` (or a suitable admin route file)

## 2. Frontend: Use backend endpoint

- [x] 2.1 Add `getShippingMethods` method to `adminAPI` in `client/lib/api.js`
- [x] 2.2 Update `SendcloudConfigSection` to fetch from `adminAPI.getShippingMethods()` instead of `fetch('/api/carriers')`

## 3. Cleanup

- [x] 3.1 Delete `client/app/api/carriers/route.js`
- [x] 3.2 Remove `SENDCLOUD_CARRIER_OPTIONS` from `client/.env.example` and `client/.env.local`
