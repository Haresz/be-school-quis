import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app-factory.js'
import { silentLogger } from '../src/lib/logger.js'
import { testEnv } from './helpers/env.js'
import { createFakeRepository, createGenerateQuizMock } from './helpers/fakes.js'

function createTestApp() {
  const { repository } = createFakeRepository()

  return createApp({
    env: testEnv,
    logger: silentLogger,
    ai: { repository, generateQuiz: createGenerateQuizMock() },
  })
}

describe('GET /health', () => {
  it('mengembalikan { ok: true } tanpa autentikasi', async () => {
    const app = createTestApp()

    const response = await app.request('/health')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBeTruthy()
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('mengembalikan format error seragam untuk endpoint yang tidak ada', async () => {
    const app = createTestApp()

    const response = await app.request('/tidak-ada')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Endpoint tidak ditemukan.',
      },
    })
  })
})
