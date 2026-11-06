/**
 * Minimal structured JSON logger.
 *
 * Privacy policy for logs (LGPD): never log request bodies, names, phones,
 * e-mails or messages. Log identifiers (lead id, request id), status codes and
 * technical error codes only. `redactPII` is applied to every free-text field
 * as a last line of defense.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void
  info(event: string, fields?: Record<string, unknown>): void
  warn(event: string, fields?: Record<string, unknown>): void
  error(event: string, fields?: Record<string, unknown>): void
}

const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
const LONG_DIGITS_RE = /\+?\d[\d\s().-]{7,}\d/g

/** Masks e-mails and phone-like digit sequences in free text. */
export function redactPII(text: string): string {
  return text.replace(EMAIL_RE, '[email]').replace(LONG_DIGITS_RE, '[number]')
}

/** Converts an unknown error into a log-safe object (no stack values or SQL details). */
export function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return {
      errorName: error.name,
      errorCode: typeof code === 'string' ? code : undefined,
      // pg puts column values in `detail`; we deliberately never log it.
      errorMessage: redactPII(error.message).slice(0, 300),
    }
  }
  return { errorName: 'NonError', errorMessage: redactPII(String(error)).slice(0, 300) }
}

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    out[key] = typeof value === 'string' ? redactPII(value) : value
  }
  return out
}

export function createLogger(
  level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info',
  write: (line: string) => void = (line) => console.log(line),
): Logger {
  const min = ORDER[level] ?? ORDER.info
  const log = (lvl: LogLevel) => (event: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[lvl] < min) return
    write(JSON.stringify({ time: new Date().toISOString(), level: lvl, event, ...sanitize(fields) }))
  }
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') }
}

/** Logger that discards everything (tests). */
export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} }
