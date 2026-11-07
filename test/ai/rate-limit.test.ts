import { describe, expect, it } from 'vitest'
import { checkRateLimit } from '../../src/services/rate-limit.js'
import { createFakeRepository } from '../helpers/fakes.js'

const NOW = new Date('2026-01-01T12:00:00.000Z')

function limitOptions(
  overrides: {
    userCount?: number
    userOldestAt?: Date | null
    globalCount?: number
    globalOldestAt?: Date | null
  } = {},
) {
  const { repository } = createFakeRepository({
    userCount: overrides.userCount ?? 0,
    userOldestAt: overrides.userOldestAt ?? null,
    globalCount: overrides.globalCount ?? 0,
    globalOldestAt: overrides.globalOldestAt ?? null,
  })

  return {
    repository,
    jwt: 'jwt-pengguna',
    userId: 'user-1',
    userLimit: 10,
    globalLimit: 200,
    now: NOW,
  }
}

describe('checkRateLimit', () => {
  it('mengizinkan permintaan saat kuota user dan global belum penuh', async () => {
    const result = await checkRateLimit(limitOptions({ userCount: 9, globalCount: 199 }))

    expect(result).toEqual({ limited: false })
  })

  it('membatasi user tepat saat kuota tercapai dan menghitung Retry-After', async () => {
    const oldest = new Date(NOW.getTime() - 30 * 60 * 1000)

    const result = await checkRateLimit(limitOptions({ userCount: 10, userOldestAt: oldest }))

    expect(result).toEqual({
      limited: true,
      kind: 'user',
      retryAfterSeconds: 1800,
    })
  })

  it('memakai durasi penuh bila waktu permintaan tertua tidak ditemukan', async () => {
    const result = await checkRateLimit(limitOptions({ userCount: 10, userOldestAt: null }))

    expect(result).toEqual({
      limited: true,
      kind: 'user',
      retryAfterSeconds: 3600,
    })
  })

  it('membatasi global tepat saat kuota tercapai dan menghitung Retry-After', async () => {
    const oldest = new Date(NOW.getTime() - 12 * 60 * 60 * 1000)

    const result = await checkRateLimit(limitOptions({ globalCount: 200, globalOldestAt: oldest }))

    expect(result).toEqual({
      limited: true,
      kind: 'global',
      retryAfterSeconds: 43_200,
    })
  })

  it('memeriksa kuota user lebih dulu daripada kuota global', async () => {
    const result = await checkRateLimit(
      limitOptions({
        userCount: 10,
        userOldestAt: new Date(NOW.getTime() - 60 * 1000),
        globalCount: 200,
        globalOldestAt: new Date(NOW.getTime() - 60 * 1000),
      }),
    )

    expect(result).toMatchObject({ limited: true, kind: 'user' })
  })
})
