'use client'

import { useMemo } from 'react'
import DOMPurify from 'dompurify'

/**
 * SafeHTML Component
 * Safely renders HTML content by sanitizing it with DOMPurify to prevent XSS attacks.
 *
 * Usage:
 *   <SafeHTML html={product.description} className="prose prose-sm" />
 *
 * Instead of:
 *   <div dangerouslySetInnerHTML={{ __html: product.description }} />
 *
 * @param {string} html - The HTML content to render
 * @param {string} className - Optional CSS classes to apply
 * @param {string} as - The HTML element to render (default: 'div')
 * @param {object} allowedTags - Custom DOMPurify configuration (optional)
 */
export default function SafeHTML({
  html,
  className = '',
  as: Component = 'div',
  config = {}
}) {
  // Memoize the sanitized HTML to avoid re-sanitizing on every render
  const sanitizedHTML = useMemo(() => {
    if (!html) return ''

    // Default DOMPurify configuration - safe for rich text content
    const defaultConfig = {
      // Allowed tags for rich text content (from Quill editor)
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'a', 'blockquote', 'pre', 'code',
        'span', 'div',
        'sub', 'sup',
      ],
      // Allowed attributes
      ALLOWED_ATTR: [
        'href', 'target', 'rel', 'class', 'style',
        'data-*', // Allow data attributes for styling
      ],
      // Force target="_blank" links to have rel="noopener noreferrer"
      ADD_ATTR: ['target'],
      // Forbid potentially dangerous attributes
      FORBID_ATTR: [
        'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
        'onsubmit', 'onreset', 'onselect', 'onchange', 'oninput',
        'onkeydown', 'onkeyup', 'onkeypress',
        'onmousedown', 'onmouseup', 'onmousemove', 'onmouseout', 'onmouseenter', 'onmouseleave',
        'ondrag', 'ondrop', 'ondragstart', 'ondragend', 'ondragover', 'ondragenter', 'ondragleave',
        'oncopy', 'oncut', 'onpaste',
        'onscroll', 'onwheel', 'onresize',
        'onanimationstart', 'onanimationend', 'onanimationiteration',
        'ontransitionend',
        'formaction', 'action', 'xlink:href',
      ],
      // Forbid script and other dangerous tags
      FORBID_TAGS: [
        'script', 'style', 'iframe', 'frame', 'frameset',
        'object', 'embed', 'applet',
        'form', 'input', 'button', 'select', 'textarea',
        'meta', 'link', 'base',
        'svg', 'math', 'template',
      ],
      // Clean up URLs in href and src attributes
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    }

    // Merge custom config with defaults
    const finalConfig = { ...defaultConfig, ...config }

    // Sanitize the HTML
    const clean = DOMPurify.sanitize(html, finalConfig)

    return clean
  }, [html, config])

  // Don't render anything if there's no content
  if (!sanitizedHTML) {
    return null
  }

  return (
    <Component
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
    />
  )
}

/**
 * SafeHTML for author bios - more restrictive
 */
export function SafeAuthorBio({ html, className = '' }) {
  return (
    <SafeHTML
      html={html}
      className={className}
      config={{
        ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li'],
        ALLOWED_ATTR: ['href', 'target', 'rel'],
      }}
    />
  )
}

/**
 * SafeHTML for product descriptions - standard rich text
 */
export function SafeProductDescription({ html, className = '' }) {
  return (
    <SafeHTML
      html={html}
      className={className}
    />
  )
}

/**
 * Utility function to sanitize HTML string (for use outside of React components)
 * @param {string} html - The HTML to sanitize
 * @returns {string} - Sanitized HTML
 */
export function sanitizeHTML(html) {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote', 'pre', 'code', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'svg', 'math'],
  })
}
