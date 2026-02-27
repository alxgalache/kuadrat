## 1. Shared Components

- [x] 1.1 Migrate `client/components/AuctionImageMosaic.js` — replace all 4 `<img>` with `<Image fill>`, add `relative` to parent containers, add `sizes` prop
- [x] 1.2 Migrate `client/components/DrawGridItem.js` — replace `<img>` with `<Image fill>`, ensure parent has `relative` and defined height
- [x] 1.3 Migrate `client/components/ProductGrid.js` — replace `<img>` with `<Image fill>`, add `relative` to item container, add `sizes`
- [x] 1.4 Migrate `client/components/EventBadge.js` — replace `<img src="/brand/icons/dice.png">` with `<Image width={14} height={14} src="/brand/icons/dice.png">`
- [x] 1.5 Migrate `client/components/Navbar.js` — replace both `<img>` elements (logo + user avatar) with `<Image>`, use explicit dimensions for fixed-size images
- [x] 1.6 Migrate `client/components/DrawHowWorksModal.js` — replace any `<img>` with `<Image>` using appropriate sizing strategy
- [x] 1.7 Migrate `client/components/DrawParticipationModal.js` — replace `<img src={imageUrl}>` (line 591) with `<Image fill>` or explicit dims depending on container
- [x] 1.8 Migrate `client/components/AuctionGridItem.js` — replace `<img>` with `<Image fill>`, add `relative` to card image container, add `sizes`
- [x] 1.9 Migrate `client/components/AuthorModal.js` — replace `<img>` with `<Image>` using `fill` or explicit dimensions per container context
- [x] 1.10 Migrate `client/components/ShoppingCartDrawer.js` — remove unused `<img>` on line 1189, use the already-imported `<Image>` component with `fill`

## 2. App Pages — Events & Draws

- [x] 2.1 Migrate `client/app/eventos/sorteo/[id]/DrawDetail.js` — replace the product image (`<img>` line 135) with `<Image fill priority>` and the icon (`line 162`) with `<Image width={16} height={16}>`
- [x] 2.2 Migrate `client/app/eventos/subasta/[id]/AuctionDetail.js` — replace `<img>` (line 237) with `<Image fill priority>` for hero image

## 3. App Pages — Gallery & Store

- [x] 3.1 Migrate `client/app/galeria/p/[id]/ArtProductDetail.js` — replace primary product `<img>` (line 180) with `<Image fill priority>`, ensure parent container is `relative` with defined height
- [x] 3.2 Migrate `client/app/tienda/p/[id]/OthersProductDetail.js` — replace `<img>` (line 204) with `<Image fill priority>` for product hero image

## 4. App Pages — Live Events

- [x] 4.1 Migrate `client/app/live/[slug]/EventDetail.js` — replace `<img>` (line 362) with `<Image fill priority>` for event hero image
- [x] 4.2 Migrate `client/app/live/page.js` — replace `<img>` (line 201) with `<Image fill>` and appropriate `sizes` for grid layout

## 5. App Pages — Admin

- [x] 5.1 Migrate `client/app/admin/products/[id]/edit/page.js` — replace `<img>` (line 402) with `<Image fill>` for product image preview
- [x] 5.2 Migrate `client/app/admin/pedidos/[id]/page.js` — replace `<img>` (line 145) with `<Image fill>` for order item image
- [x] 5.3 Migrate `client/app/admin/autores/nuevo/page.js` — replace `<img>` (line 446) with `<Image fill>` for avatar preview
- [x] 5.4 Migrate `client/app/admin/autores/page.js` — replace `<img>` (line 102) with `<Image fill>` or explicit dims for author avatar in list
- [x] 5.5 Migrate `client/app/admin/authors/[id]/edit/page.js` — replace `<img>` (line 480) with `<Image fill>` for avatar preview
- [x] 5.6 Migrate `client/app/admin/authors/[id]/page.js` — replace both `<img>` elements (lines 165, 278) with `<Image>` using fill or explicit dims

## 6. App Pages — Seller

- [x] 6.1 Migrate `client/app/seller/products/page.js` — replace both `<img>` elements (lines 214, 302) with `<Image fill>` for product thumbnails
- [x] 6.2 Migrate `client/app/seller/publish/page.js` — replace `<img>` (line 647) with `<Image fill>` for image upload preview

## 7. App Pages — Orders & Legal

- [x] 7.1 Migrate `client/app/orders/[id]/page.js` — replace `<img>` (line 555) with `<Image fill>` for order item thumbnail
- [x] 7.2 Migrate `client/app/pedido/[token]/page.js` — replace `<img>` (line 371) with `<Image fill>` for order item thumbnail
- [x] 7.3 Migrate `client/app/legal/terminos-y-condiciones/page.js` — replace `<img>` (line 12) with `<Image>` using explicit dimensions
- [x] 7.4 Migrate `client/app/legal/politica-de-privacidad/page.js` — replace `<img>` (line 12) with `<Image>` using explicit dimensions
- [x] 7.5 Migrate `client/app/legal/normas-eventos/page.js` — replace `<img>` (line 12) with `<Image>` using explicit dimensions

## 8. App Pages — Home & Authors

- [x] 8.1 Migrate `client/app/page.js` — replace `<img>` (line 12) with `<Image>` using `priority` (above-the-fold hero)
- [x] 8.2 Migrate `client/app/autores/page.js` — replace `<img>` (line 47) with `<Image fill>` and `sizes` for author grid cards

## 9. Verification

- [x] 9.1 Run `grep -rn "<img" client/ --include="*.js"` and confirm zero matches remain
- [x] 9.2 Visual smoke-test: home page, a product detail, an auction detail, the admin authors list, and a seller product list — confirm no broken/collapsed images
