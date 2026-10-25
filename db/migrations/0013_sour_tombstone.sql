ALTER TABLE "person_company_roles" ADD CONSTRAINT "person_company_roles_not_system" CHECK ("person_company_roles"."person_id" <> '00000000-0000-4000-8000-000000000001');--> statement-breakpoint
ALTER TABLE "person_project_roles" ADD CONSTRAINT "person_project_roles_not_system" CHECK ("person_project_roles"."person_id" <> '00000000-0000-4000-8000-000000000001');--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_not_system" CHECK ("accounts"."person_id" <> '00000000-0000-4000-8000-000000000001');--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_not_system" CHECK ("sessions"."person_id" <> '00000000-0000-4000-8000-000000000001');--> statement-breakpoint
-- The reserved person automated jobs act as (systemPerson in
-- db/schema/access.ts). Written by hand, since drizzle-kit does not generate
-- data. It has no account, so it cannot sign in.
INSERT INTO "people" ("id", "name", "email") VALUES ('00000000-0000-4000-8000-000000000001', 'System', 'system@erm.invalid') ON CONFLICT ("id") DO NOTHING;