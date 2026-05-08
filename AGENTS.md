<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Application Building Context

Read the following files in order before implementing
or making any architectural decision:

1. `context/PROJECT_OVERVIEW.md` — product definition,
   goals, features, and scope
2. `context/ARCHITECTURE.md` — system structure,
   boundaries, storage model, and invariants
3. `context/UI_CONTEXT.md` — theme, colors, typography,
   and component conventions
4. `context/CODE_STANDARDS.md` — implementation rules
   and conventions
5. `context/AI_WORKFLOW_RULES.md` — development workflow,
   scoping rules, and delivery approach
6. `context/PROGRESS_TRACKER.md` — current phase,
   completed work, open questions, and next steps

Update `context/PROGRESS_TRACKER.md` after each
meaningful implementation change.

If implementation changes the architecture, scope, or
standards documented in the context files, update the
relevant file before continuing.

## File Naming Conventions

- **Context/documentation markdown files** (`context/`, `docs/CRITICAL_DATA_STRUCTURE/`):
  use `SCREAMING_SNAKE_CASE.md` (e.g. `AGENT_ROLES.md`, `CODE_STANDARDS.md`)
- **Workbook JSON files** (`docs/WORKBOOK_XX/`):
  use `XX_lowercase_snake_case.json` (e.g. `01_project_onboarding.json`)
- `README.md` is always `README.md` regardless of location
