/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public base URL of the leads API. Empty = same origin. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
