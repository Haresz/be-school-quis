import type { MiddlewareHandler } from 'hono'
import { AppError } from '../lib/errors.js'
import type { AiRepository } from '../services/ai-repository.js'
import type { AppEnv } from '../types.js'

const BEARER = /^Bearer\s+(.+)$/i

export function authMiddleware(
  repository: Pick<AiRepository, 'getUser'>,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const match = BEARER.exec(c.req.header('authorization') ?? '')
    const token = match?.[1]?.trim()

    if (!token) throw new AppError(401, 'unauthorized')

    const user = await repository.getUser(token)
    if (!user) throw new AppError(401, 'unauthorized')

    c.set('jwt', token)
    c.set('user', user)

    await next()
  }
}
