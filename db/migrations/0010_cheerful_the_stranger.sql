CREATE TYPE "public"."project_status" AS ENUM('active', 'on_hold', 'rejected', 'closed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."service_track" AS ENUM('Tier_1', 'Tier_3');--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "record_id" DROP NOT NULL;--> statement-breakpoint
-- Projects made before this migration have no website request ID or service
-- track. They get a placeholder ID that cannot clash with a website one, and
-- Tier 1, so the columns can be required.
ALTER TABLE "projects" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "service_track" "service_track";--> statement-breakpoint
UPDATE "projects" SET "request_id" = 'LEGACY-' || "id", "service_track" = 'Tier_1';--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "request_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "service_track" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status" "project_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "reason" text;--> statement-breakpoint
CREATE INDEX "audit_log_project_id_idx" ON "audit_log" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_request_id_unique" UNIQUE("request_id");