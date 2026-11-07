import { z } from 'zod'

function normalizeOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => origin.replace(/\/$/, ''))
}

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value
  } catch {
    return false
  }
}

function normalizeSupabaseKeys(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return {
    ...source,
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY || source.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY || source.SUPABASE_SECRET_KEY,
  }
}

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SUPABASE_URL: z
    .string()
    .transform((value) => value.replace(/\/$/, ''))
    .refine(isHttpOrigin, 'SUPABASE_URL harus berupa URL http(s) valid'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY wajib diisi'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY wajib diisi'),
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY wajib diisi'),
  AI_MODEL: z.string().min(1).default('nvidia/nemotron-3-ultra-550b-a55b:free'),
  OPENROUTER_SITE_URL: z.string().trim().optional(),
  OPENROUTER_APP_NAME: z.string().trim().optional(),
  FRONTEND_ORIGINS: z
    .string()
    .min(1, 'FRONTEND_ORIGINS wajib diisi')
    .transform(normalizeOrigins)
    .refine((origins) => origins.length > 0, 'FRONTEND_ORIGINS tidak boleh kosong')
    .refine(
      (origins) => origins.every(isHttpOrigin),
      'Setiap origin harus URL http(s) tanpa path dan tanpa wildcard',
    ),
  AI_USER_HOURLY_LIMIT: z.coerce.number().int().positive().default(10),
  AI_GLOBAL_DAILY_LIMIT: z.coerce.number().int().positive().default(200),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(normalizeSupabaseKeys(source))

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(env)'
        return `${path}: ${issue.message}`
      })
      .join('; ')

    throw new Error(`Konfigurasi environment tidak valid: ${details}`)
  }

  return result.data
}
