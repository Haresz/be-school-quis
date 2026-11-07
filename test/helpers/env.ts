import type { Env } from '../../src/config/env.js'

export const testEnv: Env = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  OPENROUTER_API_KEY: 'test-openrouter-api-key',
  AI_MODEL: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  OPENROUTER_SITE_URL: 'https://quiz.example.com',
  OPENROUTER_APP_NAME: 'school-quiz-test',
  FRONTEND_ORIGINS: ['http://localhost:5173'],
  AI_USER_HOURLY_LIMIT: 10,
  AI_GLOBAL_DAILY_LIMIT: 200,
  PORT: 3000,
}
