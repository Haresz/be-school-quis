import { createApp } from './src/app-factory.js'
import { loadEnv } from './src/config/env.js'
import { createLogger } from './src/lib/logger.js'
import { generateQuiz } from './src/services/ai/generateQuiz.js'
import { createSupabaseAiRepository } from './src/services/supabase-ai-repository.js'

const env = loadEnv()
const logger = createLogger()
const repository = createSupabaseAiRepository(env)

export const app = createApp({ env, logger, ai: { repository, generateQuiz } })
export default app
