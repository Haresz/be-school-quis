import { describe, expect, it } from 'vitest'
import { AiError } from '../../src/services/ai/generateQuiz.js'
import { testEnv } from '../helpers/env.js'
import { createTestApp } from '../helpers/app.js'
import {
  createFakeRepository,
  createGenerateQuizMock,
  defaultGenerateResult,
  defaultMaterial,
  defaultUser,
} from '../helpers/fakes.js'

const validBody = {
  material_id: defaultMaterial.id,
  prompt: 'fokus soal cerita',
  num_questions: 1,
  mix: 'mixed',
  difficulty: 'sedang',
}

function postGenerate(
  app: ReturnType<typeof createTestApp>,
  options: { body?: unknown; token?: string | null; rawBody?: string } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token !== null) headers.authorization = `Bearer ${options.token ?? 'valid-token'}`

  return app.request('/ai/generate-quiz', {
    method: 'POST',
    headers,
    body: options.rawBody ?? JSON.stringify(options.body ?? validBody),
  })
}

describe('POST /ai/generate-quiz', () => {
  it('menolak permintaan tanpa token', async () => {
    const { repository } = createFakeRepository()
    const app = createTestApp({ repository, generateQuiz: createGenerateQuizMock() })

    const response = await postGenerate(app, { token: null })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthorized',
        message: 'Token autentikasi tidak valid atau tidak ada.',
      },
    })
    expect(repository.getUser).not.toHaveBeenCalled()
  })

  it('menolak token yang tidak valid', async () => {
    const { repository } = createFakeRepository({ user: null })
    const app = createTestApp({ repository, generateQuiz: createGenerateQuizMock() })

    const response = await postGenerate(app)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'unauthorized' },
    })
  })

  it('menolak body yang tidak valid', async () => {
    const { repository } = createFakeRepository()
    const app = createTestApp({ repository, generateQuiz: createGenerateQuizMock() })

    const response = await postGenerate(app, {
      body: { ...validBody, num_questions: 0 },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_request' },
    })
    expect(repository.getActiveMaterial).not.toHaveBeenCalled()
  })

  it('menolak body yang melebihi 10 KB', async () => {
    const { repository } = createFakeRepository()
    const app = createTestApp({ repository, generateQuiz: createGenerateQuizMock() })

    const response = await postGenerate(app, {
      body: { ...validBody, prompt: 'x'.repeat(11 * 1024) },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_request' },
    })
    expect(repository.getActiveMaterial).not.toHaveBeenCalled()
  })

  it('mengembalikan 404 bila materi tidak ditemukan atau tidak aktif', async () => {
    const { repository } = createFakeRepository({ material: null })
    const app = createTestApp({ repository, generateQuiz: createGenerateQuizMock() })

    const response = await postGenerate(app)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'material_not_found' },
    })
  })

  it('membatasi user yang sudah mencapai kuota per jam', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z')
    const { repository, state } = createFakeRepository({
      userCount: testEnv.AI_USER_HOURLY_LIMIT,
      userOldestAt: new Date(now.getTime() - 30 * 60 * 1000),
    })
    const app = createTestApp({
      repository,
      generateQuiz: createGenerateQuizMock(),
      now: () => now,
    })

    const response = await postGenerate(app)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('1800')
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'rate_limited' },
    })
    expect(state.inserted).toHaveLength(0)
  })

  it('membatasi permintaan ketika kuota global harian tercapai', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z')
    const { repository, state } = createFakeRepository({
      globalCount: testEnv.AI_GLOBAL_DAILY_LIMIT,
      globalOldestAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
    })
    const app = createTestApp({
      repository,
      generateQuiz: createGenerateQuizMock(),
      now: () => now,
    })

    const response = await postGenerate(app)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('43200')
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ai_capacity_reached' },
    })
    expect(state.inserted).toHaveLength(0)
  })

  it('membuat baris pending, memanggil AI, lalu menyimpan hasil sukses', async () => {
    const { repository, state } = createFakeRepository()
    const generateQuiz = createGenerateQuizMock()
    const app = createTestApp({ repository, generateQuiz })

    const response = await postGenerate(app)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      generation_id: 'generation-1',
      draft: defaultGenerateResult.payload,
    })

    expect(state.inserted).toEqual([
      {
        userId: defaultUser.id,
        materialId: defaultMaterial.id,
        prompt: validBody.prompt,
        model: testEnv.AI_MODEL,
      },
    ])
    expect(generateQuiz).toHaveBeenCalledWith(
      {
        materialId: defaultMaterial.id,
        material: {
          subject: defaultMaterial.subject,
          grade: defaultMaterial.grade,
          topic: defaultMaterial.topic,
          promptContext: defaultMaterial.promptContext,
        },
        userPrompt: validBody.prompt,
        numQuestions: validBody.num_questions,
        mix: validBody.mix,
        difficulty: validBody.difficulty,
      },
      {
        apiKey: testEnv.OPENROUTER_API_KEY,
        model: testEnv.AI_MODEL,
        siteUrl: testEnv.OPENROUTER_SITE_URL,
        appName: testEnv.OPENROUTER_APP_NAME,
      },
    )
    expect(state.updates).toEqual([
      {
        id: 'generation-1',
        status: 'success',
        model: defaultGenerateResult.meta.model,
        output: defaultGenerateResult.payload,
      },
    ])
  })

  const errorCases = [
    {
      name: 'bad_output',
      createError: () => new AiError('bad_output', 'output rusak', { rawOutput: '{"rusak":true}' }),
      expectedStatus: 502,
      expectedCode: 'ai_bad_output',
      expectedDbStatus: 'invalid_json',
    },
    {
      name: 'blocked',
      createError: () => new AiError('blocked', 'diblokir'),
      expectedStatus: 422,
      expectedCode: 'ai_blocked',
      expectedDbStatus: 'error',
    },
    {
      name: 'timeout',
      createError: () => new AiError('timeout', 'timeout'),
      expectedStatus: 504,
      expectedCode: 'ai_timeout',
      expectedDbStatus: 'error',
    },
    {
      name: 'provider 429',
      createError: () => new AiError('provider', 'kuota provider', { status: 429 }),
      expectedStatus: 503,
      expectedCode: 'ai_quota_exceeded',
      expectedDbStatus: 'error',
    },
    {
      name: 'provider 402',
      createError: () => new AiError('provider', 'kredit habis', { status: 402 }),
      expectedStatus: 503,
      expectedCode: 'ai_quota_exceeded',
      expectedDbStatus: 'error',
    },
    {
      name: 'provider 403',
      createError: () => new AiError('provider', 'guardrail', { status: 403 }),
      expectedStatus: 422,
      expectedCode: 'ai_blocked',
      expectedDbStatus: 'error',
    },
    {
      name: 'provider 500',
      createError: () => new AiError('provider', 'detail provider', { status: 500 }),
      expectedStatus: 502,
      expectedCode: 'ai_unavailable',
      expectedDbStatus: 'error',
    },
    {
      name: 'provider 524',
      createError: () => new AiError('provider', 'edge timeout', { status: 524 }),
      expectedStatus: 504,
      expectedCode: 'ai_timeout',
      expectedDbStatus: 'error',
    },
    {
      name: 'config',
      createError: () => new AiError('config', 'konfigurasi'),
      expectedStatus: 500,
      expectedCode: 'internal_error',
      expectedDbStatus: 'error',
    },
  ]

  for (const testCase of errorCases) {
    it(`memetakan error AI ${testCase.name} tanpa membocorkan detail`, async () => {
      const { repository, state } = createFakeRepository()
      const app = createTestApp({
        repository,
        generateQuiz: createGenerateQuizMock(async () => {
          throw testCase.createError()
        }),
      })

      const response = await postGenerate(app)
      const text = await response.text()

      expect(response.status).toBe(testCase.expectedStatus)
      expect(JSON.parse(text)).toMatchObject({
        error: { code: testCase.expectedCode },
      })
      expect(text).not.toContain('detail provider')
      expect(text).not.toContain('output rusak')

      expect(state.updates).toHaveLength(1)
      expect(state.updates[0]).toMatchObject({
        id: 'generation-1',
        status: testCase.expectedDbStatus,
      })

      if (testCase.name === 'bad_output') {
        expect(state.updates[0]?.output).toEqual({
          error: 'bad_output',
          raw: '{"rusak":true}',
        })
      } else {
        expect(state.updates[0]?.output).toEqual({ error: testCase.createError().kind })
      }
    })
  }

  it('memetakan error tak terduga menjadi internal_error', async () => {
    const { repository, state } = createFakeRepository()
    const app = createTestApp({
      repository,
      generateQuiz: createGenerateQuizMock(async () => {
        throw new Error('boom rahasia')
      }),
    })

    const response = await postGenerate(app)
    const text = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(text)).toMatchObject({
      error: { code: 'internal_error' },
    })
    expect(text).not.toContain('boom rahasia')
    expect(state.updates[0]?.output).toEqual({ error: 'unexpected' })
  })

  it('tetap mengembalikan draft bila penyimpanan hasil sukses gagal', async () => {
    const { repository, state } = createFakeRepository()
    state.updateError = new Error('database sedang down')
    const app = createTestApp({ repository, generateQuiz: createGenerateQuizMock() })

    const response = await postGenerate(app)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      generation_id: 'generation-1',
      draft: defaultGenerateResult.payload,
    })
    expect(state.updates).toHaveLength(0)
  })
})
