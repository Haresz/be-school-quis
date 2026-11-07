const SENSITIVE_KEY = /authorization|api[-_]?key|token|secret|password|prompt|draft|raw|output/i
const MAX_STRING_LENGTH = 500

export type LogFields = Record<string, unknown>

export type Logger = {
  info: (fields: LogFields) => void
  warn: (fields: LogFields) => void
  error: (fields: LogFields) => void
}

function replacer(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) {
    return '[REDACTED]'
  }

  if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
    return `${value.slice(0, MAX_STRING_LENGTH)}...`
  }

  return value
}

function write(level: 'info' | 'warn' | 'error', fields: LogFields): void {
  const line = JSON.stringify(
    {
      time: new Date().toISOString(),
      level,
      ...fields,
    },
    replacer,
  )

  if (level === 'error') {
    console.error(line)
    return
  }

  if (level === 'warn') {
    console.warn(line)
    return
  }

  console.log(line)
}

export function createLogger(): Logger {
  return {
    info: (fields) => write('info', fields),
    warn: (fields) => write('warn', fields),
    error: (fields) => write('error', fields),
  }
}

export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}
