/**
 * In-memory sliding-window limiter (per process). A fast first line of
 * defense; the persistent per-phone / per-IP limits in the lead service cover
 * multi-instance and serverless deployments.
 */
export interface RateLimiter {
  /** Returns 0 when allowed, otherwise the seconds until the next slot frees up. */
  hit(key: string): number
}

export function createMemoryRateLimiter(windowMs: number, max: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>()
  return {
    hit(key) {
      const t = now()
      const recent = (hits.get(key) ?? []).filter((ts) => t - ts < windowMs)
      if (recent.length >= max) {
        hits.set(key, recent)
        return Math.max(1, Math.ceil((windowMs - (t - recent[0]!)) / 1000))
      }
      recent.push(t)
      hits.set(key, recent)
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.every((ts) => t - ts >= windowMs)) hits.delete(k)
      }
      return 0
    },
  }
}
