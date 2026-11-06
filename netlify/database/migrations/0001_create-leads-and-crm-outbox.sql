-- Qualimix leads: initial schema.
-- Plain PostgreSQL (13+). Applied automatically by Netlify Database on deploy,
-- or by `npm run db:migrate` against any other PostgreSQL server.
-- NEVER edit this file after it has been applied; add a new migration instead.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- leads: one row per contact request received from the landing page.
-- ---------------------------------------------------------------------------
CREATE TABLE leads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- new          : created but not yet confirmed (reserved for future channels/imports)
  -- received     : persisted and confirmed to the visitor
  -- pending_sync : queued in crm_outbox, not yet accepted by the CRM
  -- synced       : the CRM confirmed receipt (2xx)
  -- sync_failed  : permanent CRM error or retries exhausted (can be requeued)
  status                text NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'received', 'pending_sync', 'synced', 'sync_failed')),
  nome                  text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 60),
  sobrenome             text NOT NULL CHECK (char_length(sobrenome) BETWEEN 1 AND 80),
  telefone              text NOT NULL CHECK (telefone ~ '^\+55[0-9]{10,11}$'),
  empresa               text CHECK (char_length(empresa) <= 120),
  email                 text CHECK (char_length(email) <= 160),
  servico               text NOT NULL CHECK (char_length(servico) <= 60),
  mensagem              text NOT NULL CHECK (char_length(mensagem) <= 1500),
  origem                text NOT NULL DEFAULT 'Landing Page',
  pagina                text,
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  utm_term              text,
  utm_content           text,
  consentimento         boolean NOT NULL,
  consentimento_versao  text NOT NULL,
  consentimento_em      timestamptz NOT NULL,
  -- HMAC-SHA256 of the client IP (never the raw IP). NULL when IP_HASH_SECRET is not configured.
  ip_hash               text,
  -- Client-generated key that makes retries of the same submission idempotent.
  idempotency_key       text UNIQUE,
  -- SHA-256 of the normalized content, used to detect accidental re-submissions.
  content_hash          text NOT NULL,
  crm_external_id       text,
  synced_at             timestamptz,
  received_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_status_idx ON leads (status);
CREATE INDEX leads_telefone_created_idx ON leads (telefone, created_at DESC);
CREATE INDEX leads_ip_hash_created_idx ON leads (ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;
CREATE INDEX leads_content_hash_created_idx ON leads (content_hash, created_at DESC);

CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- crm_outbox: transactional outbox. Written in the same transaction as the
-- lead, consumed by the CRM sync worker. One row per lead.
-- ---------------------------------------------------------------------------
CREATE TABLE crm_outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid NOT NULL UNIQUE REFERENCES leads (id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  -- Lease: while in the future, no other worker may pick this row up.
  locked_until     timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_outbox_due_idx ON crm_outbox (status, next_attempt_at);

CREATE TRIGGER crm_outbox_set_updated_at BEFORE UPDATE ON crm_outbox
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- crm_sync_attempts: append-only log of every delivery attempt to the CRM.
-- ---------------------------------------------------------------------------
CREATE TABLE crm_sync_attempts (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id          uuid NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  outbox_id        uuid NOT NULL REFERENCES crm_outbox (id) ON DELETE CASCADE,
  attempt_number   integer NOT NULL,
  outcome          text NOT NULL CHECK (outcome IN ('success', 'retryable_error', 'permanent_error')),
  http_status      integer,
  error_code       text,
  error_detail     text,
  crm_external_id  text,
  duration_ms      integer,
  started_at       timestamptz NOT NULL,
  finished_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_sync_attempts_lead_idx ON crm_sync_attempts (lead_id, started_at DESC);
