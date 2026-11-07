import { describe, expect, it, vi } from 'vitest'
import { AiError, generateQuiz, type GenerateInput } from '../../src/services/ai/generateQuiz.js'

const MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free'

const input: GenerateInput = {
  materialId: '11111111-1111-4111-8111-111111111111',
  material: {
    subject: 'Matematika',
    grade: 5,
    topic: 'Pecahan',
    promptContext: 'Penjumlahan dan pengurangan pecahan berpenyebut berbeda.',
  },
  userPrompt: 'fokus soal cerita',
  numQuestions: 1,
  mix: 'mixed',
  difficulty: 'sedang',
}

const options = {
  apiKey: 'test-api-key',
  model: MODEL,
}

function quizPayload(questionCount = 1) {
  return {
    title: 'Kuis Pecahan',
    description: 'Latihan pecahan.',
    questions: Array.from({ length: questionCount }, (_, index) => ({
      type: 'multiple_choice',
      body: `Soal ${index + 1}`,
      options: ['A', 'B', 'C', 'D'],
      correct_index: 0,
      accepted_answers: [],
      explanation: 'A adalah jawaban yang benar.',
    })),
  }
}

type ChatMeta = {
  finishReason?: string
  model?: string
}

function chatTextResponse(text: string | null, meta: ChatMeta = {}) {
  const body = {
    id: 'chatcmpl-test',
    model: meta.model ?? MODEL,
    choices: [
      {
        index: 0,
        finish_reason: meta.finishReason ?? 'stop',
        message: { role: 'assistant', content: text },
      },
    ],
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function chatResponse(payload: unknown, meta: ChatMeta = {}) {
  return chatTextResponse(JSON.stringify(payload), meta)
}

function emptyChoicesResponse() {
  return new Response(JSON.stringify({ id: 'chatcmpl-test', model: MODEL, choices: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function fetchMock(
  handler: (
    input: Parameters<typeof fetch>[0],
    init: Parameters<typeof fetch>[1],
  ) => Promise<Response> | Response,
) {
  return vi.fn<typeof fetch>(async (requestInput, init) => handler(requestInput, init))
}

describe('generateQuiz', () => {
  it('memanggil OpenRouter dan mengembalikan payload sesuai kontrak save_quiz', async () => {
    const fetchImpl = fetchMock(() => chatResponse(quizPayload()))

    const result = await generateQuiz(input, {
      ...options,
      fetchImpl,
      maxRetries: 0,
      siteUrl: 'https://quiz.example.com',
      appName: 'school-quiz',
    })

    expect(result.payload).toMatchObject({
      material_id: input.materialId,
      source: 'ai',
      status: 'draft',
      settings: { reveal_answers: true },
    })
    expect(result.payload.questions[0]).toMatchObject({
      type: 'multiple_choice',
      points: 1,
    })
    expect(result.meta).toMatchObject({
      model: MODEL,
      attempts: 1,
    })

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/v1/chat/completions')

    const init = fetchImpl.mock.calls[0]?.[1]
    const body = JSON.parse(String(init?.body)) as {
      model: string
      messages: { role: string; content: string }[]
      temperature: number
      max_tokens: number
      response_format?: unknown
    }

    expect(body.model).toBe(MODEL)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0]?.role).toBe('system')
    expect(body.messages[0]?.content).toContain('pembuat soal')
    expect(body.messages[1]?.role).toBe('user')
    expect(body.messages[1]?.content).toContain('Mata pelajaran: Matematika')
    expect(body.temperature).toBe(0.7)
    expect(body.max_tokens).toBe(8192)
    expect(body.response_format).toBeUndefined()

    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer test-api-key')
    expect(headers.get('http-referer')).toBe('https://quiz.example.com')
    expect(headers.get('x-title')).toBe('school-quiz')
  })

  it('menghapus tanda < dan > dari input pengguna dan materi', async () => {
    const fetchImpl = fetchMock(() => chatResponse(quizPayload()))
    const unsafeInput: GenerateInput = {
      ...input,
      userPrompt: 'fokus <script>alert(1)</script>',
      material: { ...input.material, topic: 'Pecahan <b>' },
    }

    await generateQuiz(unsafeInput, { ...options, fetchImpl, maxRetries: 0 })

    const init = fetchImpl.mock.calls[0]?.[1]
    const body = JSON.parse(String(init?.body)) as {
      messages: { role: string; content: string }[]
    }
    const text = body.messages[1]?.content ?? ''

    expect(text).not.toContain('<script>')
    expect(text).not.toContain('<b>')
    expect(text).toContain('Topik: Pecahan b')
    expect(text).toContain('fokus scriptalert(1)/script')
  })

  it('menerima JSON yang dibungkus markdown', async () => {
    const text = `\`\`\`json\n${JSON.stringify(quizPayload())}\n\`\`\``
    const fetchImpl = fetchMock(() => chatTextResponse(text))

    const result = await generateQuiz(input, { ...options, fetchImpl, maxRetries: 0 })

    expect(result.payload.questions).toHaveLength(1)
  })

  it('menerima JSON yang didahului teks reasoning', async () => {
    const text = `Berikut kuisnya:\n${JSON.stringify(quizPayload())}\nSemoga membantu.`
    const fetchImpl = fetchMock(() => chatTextResponse(text))

    const result = await generateQuiz(input, { ...options, fetchImpl, maxRetries: 0 })

    expect(result.payload.questions).toHaveLength(1)
  })

  it('mencoba ulang ketika output rusak lalu berhasil', async () => {
    let calls = 0
    const fetchImpl = fetchMock(() => {
      calls += 1
      return calls === 1 ? chatTextResponse('bukan json') : chatResponse(quizPayload())
    })

    const result = await generateQuiz(input, {
      ...options,
      fetchImpl,
      maxRetries: 1,
      retryDelayMs: 0,
    })

    expect(calls).toBe(2)
    expect(result.meta.attempts).toBe(2)
  })

  it('gagal setelah semua percobaan bila jumlah soal tidak sesuai', async () => {
    const fetchImpl = fetchMock(() => chatResponse(quizPayload(2)))

    const error = await generateQuiz(input, {
      ...options,
      fetchImpl,
      maxRetries: 1,
      retryDelayMs: 0,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('bad_output')
    expect((error as AiError).rawOutput).toContain('Soal 2')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('menganggap finish_reason length sebagai output rusak', async () => {
    const text = JSON.stringify(quizPayload())
    const fetchImpl = fetchMock(() => chatTextResponse(text, { finishReason: 'length' }))

    const error = await generateQuiz(input, { ...options, fetchImpl, maxRetries: 0 }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('bad_output')
    expect((error as AiError).rawOutput).toBe(text)
  })

  it('menganggap finish_reason content_filter sebagai blocked tanpa retry', async () => {
    const fetchImpl = fetchMock(() => chatTextResponse('', { finishReason: 'content_filter' }))

    await expect(
      generateQuiz(input, { ...options, fetchImpl, maxRetries: 2, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ kind: 'blocked' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('menganggap respons tanpa choices sebagai output rusak', async () => {
    const fetchImpl = fetchMock(() => emptyChoicesResponse())

    await expect(
      generateQuiz(input, { ...options, fetchImpl, maxRetries: 0 }),
    ).rejects.toMatchObject({ kind: 'bad_output' })
  })

  it('menganggap content kosong sebagai output rusak', async () => {
    const fetchImpl = fetchMock(() => chatTextResponse(null))

    await expect(
      generateQuiz(input, { ...options, fetchImpl, maxRetries: 0 }),
    ).rejects.toMatchObject({ kind: 'bad_output' })
  })

  it('memetakan HTTP 429 menjadi error provider', async () => {
    const fetchImpl = fetchMock(() => new Response('kuota habis', { status: 429 }))

    await expect(
      generateQuiz(input, { ...options, fetchImpl, maxRetries: 0 }),
    ).rejects.toMatchObject({ kind: 'provider', status: 429 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('mencoba ulang provider yang gagal sementara lalu berhasil', async () => {
    let calls = 0
    const fetchImpl = fetchMock(() => {
      calls += 1
      return calls === 1
        ? new Response('provider down', { status: 503 })
        : chatResponse(quizPayload())
    })

    const result = await generateQuiz(input, {
      ...options,
      fetchImpl,
      maxRetries: 1,
      retryDelayMs: 0,
    })

    expect(calls).toBe(2)
    expect(result.meta.attempts).toBe(2)
  })

  it('tidak mencoba ulang error kredit habis (402)', async () => {
    const fetchImpl = fetchMock(() => new Response('kredit habis', { status: 402 }))

    await expect(
      generateQuiz(input, { ...options, fetchImpl, maxRetries: 2, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ kind: 'provider', status: 402 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('memetakan AbortError menjadi timeout', async () => {
    const fetchImpl = fetchMock(() => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    })

    await expect(
      generateQuiz(input, { ...options, fetchImpl, maxRetries: 0 }),
    ).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('memakai model dari respons bila tersedia', async () => {
    const fetchImpl = fetchMock(() => chatResponse(quizPayload(), { model: `${MODEL}-001` }))

    const result = await generateQuiz(input, { ...options, fetchImpl, maxRetries: 0 })

    expect(result.meta.model).toBe(`${MODEL}-001`)
  })

  it('menormalkan description kosong dan soal teks', async () => {
    const payload = {
      title: 'Kuis Campuran',
      description: '',
      questions: [
        {
          type: 'multiple_choice',
          body: 'Pilih jawaban benar.',
          options: ['A', 'B', 'C', 'D'],
          correct_index: 2,
          accepted_answers: [],
          explanation: '',
        },
        {
          type: 'text',
          body: 'Sebutkan hasil 1/2 + 1/2.',
          options: [],
          correct_index: -1,
          accepted_answers: ['1', 'satu'],
          explanation: '',
        },
      ],
    }
    const fetchImpl = fetchMock(() => chatResponse(payload))

    const result = await generateQuiz(
      { ...input, numQuestions: 2 },
      { ...options, fetchImpl, maxRetries: 0 },
    )

    expect(result.payload.description).toBeNull()
    expect(result.payload.questions).toEqual([
      {
        type: 'multiple_choice',
        body: 'Pilih jawaban benar.',
        options: ['A', 'B', 'C', 'D'],
        correct_index: 2,
        explanation: null,
        points: 1,
      },
      {
        type: 'text',
        body: 'Sebutkan hasil 1/2 + 1/2.',
        accepted_answers: ['1', 'satu'],
        explanation: null,
        points: 1,
      },
    ])
  })

  it('gagal cepat bila API key tidak tersedia', async () => {
    const fetchImpl = fetchMock(() => chatResponse(quizPayload()))

    await expect(
      generateQuiz(input, { apiKey: '', model: options.model, fetchImpl, maxRetries: 0 }),
    ).rejects.toMatchObject({ kind: 'config' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('menolak input yang tidak valid sebelum memanggil OpenRouter', async () => {
    const fetchImpl = fetchMock(() => chatResponse(quizPayload()))

    await expect(
      generateQuiz({ ...input, numQuestions: 0 }, { ...options, fetchImpl }),
    ).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
