// Stub for next/navigation used only by the design-sync bundle. Hooks return
// inert defaults so client components that read the router/path render.
export function useRouter() {
  return { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} }
}
export function usePathname() {
  return '/'
}
export function useSearchParams() {
  return new URLSearchParams()
}
export function useParams() {
  return {}
}
export function useSelectedLayoutSegment() {
  return null
}
export function useSelectedLayoutSegments() {
  return []
}
export function redirect() {}
export function permanentRedirect() {}
export function notFound() {}
export const RedirectType = { push: 'push', replace: 'replace' }
