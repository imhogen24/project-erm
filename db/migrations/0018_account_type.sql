CREATE TYPE "public"."account_type" AS ENUM('client', 'staff');--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "account_type" "account_type" DEFAULT 'staff' NOT NULL;--> statement-breakpoint
-- Everyone here came by invite or seed, which proved their email.
UPDATE "people" SET "email_verified" = true;--> statement-breakpoint
-- A person who is only ever Client is a client. Everyone else stays staff.
UPDATE "people" SET "account_type" = 'client'
WHERE EXISTS (
  SELECT 1 FROM "person_project_roles" r WHERE r."person_id" = "people"."id" AND r."role" = 'Client'
)
AND NOT EXISTS (
  SELECT 1 FROM "person_project_roles" r WHERE r."person_id" = "people"."id" AND r."role" <> 'Client'
)
AND NOT EXISTS (
  SELECT 1 FROM "person_company_roles" c WHERE c."person_id" = "people"."id"
);
