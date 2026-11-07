import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'
import type { Env } from '../config/env.js'
import type { AppEnv } from '../types.js'

export function corsMiddleware(env: Env): MiddlewareHandler<AppEnv> {
  const allowedOrigins = new Set(env.FRONTEND_ORIGINS)

  return cors({
    origin: (origin) => (origin && allowedOrigins.has(origin) ? origin : undefined),
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 86_400,
  })
}
