import { Hono } from 'hono'
import type { AppEnv } from '../types.js'

export const healthRoute = new Hono<AppEnv>()

healthRoute.get('/health', (c) => c.json({ ok: true }))
