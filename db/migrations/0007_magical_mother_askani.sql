CREATE TYPE "public"."access_action" AS ENUM('invited', 'roles_added', 'invite_accepted');--> statement-breakpoint
CREATE TABLE "access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" "access_action" NOT NULL,
	"person_id" uuid,
	"email" text NOT NULL,
	"project_id" uuid NOT NULL,
	"roles" "role"[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_actor_id_people_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE FUNCTION "access_log_is_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'access_log lines cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "access_log_append_only" BEFORE UPDATE OR DELETE ON "access_log" FOR EACH ROW EXECUTE FUNCTION "access_log_is_append_only"();
