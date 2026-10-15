ALTER TABLE "ci_installations" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "repo_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "repo_github_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_path" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "branch" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_number" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_state" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "removal_branch" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "removal_pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "removal_pr_number" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "exported_ci_fail_on" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repo_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repo_full_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repo_github_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workflow_path" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_slug" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workflow_run_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "run_attempt" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_name" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "critical" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "warning" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "suggestion" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "blockers" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "partial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "skipped_files" jsonb;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "version" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_agent_repo_uq" ON "ci_installations" USING btree ("agent_id","repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_repo_slug_active_uq" ON "ci_installations" USING btree ("repo_id","slug") WHERE "ci_installations"."status" <> 'removed';--> statement-breakpoint
CREATE INDEX "ci_installations_repo_idx" ON "ci_installations" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "ci_installations_workspace_idx" ON "ci_installations" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_ws_run_attempt_uq" ON "ci_runs" USING btree ("workspace_id","workflow_run_id","run_attempt");--> statement-breakpoint
CREATE INDEX "ci_runs_ws_ran_at_idx" ON "ci_runs" USING btree ("workspace_id","ran_at");--> statement-breakpoint
CREATE INDEX "ci_runs_agent_idx" ON "ci_runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "ci_runs_installation_idx" ON "ci_runs" USING btree ("ci_installation_id");