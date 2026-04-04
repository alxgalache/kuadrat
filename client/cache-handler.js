/**
 * Custom in-memory ISR cache handler for Next.js.
 *
 * The production Docker container runs with `read_only: true` for security
 * (protection against Next.js filesystem-write exploits). The default cache
 * handler writes ISR page updates to `.next/server/`, which is read-only.
 *
 * This handler stores all ISR cache entries in process memory instead,
 * allowing Incremental Static Regeneration to work without filesystem writes.
 *
 * Trade-off: cache is lost on container restart (first request to each ISR
 * page triggers a dynamic render; subsequent requests serve from cache).
 */
const cache = new Map()

module.exports = class CacheHandler {
  constructor(options) {
    this.options = options
  }

  async get(key) {
    return cache.get(key) ?? null
  }

  async set(key, data, ctx) {
    cache.set(key, {
      value: data,
      lastModified: Date.now(),
      tags: ctx?.tags ?? [],
    })
  }

  async revalidateTag(tags) {
    const tagList = Array.isArray(tags) ? tags : [tags]
    for (const [key, entry] of cache) {
      if (entry.tags?.some(t => tagList.includes(t))) {
        cache.delete(key)
      }
    }
  }
}
