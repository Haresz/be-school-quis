import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import type { Env } from '../config/env.js'
import { AppError, errorBody } from '../lib/errors.js'
import type { Logger } from '../lib/logger.js'
import { authMiddleware } from '../middleware/auth.js'
import { AiError, type GenerateQuizFn, type SaveQuizPayload } from '../services/ai/generateQuiz.js'
import type { AiRepository, GenerationUpdate } from '../services/ai-repository.js'
import { checkRateLimit } from '../services/rate-limit.js'
import type { AppEnv } from '../types.js'

const MAX_BODY_BYTES = 10 * 1024
const MAX_RAW_OUTPUT_IN_DB = 5000

const generateQuizRequestSchema = z.object({
  material_id: z.string().uuid(),
  prompt: z.string().trim().max(500).default(''),
  num_questions: z.number().int().min(1).max(20),
  mix: z.enum(['mc_only', 'text_only', 'mixed']).default('mixed'),
  difficulty: z.enum(['mudah', 'sedang', 'sulit']).default('sedang'),
})

export type AiRouteDependencies = {
  env: Env
  logger: Logger
  repository: AiRepository
  generateQuiz: GenerateQuizFn
  now?: () => Date
}

export function createAiRoute({
  env,
  logger,
  repository,
  generateQuiz,
  now = () => new Date(),
}: AiRouteDependencies): Hono<AppEnv> {
  const route = new Hono<AppEnv>()

  route.post(
    '/generate-quiz',
    authMiddleware(repository),
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(errorBody('invalid_request'), 400),
    }),
    async (c) => {
      const user = c.get('user')
      const jwt = c.get('jwt')
      if (!user || !jwt) throw new AppError(401, 'unauthorized')

      const rawBody = await c.req.json<unknown>().catch(() => {
        throw new AppError(400, 'invalid_request')
      })
      const parsed = generateQuizRequestSchema.safeParse(rawBody)
      if (!parsed.success) throw new AppError(400, 'invalid_request')
      const body = parsed.data

      const material = await repository.getActiveMaterial(jwt, body.material_id)
      if (!material) throw new AppError(404, 'material_not_found')

      const rateLimit = await checkRateLimit({
        repository,
        jwt,
        userId: user.id,
        userLimit: env.AI_USER_HOURLY_LIMIT,
        globalLimit: env.AI_GLOBAL_DAILY_LIMIT,
        now: now(),
      })

      if (rateLimit.limited) {
        c.header('Retry-After', String(rateLimit.retryAfterSeconds))
        throw new AppError(429, rateLimit.kind === 'user' ? 'rate_limited' : 'ai_capacity_reached')
      }

      const generation = await repository.insertPendingGeneration(jwt, {
        userId: user.id,
        materialId: material.id,
        prompt: body.prompt,
        model: env.AI_MODEL,
      })

      try {
        const result = await generateQuiz(
          {
            materialId: material.id,
            material: {
              subject: material.subject,
              grade: material.grade,
              topic: material.topic,
              promptContext: material.promptContext,
            },
            userPrompt: body.prompt,
            numQuestions: body.num_questions,
            mix: body.mix,
            difficulty: body.difficulty,
          },
          {
            apiKey: env.OPENROUTER_API_KEY,
            model: env.AI_MODEL,
            siteUrl: env.OPENROUTER_SITE_URL,
            appName: env.OPENROUTER_APP_NAME,
          },
        )

        try {
          await repository.updateGeneration({
            id: generation.id,
            status: 'success',
            model: result.meta.model,
            output: result.payload,
          })
        } catch (error) {
          logger.error({
            requestId: c.get('requestId'),
            userId: user.id,
            generationId: generation.id,
            message: 'gagal_menyimpan_hasil_ai',
            error: describeError(error),
          })
        }

        return c.json({ generation_id: generation.id, draft: result.payload }, 200)
      } catch (error) {
        await recordFailure(
          repository,
          logger,
          {
            requestId: c.get('requestId'),
            userId: user.id,
            generationId: generation.id,
            model: env.AI_MODEL,
          },
          error,
        )

        throw mapAiError(error)
      }
    },
  )

  return route
}

function mapAiError(error: unknown): AppError {
  if (!(error instanceof AiError)) return new AppError(500, 'internal_error')

  switch (error.kind) {
    case 'bad_output':
      return new AppError(502, 'ai_bad_output')
    case 'blocked':
      return new AppError(422, 'ai_blocked')
    case 'timeout':
      return new AppError(504, 'ai_timeout')
    case 'provider':
      switch (error.status) {
        case 402:
        case 429:
          return new AppError(503, 'ai_quota_exceeded')
        case 403:
          return new AppError(422, 'ai_blocked')
        case 408:
        case 524:
          return new AppError(504, 'ai_timeout')
        default:
          return new AppError(502, 'ai_unavailable')
      }
    case 'config':
      return new AppError(500, 'internal_error')
  }
}

async function recordFailure(
  repository: AiRepository,
  logger: Logger,
  context: {
    requestId: string
    userId: string
    generationId: string
    model: string
  },
  error: unknown,
): Promise<void> {
  logger.error({
    requestId: context.requestId,
    userId: context.userId,
    generationId: context.generationId,
    aiError: aiErrorInfo(error),
    error: describeError(error),
  })

  try {
    await repository.updateGeneration(failureUpdate(context.generationId, context.model, error))
  } catch (updateError) {
    logger.error({
      requestId: context.requestId,
      userId: context.userId,
      generationId: context.generationId,
      message: 'gagal_menyimpan_kegagalan_ai',
      error: describeError(updateError),
    })
  }
}

function failureUpdate(id: string, model: string, error: unknown): GenerationUpdate {
  if (error instanceof AiError && error.kind === 'bad_output') {
    return {
      id,
      status: 'invalid_json',
      model,
      output: {
        error: 'bad_output',
        raw: (error.rawOutput ?? '').slice(0, MAX_RAW_OUTPUT_IN_DB),
      },
    }
  }

  return {
    id,
    status: 'error',
    model,
    output: { error: error instanceof AiError ? error.kind : 'unexpected' },
  }
}

function aiErrorInfo(error: unknown): { kind: string; status: number | null } {
  if (error instanceof AiError) return { kind: error.kind, status: error.status ?? null }
  return { kind: 'unexpected', status: null }
}

function describeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message }
  return { name: 'UnknownError', message: String(error) }
}

export type GenerateQuizResponse = {
  generation_id: string
  draft: SaveQuizPayload
}
