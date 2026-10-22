# IPO Red-Flag & Promise Tracker

A visual research site for Indian mainboard IPOs. It reads each 300–500 page DRHP/RHP,
runs 12 forensic red-flag checks (each citing the exact filing page), produces a 0–100 risk
score, and after listing tracks whether the company kept its prospectus promises.

> **Not investment advice.** Educational tool only. It never says "invest" or "avoid".

## Repo layout

| Folder      | What it is                                          | Runs where  |
| ----------- | --------------------------------------------------- | ----------- |
| `client/`   | React + Vite + Tailwind + ECharts site              | Vercel      |
| `server/`   | Express 5 API serving stored, chart-ready JSON      | Render      |
| `pipeline/` | Offline Node jobs: scrape, extract, score, index    | Your laptop |
| `parser/`   | Python PDF → pages/sections/tables (PyMuPDF)        | Your laptop |
| `shared/`   | TypeScript types + Zod schemas used by all of above | (library)   |
| `supabase/` | Postgres migrations and Supabase CLI config         | Supabase    |

## Getting started

```bash
npm install
cp .env.example .env      # fill in values as each phase needs them
npm run dev:server        # http://localhost:4000/api/health
npm run dev:client        # http://localhost:5173
```

Useful scripts: `npm run typecheck`, `npm run lint`, `npm run format`, `npm run qdrant:up` (needs Docker).

## Database

The schema lives in `shared/src/db/schema.ts` (Drizzle). Migrations are generated into
`supabase/migrations/`; never edit them by hand.

```bash
npm run db:generate -- --name <change>   # after editing schema.ts
npm run db:migrate                       # apply to DATABASE_URL
npm run db:studio                        # browse tables locally
```

## Scraping new filings (Phase 2)

```bash
npm run scrape -- --dry-run                 # fetch + parse SEBI, BSE, NSE; write nothing
npm run scrape                              # upsert into ipos + filings (last 30 days)
npm run scrape -- --since 2025-01-01 --pages 40   # backfill
npm test                                    # parser tests against saved real responses
```

Requests are throttled per site (1.5–2 s apart) and cached in `data/cache/` for a few hours.
On Reliance Jio, Supabase's Postgres ports are blocked: turn on Cloudflare WARP first.

## Downloading filings (Phase 2)

```bash
npm run download -- --dry-run --limit 5     # resolve PDF links only
npm run download -- --limit 10              # download the 10 newest 'found' filings
npm run download -- --ipo paras-healthcare  # one company
npm run download -- --retry-failed          # try failed ones again
npm run upload -- --ipo <slug> --type drhp --file path/to/file.pdf   # admin fallback
```

PDFs are stored once under their SHA-256 in `data/filings/ab/abcd….pdf` (local disk: Supabase
Storage's free 1 GB can't hold hundreds of ~10 MB filings). Status moves
`found → downloaded | duplicate | failed`.
