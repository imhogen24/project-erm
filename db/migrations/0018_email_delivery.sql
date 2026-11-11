ALTER TYPE "public"."notification_kind" ADD VALUE 'email_unconfirmed';--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "unconfirmed_at" timestamp with time zone;