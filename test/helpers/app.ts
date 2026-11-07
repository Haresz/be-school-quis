import { createApp } from '../../src/app-factory.js'
import { silentLogger } from '../../src/lib/logger.js'
import type { AiRepository } from '../../src/services/ai-repository.js'
import type { GenerateQuizFn } from '../../src/services/ai/generateQuiz.js'
import { testEnv } from './env.js'

export type TestAppOptions = {
  repository: AiRepository
  generateQuiz: GenerateQuizFn
  now?: () => Date
}

export function createTestApp({ repository, generateQuiz, now }: TestAppOptions) {
  return createApp({
    env: testEnv,
    logger: silentLogger,
    ai: { repository, generateQuiz, now },
  })
}
