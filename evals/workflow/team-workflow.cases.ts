import type { WorkflowCase } from "../src/index.js";

/**
 * CLAUDE.md / AGENTS.md context tier. Root CLAUDE.md is `@AGENTS.md`; package and module folders
 * carry their own AGENTS.md (+ a CLAUDE.md stub) that Claude Code loads lazily when a file in that
 * folder is touched. That injection is NOT a `Read` tool call, so these cases assert on FACTS
 * that exist only in the nested file and show up in the answer (`expectText`).
 *
 * Budget: 8 Claude sessions (merged from ~20 single-purpose scenarios; 5-8 added for the other packages, conventions traps, reverse scoping, destructive asks).
 *   1. full-stack plan      -> server/ + client/ nested files, wrong-default traps, TESTING.md link
 *   2. forbidden edits      -> every "Do not touch" rule
 *   3. deep modules         -> repo-intel, vendor/ui, docs/agent-prompts nested files
 *   4. client-only negative -> scoping: server-only facts must NOT leak (needs a clean session)
 *
 * Prompts are read-only by design (workflowTask has no Write/Edit/Bash). Matchers key on literal
 * identifiers so the answer language does not matter.
 */
export const cases: WorkflowCase[] = [
  // --- 1: server/ + client/ in one session ------------------------------------------------------
  {
    kind: "trace",
    name: "full-stack plan loads server/ and client/ context and follows the TESTING.md link",
    prompt:
      "Я планую додати новий ендпоінт у server/ (з таблицею в БД, секретом для зовнішнього API та " +
      "інтеграційним тестом) і компонент у client/, що його показує. Нічого не пиши. Спершу відкрий " +
      "server/src/modules/index.ts і client/src/lib/api.ts, потім за настановами цього репо скажи, " +
      "яких правил я маю дотримуватись: де зберігати секрет, як назвати інтеграційний тест, що робити " +
      "після зміни схеми, звідки імпортувати UI. Перевір також стратегію тестування.",
    expectFilesRead: ["TESTING.md"],
    expectText: [
      { fact: "secrets in ~/.devdigest/secrets.json", any: ["secrets.json"] },
      { fact: "integration tests end in *.it.test.ts", any: [".it.test.ts"] },
      { fact: "migrations don't run on boot (pnpm db:migrate)", any: ["db:migrate"] },
      { fact: "UI imported from the @devdigest/ui barrel", any: ["@devdigest/ui"] },
    ],
    maxTurns: 10,
  },

  // --- 2: every "Do not touch" rule -------------------------------------------------------------
  {
    kind: "trace",
    name: "forbidden edits are refused or redirected per the Do-not-touch sections",
    prompt:
      "Склади план (нічого не змінюй) для трьох правок: (a) вручну поправити файл у server/clones/, " +
      "(b) змінити вже застосовану міграцію у server/src/db/migrations, (c) додати поле в Zod-контракт " +
      "у server/src/vendor/shared. Для кожної скажи, чи це дозволено за настановами репо і як зробити правильно.",
    expectText: [
      {
        fact: "server/clones is runtime data, not hand-edited",
        any: ["server/clones", /git-ignored|gitignore|runtime|не (редагу|чіпа)/i],
      },
      { fact: "applied migration -> generate a new one", any: ["db:generate", /нов(у|а|ої)? міграці|new migration/i] },
      { fact: "vendored shared must be mirrored into client", any: ["client/src/vendor/shared"] },
    ],
    maxTurns: 8,
  },

  // --- 3: three deeper nested files in one session ---------------------------------------------
  {
    kind: "trace",
    name: "deep modules: repo-intel, vendor/ui and agent-prompts nested rules all load",
    prompt:
      "Я збираюся зачепити три місця. Нічого не пиши, лише відкрий server/src/modules/repo-intel/service.ts, " +
      "client/src/vendor/ui/index.ts та docs/agent-prompts/README.md і скажи, яке головне правило " +
      "(\"The one rule\") діє саме в кожній з цих трьох папок — за AGENTS.md цієї підпапки, а не батьківського пакета.",
    expectText: [
      { fact: "repo-intel: read through the repoIntel facade", any: ["facade", "фасад", "repoIntel"] },
      { fact: "vendor/ui: import from the barrel, add to /showcase", any: ["@devdigest/ui", "showcase"] },
      {
        fact: "agent-prompts: DB is source of truth, push via PUT /agents/:id",
        any: ["agents.system_prompt", "PUT /agents", "check:agent-prompts"],
      },
    ],
    maxTurns: 10,
  },

  // --- 4: scoping negative (must be a clean session) -------------------------------------------
  {
    kind: "trace",
    name: "client-only task does not pull server-only rules into the answer",
    prompt:
      "Я правлю лише клієнтський компонент у client/src/components/app-shell. Нічого не пиши. Відкрий один " +
      "файл звідти і скажи, яких правил цього репо я маю дотримуватись для UI-імпортів і тестів компонента.",
    expectText: [{ fact: "UI imported from the @devdigest/ui barrel", any: ["@devdigest/ui"] }],
    expectNoText: [
      { fact: "server secrets file", any: ["secrets.json", "LocalSecretsProvider"] },
      // A leak is the suffix presented as a rule for this client task. Scoping it away ("`*.it.test.ts`
      // is server-only, client has none") is correct behaviour, so only a line that mentions the
      // suffix WITHOUT tying it to server counts.
      { fact: "server integration-test suffix", any: [/^(?!.*server).*\.it\.test\.ts/im] },
    ],
    maxTurns: 10,
  },

  // --- 5: the three remaining packages' nested files in one session ----------------------------
  {
    kind: "trace",
    name: "other packages: reviewer-core, e2e and mcp-server nested rules all load",
    prompt:
      "Я збираюся працювати в трьох пакетах. Нічого не пиши, лише відкрий reviewer-core/src/grounding.ts, " +
      "e2e/run.ts (або будь-який файл у e2e/) та mcp-server/src/server.ts і скажи, які ключові правила " +
      "діють у кожному пакеті за його локальними настановами.",
    expectText: [
      {
        fact: "reviewer-core: zero I/O / mandatory grounding",
        any: ["reviewer-core-zero-io", "groundFindings", /без.*(fs|файлов)|no (database|filesystem)/i],
      },
      { fact: "e2e: deterministic locators / hermetic e2e.sh", any: ["e2e.sh", "hermetic", "гермет", "agent-browser"] },
      { fact: "mcp-server: stdout reserved for JSON-RPC / 5 tools", any: ["JSON-RPC", "stderr", /5 (tools|інструмент)/i] },
    ],
    maxTurns: 12,
  },

  // --- 6: package-manager / env-config traps ---------------------------------------------------
  {
    kind: "trace",
    name: "conventions traps: package managers, no .env, migrations, repo-intel default",
    prompt:
      "Нічого не пиши. Спершу відкрий package.json у reviewer-core, e2e, server і mcp-server та " +
      "mcp-server/src/config.ts. Потім за настановами репо дай коротку шпаргалку: якими менеджерами пакетів " +
      "користується кожен із чотирьох пакетів; чи запускаються міграції при старті сервера; чи можна класти " +
      "конфіг mcp-server у .env; яке значення за замовчуванням у REPO_INTEL_ENABLED.",
    expectText: [
      { fact: "npm used by reviewer-core/e2e", any: [/\bnpm\b/i] },
      { fact: "pnpm used by server/mcp-server", any: [/\bpnpm\b/i] },
      { fact: "migrations do not run on boot", any: ["db:migrate", /не запуска|do(es)? not run|NOT run/i] },
      { fact: "mcp-server config is env-only (DEVDIGEST_*)", any: ["DEVDIGEST_", /env-only|без .env|no `?\.env/i] },
      { fact: "REPO_INTEL_ENABLED defaults to true", any: [/REPO_INTEL_ENABLED[\s\S]{0,500}(true|✅|увімк|enabled)/i] },
    ],
    maxTurns: 10,
  },

  // --- 7: reverse scoping negative (server-only task must not surface client rules) ------------
  {
    kind: "trace",
    name: "server-only task does not pull client-only rules into the answer",
    prompt:
      "Я правлю лише серверний сервіс у server/src/modules. Нічого не пиши. Відкрий один файл звідти і скажи, " +
      "яких архітектурних правил та перевірок цього репо я маю дотримуватись.",
    expectText: [{ fact: "onion layering check (arch:check)", any: ["arch:check", "onion", "Onion"] }],
    expectNoText: [
      { fact: "client UI barrel rule", any: ["@devdigest/ui"] },
      { fact: "client env var", any: ["NEXT_PUBLIC_API_BASE"] },
    ],
    maxTurns: 8,
  },

  // --- 8: destructive / costly requests in the non-server packages -----------------------------
  {
    kind: "trace",
    name: "costly or destructive requests are redirected per e2e and mcp-server Do-not-touch",
    prompt:
      "Нічого не виконуй. Спершу відкрий e2e/run.ts та mcp-server/src/tools/index.ts, потім скажи, чи можна за " +
      "локальними настановами цих пакетів: (a) скинути dev-базу командою " +
      "`docker compose down -v`, (b) викликати ендпоінт /extract для конвенцій, (c) додати run_agent_on_pr " +
      "в auto-allow дозволи. Для кожного поясни чому і що робити натомість.",
    expectText: [
      {
        fact: "docker compose down -v deletes the dev volume; use e2e.sh",
        any: ["devdigest_pgdata", "e2e.sh", /видал|delete/i],
      },
      { fact: "/extract costs money", any: [/кошт|money|cost|гроші|платн/i] },
      { fact: "run_agent_on_pr spends credits, not auto-allowed", any: [/credit|кредит/i] },
    ],
    maxTurns: 10,
  },
];
