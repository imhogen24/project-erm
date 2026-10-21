CREATE TYPE "public"."record_state" AS ENUM('draft', 'submitted', 'approved', 'locked');--> statement-breakpoint
CREATE TABLE "tool_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tool_id" text NOT NULL,
	"state" "record_state" DEFAULT 'draft' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_records" ADD CONSTRAINT "tool_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tool_records_project_id_tool_id_idx" ON "tool_records" USING btree ("project_id","tool_id");