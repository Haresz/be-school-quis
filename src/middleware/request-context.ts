import type { MiddlewareHandler } from 'hono'
import type { Logger } from '../lib/logger.js'
import type { AppEnv } from '../types.js'

export function requestContext(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = crypto.randomUUID()

    c.set('requestId', requestId)
    c.set('startedAt', Date.now())
    c.set('requestLogged', false)
    c.header('x-request-id', requestId)

    await next()

    if (!c.get('requestLogged')) {
      c.set('requestLogged', true)
      logger.info({
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - c.get('startedAt'),
        userId: c.get('user')?.id ?? null,
      })
    }
  }
}
