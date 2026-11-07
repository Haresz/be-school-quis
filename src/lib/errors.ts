import type { ContentfulStatusCode } from 'hono/utils/http-status'

export const ERROR_MESSAGES = {
  unauthorized: 'Token autentikasi tidak valid atau tidak ada.',
  invalid_request: 'Data permintaan tidak valid.',
  material_not_found: 'Materi tidak ditemukan atau tidak aktif.',
  rate_limited: 'Batas pembuatan kuis per jam tercapai. Silakan coba lagi nanti.',
  ai_capacity_reached: 'Kapasitas pembuatan kuis AI sedang penuh. Silakan coba lagi nanti.',
  ai_bad_output: 'AI menghasilkan format kuis yang tidak valid. Silakan coba lagi.',
  ai_blocked: 'Permintaan diblokir oleh filter keamanan AI.',
  ai_timeout: 'Waktu tunggu AI habis. Silakan coba lagi.',
  ai_quota_exceeded: 'Kuota AI sedang habis. Silakan coba lagi nanti.',
  ai_unavailable: 'Layanan AI sedang tidak tersedia. Silakan coba lagi nanti.',
  internal_error: 'Terjadi kesalahan internal.',
  not_found: 'Endpoint tidak ditemukan.',
} as const

export type ErrorCode = keyof typeof ERROR_MESSAGES

export type ErrorBody = {
  error: {
    code: ErrorCode
    message: string
  }
}

export class AppError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: ErrorCode

  constructor(
    status: ContentfulStatusCode,
    code: ErrorCode,
    message: string = ERROR_MESSAGES[code],
  ) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
  }
}

export function errorBody(code: ErrorCode, message: string = ERROR_MESSAGES[code]): ErrorBody {
  return { error: { code, message } }
}
