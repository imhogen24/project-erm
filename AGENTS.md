<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


IMPORTANT RULES: 
- Put all docs in the `docs/` directory. 
- All `.md` naming conventions should follow `docs/[name]/_.md`. 
- Always run the neccesary linters and typecheckers before committing.
- Run `coderabbit review` before committing your changes.
- NEVER push directly to the main branch.
- always use `bun` instead of `npm` or `pnpm`.
- when implementing a new feature, check if the skill needed to complete the task is available.
- In documentation, avoid phase 1, phase 2, and avoid indicating timelines on project stages.
- Do NOT add `Co-Authored-By`, `Claude-Session`, "Generated with Claude Code", or any similar AI-attribution trailer or line to commit messages or PR bodies. Keep commit messages simple, eg. "feat(db): write db schema".


Do not begin a second workstream's branch before the previous one is merged.

## UI Rules
- Use stritcly shadcn ui components.
- Use mobile first approach.
- Never mark a page (`app/**/page.tsx`) as a Client Component. Pages stay Server Components; push `"use client"` down into the specific leaf component that actually needs interactivity.
