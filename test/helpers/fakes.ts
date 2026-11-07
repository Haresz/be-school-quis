import { vi } from 'vitest'
import type {
  AiRepository,
  GenerationInsert,
  GenerationUpdate,
  MaterialRecord,
} from '../../src/services/ai-repository.js'
import type { GenerateQuizFn, GenerateQuizResult } from '../../src/services/ai/generateQuiz.js'
import type { AuthenticatedUser } from '../../src/types.js'

export const defaultMaterial: MaterialRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  subject: 'Matematika',
  grade: 5,
  topic: 'Pecahan',
  promptContext: 'Penjumlahan dan pengurangan pecahan berpenyebut berbeda.',
}

export const defaultUser: AuthenticatedUser = {
  id: 'user-1',
  email: 'siswa@example.com',
}

export type FakeRepositoryState = {
  user: AuthenticatedUser | null
  material: MaterialRecord | null
  userCount: number
  userOldestAt: Date | null
  globalCount: number
  globalOldestAt: Date | null
  inserted: GenerationInsert[]
  updates: GenerationUpdate[]
  insertError: Error | null
  updateError: Error | null
  getUserError: Error | null
}

export type FakeRepository = {
  repository: AiRepository
  state: FakeRepositoryState
}

export function createFakeRepository(overrides: Partial<FakeRepositoryState> = {}): FakeRepository {
  const state: FakeRepositoryState = {
    user: defaultUser,
    material: defaultMaterial,
    userCount: 0,
    userOldestAt: null,
    globalCount: 0,
    globalOldestAt: null,
    inserted: [],
    updates: [],
    insertError: null,
    updateError: null,
    getUserError: null,
    ...overrides,
  }

  const repository: AiRepository = {
    getUser: vi.fn(async (_jwt: string): Promise<AuthenticatedUser | null> => {
      if (state.getUserError) throw state.getUserError
      return state.user
    }),
    getActiveMaterial: vi.fn(
      async (_jwt: string, _materialId: string): Promise<MaterialRecord | null> => state.material,
    ),
    countUserGenerations: vi.fn(
      async (_jwt: string, _userId: string, _since: Date): Promise<number> => state.userCount,
    ),
    oldestUserGenerationAt: vi.fn(
      async (_jwt: string, _userId: string, _since: Date): Promise<Date | null> =>
        state.userOldestAt,
    ),
    countAllGenerations: vi.fn(async (_since: Date): Promise<number> => state.globalCount),
    oldestGenerationAt: vi.fn(async (_since: Date): Promise<Date | null> => state.globalOldestAt),
    insertPendingGeneration: vi.fn(
      async (_jwt: string, input: GenerationInsert): Promise<{ id: string }> => {
        if (state.insertError) throw state.insertError
        state.inserted.push(input)
        return { id: 'generation-1' }
      },
    ),
    updateGeneration: vi.fn(async (input: GenerationUpdate): Promise<void> => {
      if (state.updateError) throw state.updateError
      state.updates.push(input)
    }),
  }

  return { repository, state }
}

export const defaultGenerateResult: GenerateQuizResult = {
  payload: {
    material_id: defaultMaterial.id,
    title: 'Kuis Pecahan',
    description: 'Latihan pecahan untuk kelas 5.',
    source: 'ai',
    status: 'draft',
    settings: { reveal_answers: true },
    questions: [
      {
        type: 'multiple_choice',
        body: '1/2 + 1/4 = ...',
        options: ['1/6', '3/4', '2/6', '1/8'],
        correct_index: 1,
        explanation: 'Samakan penyebut terlebih dahulu.',
        points: 1,
      },
    ],
  },
  meta: {
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    attempts: 1,
    rawOutput: '{}',
  },
}

export function createGenerateQuizMock(implementation?: GenerateQuizFn) {
  return vi.fn<GenerateQuizFn>(implementation ?? (async () => defaultGenerateResult))
}

export type GenerateQuizMock = ReturnType<typeof createGenerateQuizMock>
