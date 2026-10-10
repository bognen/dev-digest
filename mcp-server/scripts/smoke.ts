import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Real-stdio smoke test. Spawns src/index.ts the same way .mcp.json does.
 *
 *   pnpm smoke                          tools/list + list_agents
 *   pnpm smoke <owner/name>             ... + get_conventions
 *   pnpm smoke --run <repo> <pr> <agent>  ... + run_agent_on_pr (SPENDS LLM CREDITS, explicit opt-in)
 *
 * Output goes to stderr; exits non-zero if any call returns isError or throws.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const log = (msg: string): void => {
  process.stderr.write(msg + "\n");
};

interface CallResult {
  isError?: boolean;
  content?: { type: string; text?: string }[];
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const runIdx = args.indexOf("--run");
  let runArgs: { repo: string; pr: number; agent: string } | undefined;
  if (runIdx >= 0) {
    const [repo, pr, agent] = args.slice(runIdx + 1);
    if (!repo || !pr || !agent || !Number.isInteger(Number(pr))) {
      log("usage: pnpm smoke --run <owner/name> <pr-number> <agent>");
      return 2;
    }
    runArgs = { repo, pr: Number(pr), agent };
    args.splice(runIdx, 4);
  }
  const repoArg = args.find((a) => !a.startsWith("--"));

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "node_modules", "tsx", "dist", "cli.mjs"), join(root, "src", "index.ts")],
    cwd: root,
    stderr: "inherit",
  });
  const client = new Client({ name: "devdigest-smoke", version: "0.0.0" });
  let failed = false;

  const call = async (name: string, a: Record<string, unknown>, opts?: object): Promise<void> => {
    const res = (await client.callTool({ name, arguments: a }, opts)) as CallResult;
    const text = res.content?.map((c) => c.text ?? "").join("") ?? "";
    log(`[${res.isError ? "ERROR" : "ok"}] ${name}: ${text.length} chars`);
    log(text.length > 600 ? text.slice(0, 600) + "..." : text);
    if (res.isError) failed = true;
  };

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const size = JSON.stringify(tools).length;
    log(`tools/list: ${tools.length} tools [${tools.map((t) => t.name).join(", ")}], ${size} chars`);
    if (tools.length !== 5) failed = true;

    await call("list_agents", {});
    if (repoArg) await call("get_conventions", { repo: repoArg });
    if (runArgs) await call("run_agent_on_pr", runArgs);
  } catch (err) {
    log(`smoke failed: ${err instanceof Error ? err.message : String(err)}`);
    failed = true;
  } finally {
    await client.close().catch(() => undefined);
  }
  return failed ? 1 : 0;
}

main().then((code) => process.exit(code));
