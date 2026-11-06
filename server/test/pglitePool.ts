/**
 * Test helper: wraps an in-memory PGlite (real PostgreSQL engine in WASM) in
 * the DbPool interface, so repository tests run real SQL without Docker.
 * `connect()` hands out an exclusive client (serialized), mirroring how a
 * transaction owns a connection.
 */
import { PGlite } from '@electric-sql/pglite'
import { migrate } from '../src/db/migrate'
import type { DbClient, DbPool } from '../src/db/pool'

export async function createTestPool(): Promise<DbPool & { db: PGlite; failNext: (err: Error) => void }> {
  const db = await PGlite.create()
  let chain: Promise<void> = Promise.resolve()
  let injected: Error | null = null

  const run = async <R>(text: string, params?: unknown[]) => {
    if (injected) {
      const e = injected
      injected = null
      throw e
    }
    const r = params && params.length ? await db.query<R>(text, params) : await db.exec(text).then((rs) => rs.at(-1) ?? { rows: [], affectedRows: 0 })
    return { rows: (r.rows ?? []) as R[], rowCount: (r as { affectedRows?: number }).affectedRows ?? r.rows?.length ?? 0 }
  }

  const pool = {
    db,
    failNext(err: Error) {
      injected = err
    },
    query: <R>(text: string, params?: unknown[]) => {
      const p = chain.then(() => run<R>(text, params))
      chain = p.then(() => undefined, () => undefined)
      return p
    },
    async connect(): Promise<DbClient> {
      let release!: () => void
      const prev = chain
      chain = new Promise<void>((r) => (release = r))
      await prev
      return { query: (t, p) => run(t, p), release: () => release() }
    },
    async end() {
      await db.close()
    },
  }
  await migrate(pool as DbPool, undefined, () => {})
  return pool as unknown as DbPool & { db: PGlite; failNext: (err: Error) => void }
}
