ALTER TABLE "onboarding" ADD COLUMN "status" text DEFAULT 'skeleton' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "skeleton_reason" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "skeleton_detail" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "indexed_sha" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "index_status" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "files_indexed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "files_considered" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "last_failure_reason" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "last_failure_at" timestamp with time zone;