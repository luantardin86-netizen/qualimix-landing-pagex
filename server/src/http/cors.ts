import type { MiddlewareHandler } from 'hono'

/**
 * Strict CORS: only exact origins from ALLOWED_ORIGINS (plus same-origin) may
 * call the API from a browser. Requests without an Origin header (server to
 * server, curl) are not subject to CORS and pass through.
 */
export function isAllowedOrigin(origin: string, requestUrl: string, allowed: string[]): boolean {
  const normalized = origin.replace(/\/+$/, '')
  if (allowed.includes(normalized)) return true
  try {
    return new URL(normalized).origin === new URL(requestUrl).origin
  } catch {
    return false
  }
}

export function strictCors(allowed: string[]): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header('Origin')
    if (!origin) return next()

    if (!isAllowedOrigin(origin, c.req.url, allowed)) {
      return c.json({ ok: false, error: 'origin_not_allowed', message: 'Origem não autorizada.' }, 403)
    }
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Vary', 'Origin')
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      c.header('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key, Authorization')
      c.header('Access-Control-Max-Age', '600')
      return c.body(null, 204)
    }
    return next()
  }
}
