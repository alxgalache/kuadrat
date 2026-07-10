import React from 'react'

// Stub for next/link used only by the design-sync bundle. Renders a plain
// anchor and drops Next-specific props so they never reach the DOM.
const Link = React.forwardRef(function Link(
  { href, children, prefetch, replace, scroll, shallow, locale, passHref, legacyBehavior, onNavigate, ...rest },
  ref,
) {
  const url = typeof href === 'string' ? href : (href && (href.pathname || href.href)) || '#'
  return (
    <a ref={ref} href={url} {...rest}>
      {children}
    </a>
  )
})

export default Link
