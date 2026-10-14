CREATE TABLE "eval_suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"host_agent_id" uuid NOT NULL,
	"scope" text DEFAULT 'full' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"agent_version" integer NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"case_ids" jsonb NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"vacuous" jsonb,
	"traces_passed" integer DEFAULT 0 NOT NULL,
	"traces_total" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision,
	"duration_ms" integer,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "eval_runs" DROP CONSTRAINT "eval_runs_case_id_eval_cases_id_fk";
--> statement-breakpoint
ALTER TABLE "eval_runs" ALTER COLUMN "case_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "suite_run_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "case_name" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "expected_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_suite_runs_owner_started_idx" ON "eval_suite_runs" USING btree ("owner_kind","owner_id","started_at");--> statement-breakpoint
CREATE INDEX "eval_suite_runs_workspace_started_idx" ON "eval_suite_runs" USING btree ("workspace_id","started_at");--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suite_run_id_eval_suite_runs_id_fk" FOREIGN KEY ("suite_run_id") REFERENCES "public"."eval_suite_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_case_id_eval_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eval_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_cases_owner_idx" ON "eval_cases" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_owner_source_finding_uq" ON "eval_cases" USING btree ("owner_kind","owner_id","source_finding_id") WHERE "eval_cases"."source_finding_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "eval_runs_suite_idx" ON "eval_runs" USING btree ("suite_run_id");--> statement-breakpoint
CREATE INDEX "eval_runs_case_idx" ON "eval_runs" USING btree ("case_id","ran_at");