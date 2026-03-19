ALTER TABLE "issues" ADD COLUMN "schedule" text;
ALTER TABLE "issues" ADD COLUMN "schedule_timezone" text DEFAULT 'UTC';
ALTER TABLE "issues" ADD COLUMN "schedule_next_run_at" timestamp with time zone;
ALTER TABLE "issues" ADD COLUMN "schedule_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "issues" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;
CREATE INDEX "issues_due_templates_idx" ON "issues" ("schedule_next_run_at") WHERE "issues"."is_template" = true AND "issues"."schedule_enabled" = true AND "issues"."schedule_next_run_at" <= now();
