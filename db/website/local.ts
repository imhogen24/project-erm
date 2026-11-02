import type { Database } from "@/db"

export class NotLocalDatabaseError extends Error {}

// Copies of the website's tables, for development and tests only, so the
// intake has something to read. They match the production tables in
// `./schema.ts`. This never runs in a migration and refuses any database that
// is not on this machine, so it can never touch the website's real tables.
const statements = [
  `CREATE TABLE IF NOT EXISTS "custom_engineering_submissions" (
    "custom_engineering_id" text PRIMARY KEY NOT NULL,
    "organization_name" text NOT NULL,
    "contact_person" text NOT NULL,
    "email" text NOT NULL,
    "phone_number" text NOT NULL,
    "site_location" text NOT NULL,
    "project_scope" jsonb NOT NULL,
    "project_title" text NOT NULL,
    "primary_objective" text NOT NULL,
    "material_inputs" text NOT NULL,
    "energy_and_information_inputs" text NOT NULL,
    "transformation" text NOT NULL,
    "outputs" text NOT NULL,
    "by_products" text,
    "human_system" text,
    "active_environment" text,
    "budget_expectations" text,
    "target_timeline" text,
    "file_attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "terms_accepted_at" timestamp with time zone NOT NULL,
    "request_id" text NOT NULL UNIQUE,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "admin_notified_at" timestamp with time zone,
    "confirmation_sent_at" timestamp with time zone,
    "notify_attempts" integer DEFAULT 0 NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "drafting_digitization_submissions" (
    "drafting_digitization_id" text PRIMARY KEY NOT NULL,
    "organization_name" text NOT NULL,
    "contact_person" text NOT NULL,
    "email" text NOT NULL,
    "phone_number" text NOT NULL,
    "site_location" text NOT NULL,
    "input_material_type" text NOT NULL,
    "asset_condition" text NOT NULL,
    "drafting_services" jsonb NOT NULL,
    "end_goal" text NOT NULL,
    "drafting_standard" text NOT NULL,
    "output_formats" jsonb NOT NULL,
    "file_attachment" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "terms_accepted_at" timestamp with time zone NOT NULL,
    "request_id" text NOT NULL UNIQUE,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "admin_notified_at" timestamp with time zone,
    "confirmation_sent_at" timestamp with time zone,
    "notify_attempts" integer DEFAULT 0 NOT NULL
  )`,
]

// URL keeps the brackets on an IPv6 host.
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"])

export async function createLocalWebsiteTables(database: Database) {
  const { hostname } = new URL(database.pool.options.connectionString ?? "")

  if (!localHosts.has(hostname)) {
    throw new NotLocalDatabaseError(
      `Refusing to create website tables on a database that is not local: ${hostname}`
    )
  }

  for (const statement of statements) {
    await database.pool.query(statement)
  }
}
