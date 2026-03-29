## 1. Database Schema

- [x] 1.1 Add `basename TEXT` column to `other_vars` CREATE TABLE in `api/config/database.js` (**high-risk**: shared DB schema)

## 2. Backend — Route & Multer

- [x] 2.1 Change multer from `upload.single('image')` to `upload.fields([{name:'image',maxCount:1},{name:'variation_images',maxCount:10}])` in `api/routes/othersRoutes.js`

## 3. Backend — Create Handler

- [x] 3.1 Update `createOthersProduct` in `api/controllers/othersController.js` to read main image from `req.files['image'][0]` instead of `req.file`
- [x] 3.2 Add validation for `variation_images`: each file must be PNG/JPG/WEBP, max 10MB, min 600x600px
- [x] 3.3 Save each variation image to `uploads/others/` with UUID basename and store basename on corresponding `other_vars` row
- [x] 3.4 Add cleanup logic: if DB inserts fail after files are written, delete the written image files

## 4. Backend — Delete Handler

- [x] 4.1 Update `deleteOthersProduct` in `api/controllers/othersController.js` to read `others.basename` + all `other_vars.basename` values and delete files from disk before DB deletion (log errors, don't block)

## 5. Frontend — Publish Form

- [x] 5.1 Rename image label from "Imagen" to "Imagen para el listado de productos" in `client/app/seller/publish/page.js`
- [x] 5.2 Add per-variation image upload input to each variation row (alongside name + stock) when `hasVariations` is enabled
- [x] 5.3 Add client-side validation for variation images (format, size, dimensions) matching existing `validateAndSetImage` logic
- [x] 5.4 Update `handleSubmit` to append `variation_images` files to FormData in the same order as the variations JSON array
- [x] 5.5 Add validation error when a variation row has no image on submit

## 6. Frontend — Product Detail Page

- [x] 6.1 Update `OthersProductDetail.js` in `client/app/tienda/p/[id]/` to display the selected variation's image (via `getOthersImageUrl(selectedVariant.basename)`) when the variation has a basename, falling back to `product.basename` otherwise
- [x] 6.2 Ensure image updates when the user switches between variations in the dropdown
