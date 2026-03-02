import { Hono } from 'hono'
import type { DB } from '../db/repository.js'
import { getHistoryEntries, searchHistoryEntries } from '../db/repository.js'

/**
 * /api/history — returns HistoryEntry[] compatible with cc-desk's HistoryEntry type.
 *
 * GET /api/history          → all sessions, sorted by lastActiveAt desc
 * GET /api/history/search   → ?q=<query> filtered by title/summary/projectPath
 */
export function createHistoryRouter(db: DB): Hono {
  const router = new Hono()

  // GET /api/history
  router.get('/', async (c) => {
    const entries = await getHistoryEntries(db)
    return c.json(entries)
  })

  // GET /api/history/search?q=...
  router.get('/search', async (c) => {
    const q = c.req.query('q')
    if (!q || q.trim().length === 0) {
      return c.json({ error: 'Missing or empty query parameter "q"' }, 400)
    }
    const entries = await searchHistoryEntries(db, q.trim())
    return c.json(entries)
  })

  return router
}
