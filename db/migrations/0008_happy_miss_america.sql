ALTER TYPE "public"."access_action" ADD VALUE 'signed_in';--> statement-breakpoint
ALTER TYPE "public"."access_action" ADD VALUE 'signed_out';--> statement-breakpoint
ALTER TABLE "access_log" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "access_log" ALTER COLUMN "roles" DROP NOT NULL;