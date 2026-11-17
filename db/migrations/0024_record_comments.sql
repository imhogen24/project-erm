ALTER TYPE "public"."audit_action" ADD VALUE 'commented';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'comment_resolved';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'commented';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'comment_replied';--> statement-breakpoint
CREATE TABLE "record_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"author_id" uuid NOT NULL,
	"author_role" "role" NOT NULL,
	"body" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "record_comments" ADD CONSTRAINT "record_comments_record_id_tool_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."tool_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_comments" ADD CONSTRAINT "record_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_comments" ADD CONSTRAINT "record_comments_parent_id_record_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."record_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_comments" ADD CONSTRAINT "record_comments_author_id_people_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_comments" ADD CONSTRAINT "record_comments_resolved_by_people_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "record_comments_record_id_idx" ON "record_comments" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "record_comments_parent_id_idx" ON "record_comments" USING btree ("parent_id");