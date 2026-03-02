import { Hono } from 'hono'
import type { DB } from '../db/repository.js'
import { incrementalSync } from '../sync/incremental.js'

let syncInProgress = false

export function createSyncRouter(db: DB) {
  const app = new Hono()

  // POST /api/sync — incremental sync
  app.post('/', async (c) => {
    if (syncInProgress) {
      return c.json({ success: false, error: 'Sync already in progress' }, 409)
    }

    syncInProgress = true
    try {
      const result = await incrementalSync(db)
      return c.json({ success: true, data: result })
    } finally {
      syncInProgress = false
    }
  })

  // POST /api/sync/full — force full re-parse of all sessions
  app.post('/full', async (c) => {
    if (syncInProgress) {
      return c.json({ success: false, error: 'Sync already in progress' }, 409)
    }

    syncInProgress = true
    try {
      const result = await incrementalSync(db, true)
      return c.json({ success: true, data: result })
    } finally {
      syncInProgress = false
    }
  })

  return app
}
