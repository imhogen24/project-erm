ALTER TABLE "tool_records" ADD COLUMN "submitted_by" uuid;--> statement-breakpoint
ALTER TABLE "tool_records" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tool_records" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "tool_records" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tool_records" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tool_records" ADD CONSTRAINT "tool_records_submitted_by_people_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_records" ADD CONSTRAINT "tool_records_approved_by_people_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;