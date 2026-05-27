# Contributing to Site IQ

Thanks for your interest. This is the public mirror of the Site IQ codebase.

## Stack

Next.js (App Router) + React + TypeScript + Tailwind CSS - Supabase (PostgreSQL + row-level security + Auth) - n8n (workflow automation: crawl, checks, scoring, chat) - Firecrawl + OpenAI - Vercel.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your own keys
npm run dev
```

Useful checks:

```bash
npm run test:unit     # Vitest unit + route-handler tests
npx tsc --noEmit      # type-check
npm run lint          # ESLint
```

## The audit engine

The deterministic checks live in `src/lib/audit/checks.ts` - the single source of truth. They are mirrored into the n8n "Run checks" node, and `src/lib/audit/parity.test.ts` guards that the two stay identical. **Run the parity test after any change to a check.** See `docs/CHECK-METHODOLOGY.md` for how every check is verified (and where a static crawl cannot verify something).

## Pull requests

- Keep PRs focused and small.
- Add or update tests for any behavior change; `tsc`, `lint`, and the unit suite must pass.
- Don't commit secrets - configuration comes from environment variables (see `.env.example`).
- See `docs/ARCHITECTURE.md` and `docs/PROJECT-OVERVIEW.md` for the lay of the land.

## Security

Please report vulnerabilities privately - see [SECURITY.md](./SECURITY.md).
