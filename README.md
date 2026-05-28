# AgentBudget — Lava Gateway Demo

Multi-agent cost governor built on [Lava](https://lava.so). Three agents (researcher / writer / reviewer) share a wallet, each with their own scoped spend key (model allowlist + daily cap). Demonstrates the three Lava pillars end-to-end:

- **Gateway** — all model calls flow through `https://api.lava.so` via the Anthropic SDK.
- **Spend keys** — one `lava_sk_*` per agent, scoped to a single model and a daily USD cap.
- **Billing visibility** — per-agent spend pulled live from `GET /v1/spend_keys`.

The pitch: agents need autonomy, but autonomy without budget guardrails is a runaway-spend problem. Lava is the guardrail.

## Setup

```bash
node --version            # need >=20
export LAVA_SECRET_KEY=aks_live_...   # from lava.so → Dashboard → Gateway → Secrets
npm install
npm run setup             # creates 3 spend keys, writes .agentbudget.json (chmod 600)
```

A `.env` with `LAVA_SECRET_KEY=...` also works — just `source .env` first.

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | Idempotent. Creates `researcher`, `writer`, `reviewer` spend keys on Lava and persists their secrets locally. |
| `npm run demo -- "<topic>"` | Runs the full pipeline once: researcher → writer → reviewer, prints each output, then the dashboard. |
| `npm run enforce` | Researcher + reviewer fire once in parallel. Writer loops until Lava rejects with "spend limit exceeded." Dashboard shows writer EXHAUSTED while peers are untouched. |
| `npm run dashboard` | Current per-agent spend from Lava, without running any agent. |

## Agent configuration

| Agent | Model | Daily cap |
|---|---|---|
| researcher | `claude-sonnet-4-6` | $2.00 |
| writer | `claude-haiku-4-5` | **$0.05** (intentionally low so `enforce` exhausts it fast) |
| reviewer | `claude-opus-4-7` | $5.00 |

Edit these in [src/config.ts](src/config.ts).

## Demo walkthrough

1. `npm run setup` — three keys appear in the Lava dashboard.
2. `npm run demo -- "the rise of small language models"` — see the three agents collaborate; final table shows per-key cost from Lava.
3. `npm run enforce` — the money moment. Watch the writer hit its $0.05 cap mid-loop (~10–15 iterations) while the other two agents complete normally with full budgets remaining. Lava's error: `"Service key spend limit exceeded."`
4. Open Lava's web dashboard side-by-side — the same exhaustion shows up there, proving the CLI is reading real metering, not local fiction.

## Architecture

```
src/
  index.ts            CLI dispatch
  config.ts           Agent definitions, env loader, state persistence
  lava.ts             Lava REST client — single source of truth for endpoints/headers
  setup.ts            Idempotent spend-key creation
  dashboard.ts        Per-agent cost table from Lava's `current_spend`
  agents/
    run.ts            Shared Anthropic SDK call + budget-exhausted classifier
    researcher.ts     Sonnet — 3 research bullets
    writer.ts         Haiku — detailed draft (intentionally chatty to burn budget)
    reviewer.ts       Opus — 3-bullet critique
```

## Cost source of truth

The dashboard's dollar column comes from `current_spend` on each spend key (`GET /v1/spend_keys`), not from local token-math. This is the point of the demo: Lava meters the calls, we just display what Lava says. Token columns are session-local (from the Anthropic SDK's `usage` field) since `/v1/usage` is daily-aggregated and doesn't break down by spend key.

## Lava API surface used

Verified against the live API on 2026-05-27:

- `POST /v1/spend_keys` — create. Must pass `request_shape: 'anthropic'` or the SDK gets 403'd.
- `GET /v1/spend_keys` — list with `current_spend`, `spend_limit`, `total_spend` on each.
- `DELETE /v1/spend_keys/{id}` — revoke (used by `setup` when reconciling orphans).
- `GET /v1/usage?start=<ISO8601>` — wallet-wide aggregates (footer line only).
- Gateway: Anthropic SDK with `baseURL: 'https://api.lava.so'` (SDK appends `/v1/messages`).
- Auth: `Authorization: Bearer aks_live_*` for management, `lava_sk_*` as the SDK `apiKey`.

## Files & secrets

- `.env` — contains `LAVA_SECRET_KEY`. Gitignored, chmod 600.
- `.agentbudget.json` — caches the three spend-key secrets locally (Lava only returns them once at creation). Gitignored, chmod 600. Delete it to force recreation on next `setup`.

## Stretch (not built)

- `x-lava-fallbacks` header for fallback model chains
- OpenAI-format `/v1/openai/...` shim (Lava supports cross-format proxy)
- Webhook listener for low-balance alerts
