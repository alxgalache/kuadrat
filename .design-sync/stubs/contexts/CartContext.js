// Stub for @/contexts/CartContext (design-sync bundle only). Empty-cart defaults.
export function useCart() {
  return {
    items: [],
    cart: [],
    getTotalItems: () => 0,
    getTotalPrice: () => 0,
    animationTrigger: 0,
    addItem() {},
    removeItem() {},
    updateQuantity() {},
    clearCart() {},
    isInCart: () => false,
  }
}
export function CartProvider({ children }) {
  return children
}
export default { useCart, CartProvider }
