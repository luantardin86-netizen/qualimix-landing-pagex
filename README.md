# Qualimix — Landing Page + API de Leads (preparada para CRM)

Landing page institucional/comercial da **Qualimix — Qualidade em concreto** com formulário de captação de leads e um **backend próprio** (Node.js + PostgreSQL) que valida, normaliza, persiste e enfileira cada cadastro para envio a um CRM externo.

```
LANDING PAGE (React/Vite)
   │  POST /api/leads  (JSON + Idempotency-Key)
   ▼
API PRÓPRIA (Hono sobre Node.js)  ── validação + normalização (zod, telefone E.164)
   │                                 anti-spam, rate limit, CORS restrito
   ▼
POSTGRESQL  ── leads + crm_outbox (mesma transação)
   │
   ▼
CRM SYNC WORKER  ── CrmLeadClient (CRM_API_URL / CRM_API_TOKEN)
   │                 retries com backoff, log de cada tentativa
   ▼
CRM EXTERNO  (ainda não configurado → leads ficam "pending_sync")
```

---

## 1. Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, lucide-react |
| Validação compartilhada | zod (mesmo schema no navegador e no servidor) |
| Backend | Node.js ≥ 20, Hono + `@hono/node-server` |
| Banco | PostgreSQL 16 (Docker Compose) — migrations SQL puras |
| Acesso a dados | `pg` com consultas parametrizadas |
| Testes | Vitest + PGlite (motor PostgreSQL real em WASM, sem Docker) |

Nenhuma dependência da Netlify é necessária para o backend. A pasta `netlify/` contém apenas um **adaptador opcional** (veja §10).

## 2. Estrutura de pastas

```
.
├── index.html                  # HTML + SEO (title, description, Open Graph, JSON-LD)
├── public/                     # imagens WebP responsivas, favicon, robots.txt
├── src/                        # FRONTEND
│   ├── App.tsx
│   ├── components/             # Header, Hero, Services, LeadForm, Faq, Footer...
│   ├── content/site.ts         # textos/telefone (vindos da referência)
│   ├── content/privacy.ts      # aviso de privacidade (revisão jurídica pendente)
│   └── lib/api.ts              # cliente do POST /api/leads
├── shared/                     # código usado por frontend E backend
│   ├── lead.ts                 # contrato/validação do lead
│   └── phone.ts                # máscara e normalização de telefone BR
├── server/                     # BACKEND (independente de plataforma)
│   ├── src/
│   │   ├── index.ts            # servidor HTTP Node
│   │   ├── config.ts           # leitura de variáveis de ambiente
│   │   ├── container.ts        # composição das dependências
│   │   ├── logger.ts           # logs JSON sem dados pessoais
│   │   ├── http/               # app Hono, CORS, rate limiter, IP do cliente
│   │   ├── leads/              # serviço de cadastro + repositório PostgreSQL
│   │   ├── crm/                # CrmLeadClient, mapeamento de payload, sync worker
│   │   └── db/                 # pool e executor de migrations
│   ├── scripts/                # migrate, crm-sync (cron), dev-pglite
│   └── test/                   # testes de integração
├── netlify/
│   ├── database/migrations/    # migrations SQL (fonte única do schema)
│   └── functions/              # adaptador OPCIONAL p/ hospedar a API na Netlify
├── docker/postgres/            # init: cria papel de aplicação com privilégio mínimo
├── docker-compose.yml
├── Dockerfile                  # imagem da API
└── .env.example
```

## 3. Como executar localmente

Pré-requisitos: Node.js 20+ e (recomendado) Docker.

```bash
npm install
cp .env.example .env

# Banco de dados (PostgreSQL 16 em Docker)
npm run db:up
npm run db:migrate            # usa DATABASE_MIGRATION_URL (papel dono do schema)

# Backend (porta 3001, recarrega ao salvar)
npm run dev:api

# Frontend (porta 5173; /api é redirecionado para o backend)
npm run dev
```

Abra http://localhost:5173.

**Sem Docker?** Use o PostgreSQL embarcado (PGlite) para desenvolvimento:

```bash
npm run db:dev-pglite          # terminal 1 — escuta em 127.0.0.1:54329, dados em ./.pglite-data
# no .env:
#   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres
#   DATABASE_MIGRATION_URL=
#   DB_POOL_MAX=1
npm run db:migrate && npm run dev:api   # terminal 2
npm run dev                              # terminal 3
```

> O PGlite aceita **uma conexão por vez**: com a API rodando, `npm run crm:sync` não consegue conectar (use o endpoint admin `POST /api/admin/crm-sync` ou o PostgreSQL do Docker).

### Scripts

| Comando | Função |
| --- | --- |
| `npm run dev` | frontend (Vite) |
| `npm run dev:api` | API em modo watch |
| `npm run build` / `npm run preview` | build estático do frontend (`dist/`) |
| `npm run build:api` / `npm run start:api` | bundle e execução da API (`dist-server/`) |
| `npm run db:up` / `db:down` | sobe/derruba o PostgreSQL do Docker |
| `npm run db:migrate` | aplica migrations pendentes |
| `npm run crm:sync` | envia ao CRM os leads pendentes (para cron). `-- --requeue` reprocessa falhas |
| `npm test` | testes automatizados |
| `npm run typecheck` | verificação de tipos |

Produção com contêiner: `docker compose --profile api up --build` (aplica migrations e inicia a API).

## 4. Variáveis de ambiente

Todas documentadas em [`.env.example`](.env.example). Pontos principais:

- **`VITE_API_BASE_URL`** — único valor exposto ao navegador; é o endereço **público** da API (não é segredo). Vazio = mesma origem.
- **`DATABASE_URL`** — conexão da API com papel `qualimix_app` (somente SELECT/INSERT/UPDATE).
- **`DATABASE_MIGRATION_URL`** — conexão do dono do schema, usada só pelas migrations.
- **`ALLOWED_ORIGINS`** — domínios autorizados no CORS (ex.: `https://qualimix.com.br,https://xxxx.lovable.app`).
- **`IP_HASH_SECRET`** — segredo do HMAC de IP (limite persistente por IP sem guardar o IP).
- **`ADMIN_API_TOKEN`** — habilita as rotas `/api/admin/*`.
- **`CRM_API_URL` / `CRM_API_TOKEN`** — **somente no servidor**. Nunca use prefixo `VITE_`.

## 5. Endpoints

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/api/leads` | recebe um cadastro |
| `GET` | `/api/health` | estado da API e do banco (`200` ok / `503` banco indisponível) |
| `GET` | `/api/admin/leads/stats` | contagem por status (Bearer `ADMIN_API_TOKEN`) |
| `POST` | `/api/admin/crm-sync` | executa um lote de sincronização com o CRM |
| `POST` | `/api/admin/crm-sync/requeue-failed` | devolve leads `sync_failed` para a fila |

### `POST /api/leads`

Cabeçalhos: `Content-Type: application/json`, opcional `Idempotency-Key` (16–80 caracteres `[A-Za-z0-9_-]`; o formulário envia um UUID).

```json
{
  "nome": "João",
  "sobrenome": "Silva",
  "telefone": "61999999998",
  "empresa": "Construtora Exemplo",
  "email": "joao@email.com",
  "servico": "Concreto usinado",
  "mensagem": "Solicito orçamento para laje de 60 m²",
  "consentimento": true,
  "consentimento_versao": "2026-11-06.v1",
  "origem": "Landing Page",
  "pagina": "/",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "qualimix",
  "utm_term": "concreto usinado",
  "utm_content": "anuncio-1",
  "website": "",
  "tempo_preenchimento_ms": 15000
}
```

`servico` aceita: `Concreto usinado`, `Piso polido`, `Piso sarrafeado`, `Outro / ainda não sei`. `website` é um honeypot (deve vir vazio). `empresa`, `email`, UTMs, `pagina` e `tempo_preenchimento_ms` são opcionais.

| Status | Situação |
| --- | --- |
| `201` | lead criado — `{ ok, id, status: "pending_sync", duplicate: false, message }` |
| `200` | reenvio do mesmo cadastro (mesma chave ou mesmo conteúdo em 10 min) — `duplicate: true`, mesmo `id` |
| `400` | JSON inválido, chave de idempotência inválida ou envio identificado como spam |
| `403` | origem não autorizada (CORS) |
| `405` / `415` / `413` | método, Content-Type ou tamanho inválidos |
| `422` | erros de validação por campo — `{ ok:false, error:"validation_error", fields:{...} }` |
| `429` | limite de tentativas (`Retry-After`) |
| `503` | banco indisponível (o formulário mantém os dados e pede nova tentativa) |
| `500` | erro inesperado (mensagem genérica, sem detalhes internos) |

As respostas nunca devolvem os dados pessoais enviados.

## 6. Banco de dados

Migration: [`netlify/database/migrations/0001_create-leads-and-crm-outbox.sql`](netlify/database/migrations/0001_create-leads-and-crm-outbox.sql). Para alterar o schema, **crie uma nova migration** (nunca edite uma já aplicada; o executor recusa arquivos alterados via checksum).

### `leads`

| Coluna | Tipo | Observação |
| --- | --- | --- |
| `id` | uuid PK | gerado pelo banco |
| `status` | text | `new` · `received` · `pending_sync` · `synced` · `sync_failed` |
| `nome`, `sobrenome` | text | obrigatórios |
| `telefone` | text | E.164 (`+5561999999998`), CHECK no banco |
| `empresa`, `email` | text | opcionais |
| `servico`, `mensagem` | text | obrigatórios |
| `origem`, `pagina` | text | origem do cadastro (padrão `Landing Page`) |
| `utm_source/medium/campaign/term/content` | text | atribuição de campanha |
| `consentimento`, `consentimento_versao`, `consentimento_em` | bool/text/timestamptz | registro do aceite e da versão do aviso |
| `ip_hash` | text | HMAC-SHA256 do IP (o IP não é armazenado) |
| `idempotency_key` | text UNIQUE | evita duplicidade em reenvios |
| `content_hash` | text | detecção de envio acidental repetido |
| `crm_external_id`, `synced_at` | text/timestamptz | preenchidos **somente** após 2xx do CRM |
| `received_at`, `created_at`, `updated_at` | timestamptz | `updated_at` mantido por trigger |

### `crm_outbox` (outbox transacional)

Uma linha por lead, criada **na mesma transação** do lead: `status` (`pending`/`processing`/`done`/`failed`), `attempts`, `next_attempt_at`, `locked_until` (lease p/ workers concorrentes, `FOR UPDATE SKIP LOCKED`), `last_error`.

### `crm_sync_attempts`

Log append-only de cada tentativa: número, resultado (`success`/`retryable_error`/`permanent_error`), HTTP status, código de erro, detalhe (redigido), id externo, duração.

### Ciclo de status

```
received ─► pending_sync ──2xx──► synced
                 │  ▲
       erro temp.│  │ requeue (admin/CLI)
                 ▼  │
            (retry c/ backoff) ──esgotou / 4xx permanente──► sync_failed
```

## 7. Integração com o CRM

- `server/src/crm/CrmLeadClient.ts` — único ponto de comunicação externa: POST JSON para `CRM_API_URL`, `Authorization: Bearer CRM_API_TOKEN`, `Idempotency-Key: <id do lead>` (o mesmo em todas as tentativas), timeout, sem seguir redirecionamentos. Classifica respostas: 2xx sucesso; 408/425/429/5xx/timeout/rede → reenvio; demais 4xx → falha permanente.
- `server/src/crm/crmPayload.ts` — **único lugar a adaptar** quando o contrato do CRM for definido. O formato atual é uma proposta, não um contrato existente.
- `server/src/crm/crmSyncService.ts` — consome a outbox com backoff exponencial (30 s → máx. 6 h, com jitter) até `CRM_MAX_ATTEMPTS`.
- Execução: worker interno do servidor Node (`CRM_SYNC_INTERVAL_MS`) + disparo logo após cada cadastro; ou `npm run crm:sync` via cron; ou `POST /api/admin/crm-sync`.

**Enquanto `CRM_API_URL` estiver vazio nada é enviado** e todos os leads permanecem `pending_sync`. Ao configurar, os pendentes são entregues automaticamente na próxima execução.

## 8. Segurança e LGPD

- Validação no navegador **e** no servidor (mesmo schema); limites de tamanho por campo e do corpo (16 KB).
- SQL sempre parametrizado; teste automatizado com tentativa de injection.
- CORS por lista exata de origens; cabeçalhos de segurança (`secureHeaders`); `Cache-Control: no-store`.
- Anti-abuso: honeypot, tempo mínimo de preenchimento, limite em memória por IP, limites persistentes por telefone/dia e por IP-hash/hora.
- `X-Forwarded-For` só é confiável com `TRUST_PROXY=true`.
- Papéis de banco separados (dono das migrations × aplicação sem DDL/DELETE); porta do Postgres ligada só a `127.0.0.1`.
- Logs JSON apenas com IDs, status e códigos de erro; redação automática de e-mails e números; o `detail` do PostgreSQL (que contém valores) nunca é logado.
- Rotas admin desabilitadas sem token; comparação do token em tempo constante.
- Coleta mínima: nada além do formulário + metadados de atribuição/consentimento; nenhum dado salvo no `localStorage`.
- Registro do consentimento (aceite, versão do aviso, data/hora).

> ⚠️ **Conformidade com a LGPD exige mais do que um checkbox.** O texto em `src/content/privacy.ts` é um ponto de partida técnico e **precisa ser revisado juridicamente** (identificação do controlador e CNPJ, encarregado/DPO, base legal, prazo de retenção, canal de atendimento ao titular). Também é necessário definir política de retenção/exclusão e procedimento para atender pedidos de titulares. Ao alterar o aviso, incremente `PRIVACY_NOTICE_VERSION` em `shared/lead.ts`.

## 9. Testando um cadastro completo

1. Suba banco, API e frontend (§3) e abra `http://localhost:5173/?utm_source=google&utm_medium=cpc&utm_campaign=qualimix`.
2. Preencha o formulário “Solicite nosso contato” e envie. A confirmação (com protocolo) só aparece depois do `201` do backend.
3. Confira no banco:
   ```bash
   docker compose exec db psql -U qualimix_owner -d qualimix \
     -c "select id, status, telefone, servico, utm_source, received_at from leads order by created_at desc limit 5;" \
     -c "select lead_id, status, attempts from crm_outbox;"
   ```
4. Via API:
   ```bash
   curl -i -X POST http://localhost:3001/api/leads -H 'Content-Type: application/json' \
     -d '{"nome":"João","sobrenome":"Silva","telefone":"(61) 99999-9998","servico":"Concreto usinado","mensagem":"Solicito orçamento de 20 m3","consentimento":true,"consentimento_versao":"2026-11-06.v1","utm_source":"google"}'
   curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost:3001/api/admin/leads/stats
   npm run crm:sync     # sem CRM_API_URL: informa que nada foi enviado
   ```

## 10. Hospedagem

- **Frontend**: qualquer host estático (`npm run build` → `dist/`), inclusive Lovable. Se a API estiver em outro domínio, defina `VITE_API_BASE_URL` e inclua o domínio do site em `ALLOWED_ORIGINS` da API.
- **Lovable sem backend publicado**: a página abre normalmente, mas o formulário **não consegue registrar cadastros** — exibe erro, mantém os dados digitados e oferece o WhatsApp. Configure `VITE_API_BASE_URL` com a API publicada para que os envios funcionem.
- **Backend**: qualquer ambiente Node 20+ ou contêiner (`Dockerfile`) com PostgreSQL 13+ (Docker, RDS, Cloud SQL, Neon, Supabase…).
- **Netlify (opcional)**: `netlify/functions/api.mts` expõe o mesmo app Hono em `/api/*` usando o Netlify Database (PostgreSQL gerenciado), que aplica automaticamente as migrations de `netlify/database/migrations/`; `crm-sync.mts` agenda a sincronização a cada 10 min. Para hospedar em outro lugar, basta ignorar/remover a pasta `netlify/functions` e o `netlify.toml`.

## 11. Testes

```bash
npm test          # 55 testes (unitários + integração com PostgreSQL via PGlite)
npm run typecheck
```

Cobrem: máscara/normalização de telefone; schema de validação; envio válido com persistência, UTM, consentimento e outbox; dados inválidos (422); JSON malformado, Content-Type, tamanho, método; SQL injection; idempotência com requisições concorrentes; reenvio acidental; honeypot e envio rápido demais; rate limit por IP e por telefone; banco indisponível (503) e erro inesperado (500) sem vazamento; CORS; rotas admin; `CrmLeadClient` contra um servidor HTTP local de teste (classificação de status, timeout, erro de rede, redação de PII); CRM não configurado mantém `pending_sync`; sucesso só com 2xx; reenvio após falha; `sync_failed` após limite ou erro permanente; reprocessamento (requeue); exclusão mútua entre workers; backoff; exigência de HTTPS para o CRM em produção; cliente HTTP do frontend.

## 12. Pendências que dependem do CRM / da Qualimix

- URL do endpoint, método de autenticação e token do CRM (`CRM_API_URL`, `CRM_API_TOKEN`).
- Contrato do payload e do retorno (ajustar `crmPayload.ts` e, se preciso, `extractExternalId` em `CrmLeadClient.ts`).
- Confirmação de que o CRM aceita `Idempotency-Key`/`external_id` para deduplicação.
- Revisão jurídica do aviso de privacidade e definição de retenção de dados.
- Domínio definitivo do site e da API (para `ALLOWED_ORIGINS` e `VITE_API_BASE_URL`).
