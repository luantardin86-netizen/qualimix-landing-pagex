/**
 * OPTIONAL Netlify adapter for the Qualimix leads API.
 *
 * The backend in /server is platform-independent (Node + PostgreSQL). This
 * thin wrapper only lets the same Hono app answer /api/* when the project is
 * deployed on Netlify, using Netlify Database (managed PostgreSQL) as the
 * pool. Delete this file when hosting the backend elsewhere — nothing in
 * /server depends on it.
 */
import type { Config, Context } from '@netlify/functions'
import { getDatabase } from '@netlify/database'
import { loadConfig } from '../../server/src/config'
import { createContainer } from '../../server/src/container'
import type { DbPool } from '../../server/src/db/pool'
import { createLogger, describeError } from '../../server/src/logger'

type Container = ReturnType<typeof createContainer>
let cached: Container | undefined

function getContainer(): Container {
  if (!cached) {
    const logger = createLogger()
    const config = loadConfig({ ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' })
    const db = getDatabase()
    cached = createContainer({
      config,
      pool: db.pool as unknown as DbPool,
      logger,
      getClientIp: (c) => (c.env as { clientIp?: string } | undefined)?.clientIp ?? null,
    })
  }
  return cached
}

export default async (req: Request, context: Context) => {
  let container: Container
  try {
    container = getContainer()
  } catch (error) {
    createLogger().error('netlify.adapter.init_failed', describeError(error))
    return Response.json(
      {
        ok: false,
        error: 'service_unavailable',
        message: 'Não foi possível registrar seu cadastro agora. Tente novamente em instantes.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return container.app.fetch(req, { clientIp: context.ip })
}

export const config: Config = {
  path: '/api/*',
}
