ALTER TYPE "public"."record_state" ADD VALUE 'void';--> statement-breakpoint
CREATE TABLE "workbook_rollbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"from_workbook" integer NOT NULL,
	"to_workbook" integer NOT NULL,
	"reason" text NOT NULL,
	"approved_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workbook_rollbacks" ADD CONSTRAINT "workbook_rollbacks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workbook_rollbacks" ADD CONSTRAINT "workbook_rollbacks_approved_by_people_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workbook_rollbacks_project_id_idx" ON "workbook_rollbacks" USING btree ("project_id");