import type { AiRepository } from './ai-repository.js'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export type RateLimitResult =
  { limited: false } | { limited: true; kind: 'user' | 'global'; retryAfterSeconds: number }

export type CheckRateLimitOptions = {
  repository: Pick<
    AiRepository,
    'countUserGenerations' | 'oldestUserGenerationAt' | 'countAllGenerations' | 'oldestGenerationAt'
  >
  jwt: string
  userId: string
  userLimit: number
  globalLimit: number
  now: Date
}

export async function checkRateLimit(options: CheckRateLimitOptions): Promise<RateLimitResult> {
  const { repository, jwt, userId, userLimit, globalLimit, now } = options

  const userSince = new Date(now.getTime() - HOUR_MS)
  const userCount = await repository.countUserGenerations(jwt, userId, userSince)

  if (userCount >= userLimit) {
    const oldest = await repository.oldestUserGenerationAt(jwt, userId, userSince)
    return {
      limited: true,
      kind: 'user',
      retryAfterSeconds: retryAfter(oldest, now, HOUR_MS),
    }
  }

  const globalSince = new Date(now.getTime() - DAY_MS)
  const globalCount = await repository.countAllGenerations(globalSince)

  if (globalCount >= globalLimit) {
    const oldest = await repository.oldestGenerationAt(globalSince)
    return {
      limited: true,
      kind: 'global',
      retryAfterSeconds: retryAfter(oldest, now, DAY_MS),
    }
  }

  return { limited: false }
}

function retryAfter(oldest: Date | null, now: Date, windowMs: number): number {
  if (!oldest) return Math.ceil(windowMs / 1000)

  const elapsed = Math.max(0, now.getTime() - oldest.getTime())
  return Math.max(1, Math.ceil((windowMs - elapsed) / 1000))
}
