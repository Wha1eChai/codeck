import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { createDb } from './db/repository.js'
import { createProjectsRouter } from './routes/projects.js'
import { createSessionsRouter } from './routes/sessions.js'
import { createStatsRouter } from './routes/stats.js'
import { createSyncRouter } from './routes/sync.js'
import { createHistoryRouter } from './routes/history.js'

const PORT = parseInt(process.env.PORT ?? '3579')
const DB_PATH = process.env.DB_PATH ?? undefined

const db = createDb(DB_PATH)

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', cors({ origin: '*' }))

// Routes
app.route('/api/projects', createProjectsRouter(db))
app.route('/api/sessions', createSessionsRouter(db))
app.route('/api/stats', createStatsRouter(db))
app.route('/api/sync', createSyncRouter(db))
app.route('/api/history', createHistoryRouter(db))

// Lightweight ping — used by Electron to detect server readiness
app.get('/api/ping', (c) => c.json({ ok: true }))

// Health check (detailed)
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Start server
console.log(`Starting cc-desk-sessions server on port ${PORT}`)
console.log(`Database: ${DB_PATH ?? 'data/sessions.db (default)'}`)

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
