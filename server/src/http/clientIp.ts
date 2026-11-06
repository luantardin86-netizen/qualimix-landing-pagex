import type { Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'

/**
 * Client IP for the Node server. `X-Forwarded-For` is only honored when
 * TRUST_PROXY=true, otherwise any client could spoof it to bypass limits.
 */
export function nodeClientIp(trustProxy: boolean) {
  return (c: Context): string | null => {
    if (trustProxy) {
      const forwarded = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
      if (forwarded) return forwarded
    }
    try {
      return getConnInfo(c).remote.address ?? null
    } catch {
      return null
    }
  }
}
