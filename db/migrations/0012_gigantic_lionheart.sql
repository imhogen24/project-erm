ALTER TABLE "tool_records" ADD COLUMN "cycle" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tool_records_one_live_per_cycle" ON "tool_records" USING btree ("project_id","tool_id","cycle") WHERE "tool_records"."state" <> 'void';--> statement-breakpoint
ALTER TABLE "tool_records" ADD CONSTRAINT "tool_records_cycle_positive" CHECK ("tool_records"."cycle" >= 1);