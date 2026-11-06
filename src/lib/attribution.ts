/**
 * Campaign attribution (UTM) captured from the landing URL. Kept in memory
 * only for the current page view — nothing is persisted in the browser.
 */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
export type UtmKey = (typeof UTM_KEYS)[number]
export type Attribution = Partial<Record<UtmKey, string>> & { pagina?: string }

export function readAttribution(href: string): Attribution {
  const out: Attribution = {}
  try {
    const url = new URL(href)
    for (const key of UTM_KEYS) {
      const value = url.searchParams.get(key)?.trim()
      if (value) out[key] = value.slice(0, 150)
    }
    out.pagina = url.pathname.slice(0, 300)
  } catch {
    /* ignore malformed URLs */
  }
  return out
}

let captured: Attribution | null = null

/** Attribution of the URL the visitor landed on (captured once). */
export function getAttribution(): Attribution {
  if (!captured) captured = typeof window === 'undefined' ? {} : readAttribution(window.location.href)
  return captured
}
