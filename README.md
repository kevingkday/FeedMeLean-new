# FeedMeLean — Mobile-First Cloudflare Rebuild

A fast, mobile-first Progressive Web Application (PWA) built with **React 19 + TypeScript + Vite + Tailwind CSS** and hosted entirely on **Cloudflare Workers + Cloudflare D1 (SQLite)** within Cloudflare's free tier.

FeedMeLean helps users reach a specific target body-fat percentage (e.g., 22% → 12% BF) and makes logging daily nutrition effortless.

---

## 1. Local Development Setup

### Prerequisites
- Node.js 20+
- npm 10+

### Install & Initialize Local D1 Database
```bash
# 1. Install dependencies
npm install

# 2. Apply D1 SQLite migrations locally
npm run db:migrate:local

# 3. Optional: Create .dev.vars for local AI provider credentials
# (If omitted, FeedMeLean automatically uses its built-in nutrition estimator for local testing)
cat << 'EOF' > .dev.vars
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
AI_API_KEY=sk-your-api-key
ADMIN_EMAIL=you@feedmelean.com
EOF

# 4. Build and start the local Cloudflare Worker + SPA server on http://localhost:8788
npm run dev
```

For dual-terminal frontend Hot Module Replacement (HMR):
- Terminal 1: `npm run dev:worker` (runs Wrangler Worker + local D1 on port `8788`)
- Terminal 2: `npm run dev:client` (runs Vite HMR on port `5173`, proxying `/api/*` to `8788`)

### Run Automated Tests
```bash
npm test
```

---

## 2. Environment Variables & Cloudflare Secrets

### Variables (in `wrangler.jsonc`)
| Variable | Default | Description |
| :--- | :--- | :--- |
| `AI_PROVIDER` | `openai` | `openai`, `gemini`, or `anthropic` |
| `AI_MODEL` | `gpt-4o-mini` | e.g., `gpt-4o-mini`, `gemini-2.5-flash`, `claude-3-5-haiku-latest` |
| `ADMIN_EMAIL` | *(optional)* | Email address automatically granted `admin` role upon registration (the first registered user is also made `admin`) |

### Secrets (stored via `wrangler secret put`)
| Secret | Required | Description |
| :--- | :--- | :--- |
| `AI_API_KEY` | Yes (Prod) | API key for the configured `AI_PROVIDER` |
| `RESEND_API_KEY` | Optional | Transactional email API key for outbound password-reset emails |

---

## 3. Staging Deployment (Safe Parallel Testing)

Deploy to a staging Worker (`feedmelean-staging.workers.dev`) with a separate staging D1 database so the existing production Blazor site at `feedmelean.com` remains untouched until you approve cutover:

```bash
# 1. Authenticate with your Cloudflare account
npx wrangler login

# 2. Create the Staging D1 database
npx wrangler d1 create feedmelean-staging-db
```

Copy the returned `database_id` into `wrangler.jsonc` under `env.staging.d1_databases[0].database_id`, then run:

```bash
# 3. Apply schema migrations to Staging D1
npx wrangler d1 migrations apply feedmelean-staging-db --env staging --remote

# 4. Set your AI API key secret on Staging
npx wrangler secret put AI_API_KEY --env staging

# 5. Build and deploy to Staging
npm run deploy:staging
```

---

## 4. Production Deployment & `feedmelean.com` Cutover

Once you have verified the staging deployment and are ready to cut over `feedmelean.com`:

```bash
# 1. Create the Production D1 database
npx wrangler d1 create feedmelean-db
```

Copy the returned `database_id` into the top-level `d1_databases[0].database_id` in `wrangler.jsonc`.

To attach the custom domain `feedmelean.com` (and `www.feedmelean.com`) with automatic Cloudflare HTTPS certificates, add the `routes` block to `wrangler.jsonc`:

```jsonc
  "routes": [
    { "pattern": "feedmelean.com", "custom_domain": true },
    { "pattern": "www.feedmelean.com", "custom_domain": true }
  ],
```

Then apply migrations, set secrets, and deploy:

```bash
# 2. Apply schema migrations to Production D1
npm run db:migrate:remote

# 3. Configure Production secrets
npx wrangler secret put AI_API_KEY
# Optional: npx wrangler secret put RESEND_API_KEY

# 4. Build and deploy to Production
npm run deploy:production
```

### Cloudflare Free-Tier Notes
- **Workers & Static Assets**: Static frontend files (`dist/client`) are served directly by Cloudflare Workers Static Assets at zero Worker invocation cost; only `/api/*` requests count against the 100,000 requests/day free tier.
- **D1 SQLite**: All queries use composite indexes (`idx_meal_logs_user_date`, `idx_saved_meals_user_sort`, `idx_sessions_token`) and normalized AI meal caching (`ai_meal_cache`) to stay well within D1's free tier (5 million rows read / 100,000 rows written per day).

