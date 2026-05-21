'use client'

import DOMPurify from 'dompurify'

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a']
const ALLOWED_ATTR = ['href', 'target', 'rel']

export default function CoaDescription({ html }) {
  if (!html) return null
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
  return (
    <div
      className="text-sm text-gray-600 leading-relaxed [&_p]:mb-3 [&_p:last-child]:mb-0
                 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4
                 [&_li]:mb-1 [&_strong]:font-semibold [&_em]:italic"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
