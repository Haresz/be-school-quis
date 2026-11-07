import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../config/env.js'
import type {
  AiRepository,
  GenerationInsert,
  GenerationUpdate,
  MaterialRecord,
} from './ai-repository.js'

type MaterialRow = {
  id: string
  subject: string
  grade: number
  topic: string
  prompt_context: string
}

type GenerationIdRow = {
  id: string
}

type TimestampRow = {
  created_at: string
}

export class SupabaseOperationError extends Error {
  readonly operation: string
  readonly detail: unknown

  constructor(operation: string, detail: unknown) {
    super(`Operasi Supabase gagal: ${operation}`)
    this.name = 'SupabaseOperationError'
    this.operation = operation
    this.detail = detail
  }
}

function userClient(env: Env, jwt: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
}

function serviceClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export function createSupabaseAiRepository(env: Env): AiRepository {
  const service = serviceClient(env)

  return {
    async getUser(jwt) {
      const { data, error } = await userClient(env, jwt).auth.getUser(jwt)
      if (error || !data.user) return null

      return {
        id: data.user.id,
        ...(data.user.email ? { email: data.user.email } : {}),
      }
    },

    async getActiveMaterial(jwt, materialId) {
      const { data, error } = await userClient(env, jwt)
        .from('materials')
        .select('id, subject, grade, topic, prompt_context')
        .eq('id', materialId)
        .eq('is_active', true)
        .maybeSingle<MaterialRow>()

      if (error) throw new SupabaseOperationError('get_active_material', error)
      if (!data) return null

      return {
        id: data.id,
        subject: data.subject,
        grade: data.grade,
        topic: data.topic,
        promptContext: data.prompt_context,
      } satisfies MaterialRecord
    },

    async countUserGenerations(jwt, userId, since) {
      const { count, error } = await userClient(env, jwt)
        .from('ai_generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since.toISOString())

      if (error) throw new SupabaseOperationError('count_user_generations', error)
      return count ?? 0
    },

    async oldestUserGenerationAt(jwt, userId, since) {
      const { data, error } = await userClient(env, jwt)
        .from('ai_generations')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle<TimestampRow>()

      if (error) throw new SupabaseOperationError('oldest_user_generation', error)
      return data ? new Date(data.created_at) : null
    },

    async countAllGenerations(since) {
      const { count, error } = await service
        .from('ai_generations')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since.toISOString())

      if (error) throw new SupabaseOperationError('count_all_generations', error)
      return count ?? 0
    },

    async oldestGenerationAt(since) {
      const { data, error } = await service
        .from('ai_generations')
        .select('created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle<TimestampRow>()

      if (error) throw new SupabaseOperationError('oldest_generation', error)
      return data ? new Date(data.created_at) : null
    },

    async insertPendingGeneration(jwt, input: GenerationInsert) {
      const { data, error } = await userClient(env, jwt)
        .from('ai_generations')
        .insert({
          user_id: input.userId,
          material_id: input.materialId,
          prompt: input.prompt,
          model: input.model,
          status: 'pending',
        })
        .select('id')
        .single<GenerationIdRow>()

      if (error) throw new SupabaseOperationError('insert_pending_generation', error)
      return { id: data.id }
    },

    async updateGeneration(input: GenerationUpdate) {
      const { error } = await service
        .from('ai_generations')
        .update({ status: input.status, model: input.model, output: input.output })
        .eq('id', input.id)

      if (error) throw new SupabaseOperationError('update_generation', error)
    },
  }
}
