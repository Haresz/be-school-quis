import { Hono } from 'hono'
import type { Env } from './config/env.js'
import { corsMiddleware } from './lib/cors.js'
import { AppError, errorBody } from './lib/errors.js'
import type { Logger } from './lib/logger.js'
import { requestContext } from './middleware/request-context.js'
import { createAiRoute } from './routes/ai.js'
import { healthRoute } from './routes/health.js'
import type { AiRepository } from './services/ai-repository.js'
import type { GenerateQuizFn } from './services/ai/generateQuiz.js'
import type { AppEnv } from './types.js'

export type AiDependencies = {
  repository: AiRepository
  generateQuiz: GenerateQuizFn
  now?: () => Date
}

export type AppDependencies = {
  env: Env
  logger: Logger
  ai: AiDependencies
}

export function createApp({ env, logger, ai }: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.use('*', requestContext(logger))
  app.use('*', corsMiddleware(env))

  app.onError((error, c) => {
    const requestId = c.get('requestId')
    const startedAt = c.get('startedAt')
    const durationMs = typeof startedAt === 'number' ? Date.now() - startedAt : undefined
    const userId = c.get('user')?.id ?? null

    if (error instanceof AppError) {
      if (!c.get('requestLogged')) {
        c.set('requestLogged', true)
        logger.warn({
          requestId,
          method: c.req.method,
          path: c.req.path,
          status: error.status,
          durationMs,
          userId,
          code: error.code,
        })
      }

      return c.json(errorBody(error.code, error.message), error.status)
    }

    if (!c.get('requestLogged')) {
      c.set('requestLogged', true)
      logger.error({
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: 500,
        durationMs,
        userId,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      })
    }

    return c.json(errorBody('internal_error'), 500)
  })

  app.notFound((c) => c.json(errorBody('not_found'), 404))

  app.route('/', healthRoute)
  app.route(
    '/ai',
    createAiRoute({
      env,
      logger,
      repository: ai.repository,
      generateQuiz: ai.generateQuiz,
      now: ai.now,
    }),
  )

  return app
}
