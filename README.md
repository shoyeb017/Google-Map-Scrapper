# Business Lead Scraper & Company Intelligence Platform

Next.js + React + TypeScript + Supabase. Google Places API + Browser Discovery + Website Enrichment. No Docker.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # unit tests
npm run build && npm start
```

## Environment

Copy `.env.example` to `.env.local` and fill in:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase Cloud (server key stays server-only). Until set, app uses local `.data/` store with the same pipeline |
| `GOOGLE_MAPS_API_KEY` | Google Places API (New). Server-only. Without it use Browser Discovery |
| `BROWSER_DISCOVERY_ENABLED` | `true` to enable Playwright discovery |
| `PLAYWRIGHT_BROWSER`, `BROWSER_TIMEOUT_MS`, `BROWSER_CONCURRENCY`, `BROWSER_MAX_PAGES`, `BROWSER_MAX_RESULTS` | Browser tuning |
| `WEBSITE_ENRICHMENT_ENABLED`, `ENRICHMENT_MAX_PAGES`, `ENRICHMENT_TIMEOUT_MS`, `ENRICHMENT_CONCURRENCY` | Crawler tuning |
| `RAW_PAYLOAD_MODE` | `normalized-only` (default) or `full` or `none` — respects provider ToS |

## Supabase setup

1. Create a project at supabase.com.
2. Set the three Supabase env vars.
3. Apply migrations in order: `supabase/migrations/001_initial_schema.sql`, `002_jobs_exports_settings.sql`, `003_indexes_rls.sql` (SQL editor or `supabase db push`).
4. RLS is enabled with permissive `dev_all` policies for local dev — tighten before public launch.

## Providers

- **Google Places API** (`lib/providers/google-places/`): Text Search, no review fields requested. Errors mapped to `AUTHENTICATION | QUOTA | RATE_LIMIT | TIMEOUT | ...`.
- **Browser Discovery** (`lib/providers/browser-discovery/`): Playwright, public result cards only. No CAPTCHA/anti-bot bypass. Needs `npx playwright install chromium`.
- **Orchestrator** (`lib/providers/orchestrator.ts`): `google_places | browser_discovery | automatic` + primary/fallback, records `provider_attempts`, `fallback_used`, `fallback_reason`.

## Pipeline

Search API → Orchestrator → Normalization (`lib/normalization`) → Dedup (`lib/deduplication`: placeId → domain → phone → address → geo) → Store (Supabase or `.data/`) → Website enrichment (`lib/enrichment/crawler.ts`: robots-aware, same-domain, SSRF-protected via `lib/security/ssrf.ts`) → Contacts (`lib/contacts`) + Social (`lib/social`) → Dashboard → CSV/XLSX (`lib/exports`, ExcelJS).

No reviews are collected, stored, displayed, or exported — by schema design.

## Key routes

- Pages: `/`, `/search`, `/businesses`, `/businesses/[id]`, `/map`, `/jobs`, `/exports`, `/providers`, `/settings`, `/saved-searches`, `/logs`
- APIs: `POST /api/search`, `GET /api/businesses`, `GET /api/businesses/[id]`, `POST /api/enrich`, `POST|GET /api/export`, `GET /api/health`, `GET /api/jobs`

## Deployment

Vercel (web) + Supabase (db) + any managed Node worker for Playwright/enrichment. No Docker required. Windows-compatible.
