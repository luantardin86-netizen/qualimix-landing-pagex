/** Applies pending SQL migrations to the database in DATABASE_MIGRATION_URL (or DATABASE_URL). */
import { loadDotEnv } from '../src/config'
import { migrate } from '../src/db/migrate'
import { createPgPool } from '../src/db/pool'

loadDotEnv()
const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL
if (!url) {
  console.error('Set DATABASE_MIGRATION_URL or DATABASE_URL (see .env.example)')
  process.exit(1)
}
const pool = createPgPool(url)
try {
  const result = await migrate(pool)
  console.log(`migrations: ${result.applied.length} applied, ${result.skipped.length} already up to date`)
} catch (error) {
  console.error('migration failed:', (error as Error).message)
  process.exitCode = 1
} finally {
  await pool.end?.()
}
