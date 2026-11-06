/**
 * Minimal, dependency-free SQL migration runner for self-hosted PostgreSQL.
 *
 * Reads plain `.sql` files (or `<dir>/migration.sql`) from MIGRATIONS_DIR in
 * lexicographic order and records applied ones in `schema_migrations`.
 * Migrations are stored in the repository under database/migrations.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { DbPool } from './pool'

export const DEFAULT_MIGRATIONS_DIR = resolve(process.cwd(), 'database/migrations')

export interface Migration {
  name: string
  sql: string
  checksum: string
}

export function readMigrations(dir = DEFAULT_MIGRATIONS_DIR): Migration[] {
  if (!existsSync(dir)) throw new Error(`Migrations directory not found: ${dir}`)
  return readdirSync(dir)
    .sort()
    .flatMap((entry): Migration[] => {
      const full = join(dir, entry)
      let file: string | null = null
      if (statSync(full).isDirectory()) {
        const candidate = join(full, 'migration.sql')
        if (existsSync(candidate)) file = candidate
      } else if (entry.endsWith('.sql')) {
        file = full
      }
      if (!file) return []
      const sql = readFileSync(file, 'utf8')
      return [{ name: entry.replace(/\.sql$/, ''), sql, checksum: createHash('sha256').update(sql).digest('hex') }]
    })
}

export async function migrate(pool: DbPool, dir = DEFAULT_MIGRATIONS_DIR, log: (msg: string) => void = console.log) {
  const migrations = readMigrations(dir)
  const client = await pool.connect()
  try {
    // Serialize concurrent runners.
    await client.query('SELECT pg_advisory_lock(727101)')
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    const { rows } = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations')
    const applied = new Map(rows.map((r) => [r.name, r.checksum]))

    const result = { applied: [] as string[], skipped: [] as string[] }
    for (const m of migrations) {
      const existing = applied.get(m.name)
      if (existing) {
        if (existing !== m.checksum) {
          throw new Error(`Migration ${m.name} was modified after being applied. Create a new migration instead.`)
        }
        result.skipped.push(m.name)
        continue
      }
      await client.query('BEGIN')
      try {
        await client.query(m.sql)
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [m.name, m.checksum])
        await client.query('COMMIT')
        result.applied.push(m.name)
        log(`applied ${m.name}`)
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      }
    }
    return result
  } finally {
    await client.query('SELECT pg_advisory_unlock(727101)').catch(() => {})
    client.release()
  }
}
