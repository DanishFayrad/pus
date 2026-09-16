import MenuItem from '../models/MenuItem'
import Product from '../models/Product'

/**
 * Returns all real distinct categories dynamically from the database.
 * Merges distinct categories from both:
 * 1. Product collection (live products catalog)
 * 2. MenuItem collection (live restaurant menu)
 *
 * NO fake or hardcoded mock categories are added.
 * All categories come 100% directly from MongoDB.
 */
export async function getUnifiedMenuCategories(): Promise<string[]> {
  try {
    const [menuCats, prodCats] = await Promise.all([
      MenuItem.distinct('category', { enabled: true }).catch(() => []),
      Product.distinct('category').catch(() => []),
    ])

    const set = new Set<string>()
    menuCats.forEach((c: any) => {
      if (c && typeof c === 'string' && c.trim()) {
        set.add(c.trim())
      }
    })
    prodCats.forEach((c: any) => {
      if (c && typeof c === 'string' && c.trim()) {
        set.add(c.trim())
      }
    })

    // Case-insensitive deduplication (prefer uppercase/titlecase if duplicate exists)
    const map = new Map<string, string>()
    Array.from(set).forEach((c) => {
      const lower = c.toLowerCase()
      if (!map.has(lower)) {
        map.set(lower, c)
      } else {
        const existing = map.get(lower)!
        if (existing === existing.toLowerCase() && c !== c.toLowerCase()) {
          map.set(lower, c)
        }
      }
    })

    const categories = Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )

    return categories
  } catch (e) {
    console.error('getUnifiedMenuCategories failed:', e)
    return []
  }
}
