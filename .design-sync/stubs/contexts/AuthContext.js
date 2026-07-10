// Stub for @/contexts/AuthContext (design-sync bundle only). Logged-out defaults
// so components that read auth render their public state.
export function useAuth() {
  return { isAuthenticated: false, user: null, loading: false, login() {}, logout() {}, register() {}, refresh() {} }
}
export function AuthProvider({ children }) {
  return children
}
export default { useAuth, AuthProvider }
