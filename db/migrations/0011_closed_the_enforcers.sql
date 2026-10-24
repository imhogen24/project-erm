CREATE TYPE "public"."change_request_status" AS ENUM('requested', 'approved', 'rejected', 'applied');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'change_requested';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'change_approved';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'change_rejected';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'change_applied';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'built_on_change';--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" "change_request_status" DEFAULT 'requested' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"rejection_reason" text,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_record_id_tool_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."tool_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requested_by_people_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_decided_by_people_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_requests_project_id_idx" ON "change_requests" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "change_requests_one_open_per_record" ON "change_requests" USING btree ("record_id") WHERE "change_requests"."status" IN ('requested', 'approved');