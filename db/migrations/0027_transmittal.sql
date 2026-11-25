ALTER TYPE "public"."notification_kind" ADD VALUE 'follow_up_sent';--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "copy" jsonb;