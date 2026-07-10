// Stub for @/lib/api (design-sync bundle only). The real client builds backend
// image URLs and exposes network API objects — neither reachable in the design
// renderer. Image helpers return stable placeholder photos (seeded by basename)
// so gallery/product previews look like a real gallery; API objects are inert.
const placeholder = (seed) =>
  'https://picsum.photos/seed/' + encodeURIComponent(String(seed || 'kuadrat')) + '/800/1000'

export const getProductImageUrl = (basename) => placeholder(basename)
export const getArtImageUrl = (basename) => placeholder(basename)
export const getOthersImageUrl = (basename) => placeholder(basename)
export const getAuthorImageUrl = (basename) => placeholder(basename)

const asyncEmpty = async () => ({ data: [] })
export const adminAPI = { postalCodes: { search: asyncEmpty, list: asyncEmpty } }

export default { getProductImageUrl, getArtImageUrl, getOthersImageUrl, getAuthorImageUrl, adminAPI }
