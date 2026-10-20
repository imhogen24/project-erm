CREATE TYPE "public"."role" AS ENUM('Client', 'OM', 'PM', 'LE', 'AE', 'LD', 'FO', 'CA', 'HE', 'PO', 'IO', 'WS', 'T', 'QA', 'LFE', 'LO', 'CR', 'IT/Admin', 'MKT');--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "person_project_roles" (
	"person_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	CONSTRAINT "person_project_roles_person_id_project_id_role_pk" PRIMARY KEY("person_id","project_id","role")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_project_roles" ADD CONSTRAINT "person_project_roles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_project_roles" ADD CONSTRAINT "person_project_roles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_project_roles_project_id_idx" ON "person_project_roles" USING btree ("project_id");