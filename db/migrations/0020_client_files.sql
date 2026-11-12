CREATE TYPE "public"."file_storage" AS ENUM('uploadthing');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage" "file_storage" NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"size" bigint NOT NULL,
	"content_type" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"project_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_people_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- The website saves each file as `<link>,<file name>`, and D1.1 used to keep the
-- whole string as the link, so the file did not open and was named "File 1".
-- Split it: the link alone, and the client's file name where the name was the
-- default.
UPDATE "tool_records"
SET "payload" = jsonb_set("payload", '{attachedFiles}', (
	SELECT coalesce(jsonb_agg(
		CASE WHEN "file"->>'fileLink' ~ '^https://[^,[:space:]]+,.+$' THEN
			"file" || jsonb_build_object(
				'fileLink', split_part("file"->>'fileLink', ',', 1),
				'label', CASE WHEN coalesce("file"->>'label', '') ~ '^(File [0-9]+)?$'
					THEN substring("file"->>'fileLink' from position(',' in "file"->>'fileLink') + 1)
					ELSE "file"->>'label' END
			)
		ELSE "file" END
		ORDER BY "position"
	), '[]'::jsonb)
	FROM jsonb_array_elements("payload"->'attachedFiles') WITH ORDINALITY AS "files"("file", "position")
))
WHERE "tool_id" = 'D1.1'
	AND jsonb_typeof("payload"->'attachedFiles') = 'array'
	AND "payload"->'attachedFiles' @? '$[*] ? (@.fileLink like_regex "^https://[^,]+,")';
