import { Hono } from 'hono'
import type { DB } from '../db/repository.js'
import { getProjects } from '../db/repository.js'

export function createProjectsRouter(db: DB) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projects = await getProjects(db)
    return c.json({ success: true, data: projects })
  })

  return app
}
