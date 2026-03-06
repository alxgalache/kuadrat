## 1. Square Product Images

- [x] 1.1 Update image container and Image props in `client/app/galeria/p/[id]/ArtProductDetail.js` (lines 180-191): change container div to `aspect-square w-full overflow-hidden rounded-lg bg-gray-200 relative`, change Image to use `fill` + `object-cover` (remove `width={0}`, `height={0}`, `style`, change `object-contain` to `object-cover`)
- [x] 1.2 Update image container and Image props in `client/app/tienda/p/[id]/OthersProductDetail.js` (lines 204-215): same changes as 1.1

## 2. Black Checkboxes

- [x] 2.1 Add `accent-black` to the three checkbox classNames in `client/app/seller/publish/page.js` (lines 509, 524, 541): change from `size-4 rounded border-gray-300 text-black focus:ring-black` to `size-4 rounded border-gray-300 text-black accent-black focus:ring-black`
