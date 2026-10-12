-- Custom SQL migration file, put your code below! ---- The state key (head sha) now lives inside the brief JSON; copy it before the column is dropped.
UPDATE "pr_brief" SET "json" = jsonb_set("json", '{head_sha}', to_jsonb("head_sha"));
