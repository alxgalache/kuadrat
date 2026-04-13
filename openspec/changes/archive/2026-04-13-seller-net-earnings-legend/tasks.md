## 1. API environment variable

- [x] 1.1 Add `TAX_VAT_ART_ES=0.10` to `api/.env.example` alongside existing `TAX_VAT_ES=0.21`
- [x] 1.2 Add `TAX_VAT_ART_ES=0.10` to `api/.env` and `api/.env.local`
- [x] 1.3 Register `vatArtEs: optionalFloat('TAX_VAT_ART_ES', 0.10)` in `api/config/env.js` under `payment`

## 2. Client environment variables

- [x] 2.1 Add `NEXT_PUBLIC_TAX_VAT_ES=21` and `NEXT_PUBLIC_TAX_VAT_ART_ES=10` to `client/.env.example`
- [x] 2.2 Add `NEXT_PUBLIC_TAX_VAT_ES=21` and `NEXT_PUBLIC_TAX_VAT_ART_ES=10` to `client/.env` and `client/.env.local`

## 3. Infrastructure files

- [x] 3.1 Add `NEXT_PUBLIC_TAX_VAT_ES` and `NEXT_PUBLIC_TAX_VAT_ART_ES` ARG/ENV to `client/Dockerfile.staging`
- [x] 3.2 Add `NEXT_PUBLIC_TAX_VAT_ES` and `NEXT_PUBLIC_TAX_VAT_ART_ES` ARG/ENV to `client/Dockerfile.prod`
- [x] 3.3 Add `NEXT_PUBLIC_TAX_VAT_ES` and `NEXT_PUBLIC_TAX_VAT_ART_ES` to `docker-compose.m1.yml` client service
- [x] 3.4 Add `NEXT_PUBLIC_TAX_VAT_ES` and `NEXT_PUBLIC_TAX_VAT_ART_ES` to `docker-compose.pre2.yml` client service
- [x] 3.5 Add `NEXT_PUBLIC_TAX_VAT_ES` and `NEXT_PUBLIC_TAX_VAT_ART_ES` to `docker-compose.prod.yml` client service

## 4. Frontend — net earnings legend

- [x] 4.1 In `client/app/seller/publish/page.js`, add the net earnings computation logic based on `productCategory` and `price`, reading commission and VAT from env vars with defaults
- [x] 4.2 Add the legend element below the price `<input>`, showing `Recibirás X.XX€ netos por la venta (Y.YY€ incluyendo el IVA(Z%))` only when price >= 10
