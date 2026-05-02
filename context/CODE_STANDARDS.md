# Code Standards

## General

- Keep modules small and single-purpose
- Fix root causes, do not layer workarounds
- Do not mix unrelated concerns in one component or route
- Prefer keeping pages as server components; extract interactive logic into client components.
- Follow existing project conventions when adding or extracting components. Example: if the codebase uses type aliases consistently, don’t introduce interface without a clear reason.


## TypeScript

- Strict mode is required throughout the project
- Avoid any — use explicit interfaces or narrowly scoped types
- Validate unknown external input at system boundaries before trusting it

## Next.js

- Default to server components
- Add use client only when browser interactivity requires it
- Keep route handlers focused on a single responsibility
- Default to server actions for UI-driven mutations.
- Use API routes when you need a stable, external-facing, or middleware-heavy boundary (e.g., rate limiting, webhooks, third-party access, versioning).

## Styling

- Use CSS custom property tokens defined in globals.css — no raw Tailwind color classes like zinc-* or hardcoded hex values.
- Reference tokens through their Tailwind utility names: bg-base, text-copy-primary, border-surface-border, text-brand, etc.
- Maintain the border radius scale: rounded-xl for small elements, rounded-2xl for cards, rounded-3xl for modals.

## API Routes

- Validate and parse request input before any logic runs.
- Enforce auth and project ownership checks before any mutation.
- Return consistent, predictable response shapes.
- Keep route handlers thin — push complexity into shared modules or background tasks.

## Data and Storage

- Project metadata and relationships belong in Neon.
- All binary assets belong in file storage via `lib/storage/`; Neon stores only the provider-neutral `storage_key` reference, never a provider-specific URL and never large content directly in the database.

## File Organization

- `lib/` — shared infrastructure: drizzle client, auth helpers, utilities.
- `components/` — UI composition: page-level layouts, feature-level sections, form widgets, and shared display elements. No data fetching, no auth logic.
- `app/api/` — route handlers for auth, triggering, and persistence.
- Name files after the responsibility they contain, not the technology.
