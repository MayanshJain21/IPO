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
