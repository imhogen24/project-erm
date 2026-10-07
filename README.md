# IMHOGEN ERM

This is the web app version of IMHOGEN's engineering SOP — the process that currently lives in a stack of spreadsheets and takes a project from "someone emailed us about a machine" all the way through design, fabrication, QA, delivery, and post-delivery support.

If you haven't read the process itself yet, start there before touching code:

- `docs/dev_docs/README.md` — the SOP/QMS overview, the 13 workbooks, how a project moves through them
- `docs/dev_docs/CRITICAL_DATA_STRUCTURE/` — the permissions matrix (who can touch what), the SSOT fields, and the metadata schema every record in the system is built from

Those docs describe the business. This README is about the codebase.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16, React 19 |
| UI | Tailwind v4, shadcn/ui |
| Database | Postgres (Neon) |
| ORM | Drizzle |
| Auth | Better-Auth |
| File storage | Cloudflare R2 |
| Email | Resend |
| Background jobs | Inngest |
| Forms | Zod, React Hook Form |
| PDFs | React-PDF, pdf-lib |
| Testing | Vitest, Playwright |
| Linting | ESLint, Prettier, Oxlint, @shadcn/lint |
| Env vars | dotenvx (`.env.development`, encrypted) |
| Package manager | bun |



## Running it locally

```bash
bun install
bun dev
```

The app runs at `localhost:3000`.

`.env.development` is encrypted and safe to have in git. To decrypt it locally you need the private key — ask a teammate for it (it's not in git) and either let dotenvx store it in your OS keychain on first use, or drop it into a local `.env.keys` file as `DOTENV_PRIVATE_KEY_DEVELOPMENT=...`.

## Before you open a PR

- `bun run lint`
- `bun run typecheck`
- `coderabbit review`

The full set of rules for how we work in this repo — docs conventions, what "always use bun" actually means, how skills get picked up, branch/commit rules — lives in `AGENTS.md`. Read it. It's short and it's enforced.

One thing worth repeating here because it trips people up: this Next.js build has breaking changes from what you've seen before. Check `node_modules/next/dist/docs/` before you write anything that touches routing, data fetching, or caching — don't assume it works the way it used to.
