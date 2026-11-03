CREATE TYPE "public"."notification_kind" AS ENUM('new_request', 'assigned', 'approval_needed', 'tool_open', 'change_waiting', 'change_decided', 'email_bounced', 'client_slots_ready', 'client_brief_ready', 'client_responded', 'intake_failed');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"text" text,
	"project_id" uuid,
	"record_id" uuid,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_not_system" CHECK ("notifications"."person_id" <> '00000000-0000-4000-8000-000000000001'),
	CONSTRAINT "notifications_path_in_app" CHECK ("notifications"."path" LIKE '/%' AND "notifications"."path" NOT LIKE '//%')
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_record_id_tool_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."tool_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_person_id_created_at_idx" ON "notifications" USING btree ("person_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE FUNCTION "notifications_are_only_marked_read"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'notifications cannot be deleted';
	END IF;
	IF OLD.read_at IS NOT NULL
		OR NEW.read_at IS NULL
		OR (to_jsonb(NEW) - 'read_at') IS DISTINCT FROM (to_jsonb(OLD) - 'read_at') THEN
		RAISE EXCEPTION 'notifications can only be marked read';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "notifications_only_marked_read" BEFORE UPDATE OR DELETE ON "notifications" FOR EACH ROW EXECUTE FUNCTION "notifications_are_only_marked_read"();