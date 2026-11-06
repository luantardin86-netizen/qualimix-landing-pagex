/**
 * Docker-free local database for development: an embedded PostgreSQL
 * (PGlite, Postgres compiled to WASM) exposed over the Postgres wire protocol.
 * Data is persisted in ./.pglite-data. For production-like setups use
 * `npm run db:up` (Docker Compose, real PostgreSQL 16).
 *
 *   npm run db:dev-pglite   # listens on 127.0.0.1:54329
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres DB_POOL_MAX=1
 */
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const port = Number(process.env.PGLITE_PORT) || 54329
const dataDir = process.env.PGLITE_DATA_DIR || './.pglite-data'
const db = await PGlite.create(dataDir)
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 1 })
await server.start()
console.log(`PGlite listening on postgres://postgres:postgres@127.0.0.1:${port}/postgres (data: ${dataDir})`)
console.log('Use DB_POOL_MAX=1 with this server (single connection).')
const stop = async () => {
  await server.stop()
  await db.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
