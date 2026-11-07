import type { AuthenticatedUser } from '../types.js'

export type MaterialRecord = {
  id: string
  subject: string
  grade: number
  topic: string
  promptContext: string
}

export type GenerationInsert = {
  userId: string
  materialId: string
  prompt: string
  model: string
}

export type GenerationUpdateStatus = 'success' | 'invalid_json' | 'error'

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type GenerationUpdate = {
  id: string
  status: GenerationUpdateStatus
  model: string
  output: JsonValue
}

export type AiRepository = {
  getUser(jwt: string): Promise<AuthenticatedUser | null>
  getActiveMaterial(jwt: string, materialId: string): Promise<MaterialRecord | null>
  countUserGenerations(jwt: string, userId: string, since: Date): Promise<number>
  oldestUserGenerationAt(jwt: string, userId: string, since: Date): Promise<Date | null>
  countAllGenerations(since: Date): Promise<number>
  oldestGenerationAt(since: Date): Promise<Date | null>
  insertPendingGeneration(jwt: string, input: GenerationInsert): Promise<{ id: string }>
  updateGeneration(input: GenerationUpdate): Promise<void>
}
