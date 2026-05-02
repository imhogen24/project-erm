# Architecture Context

## Stack

| Layer     | Technology                    | Role                                                                      |
| --------- | ----------------------------- | ------------------------------------------------------------------------- |
| Framework | Next.js (App Router) + TypeScript | Full-stack app; server components handle data fetching, client components handle interactive forms and real-time UI |
| UI        | Tailwind + shadcn/ui          | Component composition and styling                                         |
| Auth      | better-auth                   | Session management, role assignment, and route protection                 |
| Database  | Drizzle ORM + Neon PostgreSQL | Relational metadata: projects, tool instances, staff, NCRs, audit logs    |
| Storage   | UploadThing (current provider) | Binary assets: CAD files, TDP PDFs, metrology photos, compliance documents |
| Deployment | Vercel                       | Hosting, edge functions, and environment management                       |


## System Boundaries

- `src/app/` — Pages, layouts, and route handlers. Route handlers in `app/api/` own input validation, role checks, gate enforcement, and DB writes. No business logic lives in page components.
- `components/` — UI-only. Components read props and fire callbacks; they do not call the database or enforce access control directly.
- `lib/` — Shared infrastructure: Drizzle client, better-auth config, and utility helpers. Nothing in `lib/` imports from `app/` or `components/`.
- `db/` — Drizzle schema files and generated migration SQL. This is the single source of truth for table structure.
- `server/` — Server-side domain logic: gate engine (lock/unlock sequencing), auto-populate engine (field inheritance), and sign-off handler (status transitions and DB writes triggered by PM approval). These are plain TypeScript modules called from route handlers, not from components.
- `lib/storage/` — Storage abstraction. Exports a single `storage` object with `upload`, `download`, and `delete` methods. All application code calls this interface. The concrete provider (currently UploadThing) is wired in here and nowhere else. The abstraction is designed so that migrating to AWS S3 or Vercel Blob requires changes only in this folder — no application-level rewrites.

## Storage Model

**Database (Neon PostgreSQL):** All structured, queryable data. This includes project metadata, tool instance records (form state stored as JSONB in `tool_instances.data`), staff and assignment records, NCR records, payment milestone state, audit log entries, and gate state (which tools are locked, active, or signed off). The `tool_definitions` table holds the canonical JSON schema for each of the 13 workbook tools — this is the source the form renderer reads.

**File storage (provider-agnostic):** All binary assets — CAD files, TDP PDFs, metrology photos, and compliance documents. The application never calls a storage provider SDK directly; it always goes through the `lib/storage/` abstraction. The current provider is UploadThing. The system is built to migrate to AWS S3 or Vercel Blob with no application rewrites — the database stores only a provider-neutral `storage_key` and display metadata (filename, size, uploader, timestamp) in a `file_attachments` table, never the file content and never a provider-specific URL that would break on migration.

There is no separate cache layer. Neon's connection pooler handles concurrency. If query latency becomes a problem, add a server-side cache (`unstable_cache` in Next.js) at the route handler level, not by introducing a new storage layer.

## Auth and Access Model

better-auth manages sessions via HTTP-only cookies. On sign-in, the user's `role` field is embedded in the session. The role enum must match the 14 roles defined in the SOP: `admin`, `project_manager`, `lead_engineer`, `associate_engineer`, `cad_engineer`, `head_of_engineering`, `onboarding_manager`, `finance_officer`, `procurement_officer`, `qa_officer`, `fabrication_tech`, `it_admin`, `executive`, `client`.

Every route handler reads the session and checks two things before executing: (1) is the user authenticated, and (2) does their role permit the action being requested. A client can view their own project but cannot write to any tool instance. A process owner can write to a tool instance only if it is currently in the `active` state and assigned to a role they hold. A PM can approve and lock a tool. Only an `admin` can manage staff records and system configuration.

Ownership of a project is recorded in `projects.created_by`. Clients are linked to projects via `projects.client_id`. Neither field changes after project creation.

## Background Tasks

There are no long-running AI or ML tasks in the current scope. The most expensive synchronous operation is the gate engine evaluation on PM sign-off — it reads tool dependency state and updates `tool_instances` status in a single database transaction. This is fast enough to run inline in a route handler.

If notification delivery (email) becomes slow under load, move it to a fire-and-forget queue. Do not block the sign-off response on email delivery.

## Invariants

1. **Gate order is never bypassed in the database.** The server-side gate engine checks prerequisite tool status before any `tool_instances` record can transition to `active`. No client input, no role, and no route handler may skip this check. The gate engine is always called — never conditionally.

2. **All role and ownership checks happen in route handlers, not in components.** Components receive already-filtered data. A component rendering a "locked" state is cosmetic only. The API enforces the lock regardless of what the UI shows.

3. **A locked tool instance is immutable.** Once `tool_instances.status` is set to `locked`, no field in `tool_instances.data` may be updated. The only permitted transition out of `locked` is a PM-initiated Change Request, which re-locks all downstream tools in the same transaction before unlocking the target.

4. **Auto-populated fields are never written by users.** Fields marked `inherited_from` in a tool's schema are populated by the auto-populate engine when the tool is opened, from the upstream tool instance record. Route handlers must reject any write that targets an inherited field directly.

5. **File operations always go through `lib/storage/`.** No application code imports a storage provider SDK directly. The abstraction layer is the only place that knows which provider is active. This makes provider migration a single-folder change with no application-level rewrites.

6. **The `tool_definitions` table is read-only at runtime.** Tool schemas are seeded once from the 13 `*_schema.json` files and never modified by application code. Schema changes go through a migration, not a runtime update.
