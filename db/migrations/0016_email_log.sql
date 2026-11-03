CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed', 'delivered', 'bounced', 'complained');--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient" text NOT NULL,
	"kind" text NOT NULL,
	"project_id" uuid,
	"record_id" uuid,
	"message_id" text,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_record_id_tool_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."tool_records"("id") ON DELETE restrict ON UPDATE no action;