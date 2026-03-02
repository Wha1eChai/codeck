import { Hono } from 'hono'
import { desc, sql } from 'drizzle-orm'
import type { DB } from '../db/repository.js'
import { getOverviewStats, getDailyStats } from '../db/repository.js'
import * as schema from '../db/schema.js'

export function createStatsRouter(db: DB) {
  const app = new Hono()

  // GET /api/stats/overview
  app.get('/overview', async (c) => {
    const stats = await getOverviewStats(db)
    return c.json({ success: true, data: stats })
  })

  // GET /api/stats/models
  app.get('/models', async (c) => {
    const rows = await db
      .select({
        model: schema.sessions.modelPrimary,
        sessionCount: sql<number>`count(*)`,
        totalInputTokens: sql<number>`sum(total_input_tokens)`,
        totalOutputTokens: sql<number>`sum(total_output_tokens)`,
        totalCostUsd: sql<number>`sum(estimated_cost_usd)`,
      })
      .from(schema.sessions)
      .where(sql`model_primary IS NOT NULL`)
      .groupBy(schema.sessions.modelPrimary)
      .orderBy(desc(sql`sum(estimated_cost_usd)`))

    return c.json({ success: true, data: rows })
  })

  // GET /api/stats/tools
  app.get('/tools', async (c) => {
    const rows = await db
      .select({
        toolName: schema.toolCalls.toolName,
        totalCalls: sql<number>`count(*)`,
        successCount: sql<number>`sum(CASE WHEN success = 1 THEN 1 ELSE 0 END)`,
        failureCount: sql<number>`sum(CASE WHEN success = 0 THEN 1 ELSE 0 END)`,
      })
      .from(schema.toolCalls)
      .groupBy(schema.toolCalls.toolName)
      .orderBy(desc(sql`count(*)`))

    return c.json({ success: true, data: rows })
  })

  // GET /api/stats/daily
  app.get('/daily', async (c) => {
    const fromParam = c.req.query('from')
    const toParam = c.req.query('to')

    const now = Date.now()
    const fromMs = fromParam ? new Date(fromParam).getTime() : now - 30 * 24 * 60 * 60 * 1000
    const toMs = toParam ? new Date(toParam).getTime() : now

    const rows = await getDailyStats(db, fromMs, toMs)
    return c.json({ success: true, data: rows })
  })

  return app
}
