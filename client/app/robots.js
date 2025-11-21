const WEB_APP_HIDDEN = process.env.WEB_APP_HIDDEN === 'true' || process.env.WEB_APP_HIDDEN === '1'

// Dynamic robots.txt configuration. When WEB_APP_HIDDEN is enabled, we
// instruct crawlers not to index or follow any paths. Otherwise, we fall
// back to a permissive configuration.
export default function robots() {
  if (WEB_APP_HIDDEN) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
  }
}
