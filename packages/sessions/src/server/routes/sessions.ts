import { Hono } from 'hono'
import type { DB } from '../db/repository.js'
import {
  getSessions,
  getSessionById,
  getSessionMessages,
  getSessionToolCalls,
  getSessionFileChanges,
  getSessionSubagents,
} from '../db/repository.js'
import { readJsonlFile } from '../../core/jsonl-reader.js'

export function createSessionsRouter(db: DB) {
  const app = new Hono()

  // GET /api/sessions
  app.get('/', async (c) => {
    const projectId = c.req.query('project') ?? undefined
    const search = c.req.query('search') ?? undefined
    const sortBy = (c.req.query('sort') as 'date' | 'cost' | 'messages') ?? 'date'
    const sortOrder = (c.req.query('order') as 'asc' | 'desc') ?? 'desc'
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200)
    const offset = parseInt(c.req.query('offset') ?? '0')

    const sessions = await getSessions(db, {
      projectId,
      search,
      sortBy,
      sortOrder,
      limit,
      offset,
    })

    return c.json({ success: true, data: sessions, meta: { limit, offset } })
  })

  // GET /api/sessions/:id
  app.get('/:id', async (c) => {
    const session = await getSessionById(db, c.req.param('id'))
    if (!session) return c.json({ success: false, error: 'Not found' }, 404)
    return c.json({ success: true, data: session })
  })

  // GET /api/sessions/:id/messages
  app.get('/:id/messages', async (c) => {
    const id = c.req.param('id')
    const type = c.req.query('type') ?? undefined
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100'), 500)
    const offset = parseInt(c.req.query('offset') ?? '0')

    const session = await getSessionById(db, id)
    if (!session) return c.json({ success: false, error: 'Not found' }, 404)

    const msgs = await getSessionMessages(db, id, { type, limit, offset })
    return c.json({ success: true, data: msgs, meta: { limit, offset } })
  })

  // GET /api/sessions/:id/messages/raw
  app.get('/:id/messages/raw', async (c) => {
    const id = c.req.param('id')
    const fromLine = parseInt(c.req.query('from') ?? '1')
    const toLine = parseInt(c.req.query('to') ?? '50')

    const session = await getSessionById(db, id)
    if (!session) return c.json({ success: false, error: 'Not found' }, 404)

    const rawLines: Array<{ lineNo: number; content: unknown }> = []

    for await (const { entry, lineNo } of readJsonlFile(session.filePath)) {
      if (lineNo < fromLine) continue
      if (lineNo > toLine) break
      rawLines.push({ lineNo, content: entry })
    }

    return c.json({ success: true, data: rawLines })
  })

  // GET /api/sessions/:id/tools
  app.get('/:id/tools', async (c) => {
    const id = c.req.param('id')
    const session = await getSessionById(db, id)
    if (!session) return c.json({ success: false, error: 'Not found' }, 404)

    const tools = await getSessionToolCalls(db, id)
    return c.json({ success: true, data: tools })
  })

  // GET /api/sessions/:id/files
  app.get('/:id/files', async (c) => {
    const id = c.req.param('id')
    const session = await getSessionById(db, id)
    if (!session) return c.json({ success: false, error: 'Not found' }, 404)

    const files = await getSessionFileChanges(db, id)
    return c.json({ success: true, data: files })
  })

  // GET /api/sessions/:id/subagents
  app.get('/:id/subagents', async (c) => {
    const id = c.req.param('id')
    const session = await getSessionById(db, id)
    if (!session) return c.json({ success: false, error: 'Not found' }, 404)

    const agents = await getSessionSubagents(db, id)
    return c.json({ success: true, data: agents })
  })

  return app
}
