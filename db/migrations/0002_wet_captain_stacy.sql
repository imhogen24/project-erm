ALTER TABLE "tool_records" DROP CONSTRAINT "tool_records_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "tool_records" ADD CONSTRAINT "tool_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;