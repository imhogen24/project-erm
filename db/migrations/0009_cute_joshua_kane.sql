ALTER TYPE "public"."access_action" ADD VALUE 'roles_removed' BEFORE 'invite_accepted';--> statement-breakpoint
CREATE TABLE "person_company_roles" (
	"person_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	CONSTRAINT "person_company_roles_person_id_role_pk" PRIMARY KEY("person_id","role"),
	CONSTRAINT "person_company_roles_not_client" CHECK ("person_company_roles"."role" <> 'Client')
);
--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "person_company_roles" ADD CONSTRAINT "person_company_roles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_client_on_a_project" CHECK ("invitations"."project_id" IS NOT NULL OR NOT ('Client' = ANY("invitations"."roles")));