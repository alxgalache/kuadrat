## Context

"Others" products currently store a single image per product in `others.basename`. The file is saved to `api/uploads/others/` with a UUID-based filename and served via `GET /api/others/images/:basename`. Variations (`other_vars` table) only store `key`, `value`, and `stock` — no image reference.

The publish form (`client/app/seller/publish/page.js`) uses `react-dropzone` for a single image upload. The detail page (`OthersProductDetail.js`) displays `product.basename` as the sole product image.

## Goals / Non-Goals

**Goals:**
- Allow sellers to upload one image per variation when creating a product with variations
- Always require a main product image (used for listing grids and thumbnails)
- Switch the displayed image on the detail page based on the selected variation
- Clean up all image files (main + variation) on hard delete
- Keep the same image serving endpoint and URL pattern

**Non-Goals:**
- Image editing/re-upload via the VariationEditModal (only key/stock are editable there)
- File cleanup on soft delete (files remain on disk until hard delete)
- Migrating existing products (fresh start, no data to migrate)
- Multiple images per variation (one image per variation is sufficient)

## Decisions

### 1. Storage: `basename` column on `other_vars`

Add a nullable `basename TEXT` column to the `other_vars` table. Variation images use the same UUID naming scheme and same `uploads/others/` directory as product images.

**Why over a separate table**: A single column on the existing table is the simplest approach. There's a 1:1 relationship between variation and image — no need for a join table. The image serving endpoint already handles any basename from the directory, so no routing changes are needed.

### 2. Multer: `upload.fields()` instead of `upload.single()`

Change the multer middleware from `upload.single('image')` to `upload.fields([{ name: 'image', maxCount: 1 }, { name: 'variation_images', maxCount: 10 }])`.

**Why over `upload.array()`**: Using named fields keeps the main product image (`image`) cleanly separated from variation images (`variation_images`). The controller can access `req.files['image'][0]` and `req.files['variation_images']` without index-based disambiguation.

### 3. Variation-to-image mapping via array index

The `variation_images` files in the FormData are ordered to match the `variations` JSON array by index. Variation at index 0 gets `variation_images[0]`, index 1 gets `variation_images[1]`, etc.

**Why over named keys**: FormData file arrays naturally maintain insertion order. Since variations are built in the frontend as an ordered array, index-based mapping is the simplest and most reliable approach. No additional metadata or naming conventions are needed.

### 4. Image validation: same rules as main image

Each variation image goes through the same validation pipeline as the main product image: PNG/JPG/WEBP only, max 10MB, minimum 600x600px. This ensures consistent quality across all product images.

### 5. File cleanup on hard delete only

The `deleteOthersProduct` handler in `othersController.js` (hard delete) will read `others.basename` and all `other_vars.basename` values, then delete the corresponding files from disk. The soft delete in `sellerRoutes.js` is unchanged — files remain until hard delete.

**Why**: Soft-deleted products retain their data for admin review. Keeping files allows potential restoration. Hard delete is the definitive removal.

## Risks / Trade-offs

- **Orphaned files on failed creation**: If the DB insert succeeds for the product but fails mid-way through variation inserts, some image files may be written to disk without DB references. → Mitigation: Write all files first, then do all DB inserts. On DB failure, clean up written files. Use try/catch around the file-writing phase.

- **File deletion failure on hard delete**: `fs.promises.unlink` could fail (permissions, already deleted). → Mitigation: Log errors but don't block the delete operation. The DB records are the source of truth; orphaned files are a minor nuisance, not a data integrity issue.

- **Memory usage with multiple uploads**: Up to 11 images (1 main + 10 variations) in memory simultaneously via multer's memory storage. At 10MB max each, worst case is ~110MB. → Mitigation: Acceptable for the expected usage pattern. Sellers typically upload 2-5 variations with images well under 10MB.
