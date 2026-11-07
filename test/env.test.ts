import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env.js'

const validEnv = {
  SUPABASE_URL: 'https://test-project.supabase.co/',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  OPENROUTER_API_KEY: 'openrouter',
  FRONTEND_ORIGINS: 'http://localhost:5173, https://quiz.example.com/',
}

describe('loadEnv', () => {
  it('memvalidasi env dan menormalkan daftar origin', () => {
    const env = loadEnv(validEnv)

    expect(env.AI_MODEL).toBe('nvidia/nemotron-3-ultra-550b-a55b:free')
    expect(env.SUPABASE_URL).toBe('https://test-project.supabase.co')
    expect(env.AI_USER_HOURLY_LIMIT).toBe(10)
    expect(env.AI_GLOBAL_DAILY_LIMIT).toBe(200)
    expect(env.PORT).toBe(3000)
    expect(env.FRONTEND_ORIGINS).toEqual(['http://localhost:5173', 'https://quiz.example.com'])
  })

  it('menerima nama key Supabase baru', () => {
    const { SUPABASE_ANON_KEY: _anon, SUPABASE_SERVICE_ROLE_KEY: _service, ...rest } = validEnv

    const env = loadEnv({
      ...rest,
      SUPABASE_PUBLISHABLE_KEY: 'publishable',
      SUPABASE_SECRET_KEY: 'secret',
    })

    expect(env.SUPABASE_ANON_KEY).toBe('publishable')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('secret')
  })

  it('gagal cepat bila env wajib tidak ada', () => {
    const { OPENROUTER_API_KEY: _ignored, ...withoutOpenRouter } = validEnv

    expect(() => loadEnv(withoutOpenRouter)).toThrow(/OPENROUTER_API_KEY/)
  })

  it('menolak wildcard pada FRONTEND_ORIGINS', () => {
    expect(() => loadEnv({ ...validEnv, FRONTEND_ORIGINS: '*' })).toThrow(/FRONTEND_ORIGINS/)
  })

  it('menolak origin dengan path', () => {
    expect(() =>
      loadEnv({ ...validEnv, FRONTEND_ORIGINS: 'https://quiz.example.com/app' }),
    ).toThrow(/FRONTEND_ORIGINS/)
  })
})
