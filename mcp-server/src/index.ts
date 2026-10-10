import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { defaultSleep } from "./clock.js";
import { ConfigError, parseConfig } from "./config.js";
import { createHttpApiClient } from "./http.js";
import { createLogger } from "./log.js";
import { safeOrigin } from "./sanitize.js";
import { createServer } from "./server.js";

/**
 * Composition root: the only place that wires concrete adapters.
 * The process's standard output carries ONLY the JSON-RPC stream; everything
 * else (logs, fatal errors) goes to stderr.
 */

// Route stray console output to stderr so a stray call cannot corrupt the protocol stream.
for (const method of ["log", "info", "debug", "table", "dir", "dirxml", "group", "groupCollapsed"] as const) {
  console[method] = console.error.bind(console);
}

async function main(): Promise<void> {
  let config;
  try {
    config = parseConfig(process.env);
  } catch (err) {
    const msg = err instanceof ConfigError ? err.message : "invalid configuration";
    process.stderr.write(`devdigest-mcp: ${msg}\n`);
    process.exit(1);
  }

  const logger = createLogger(config.logLevel);
  if (config.apiIsRemote) {
    // Direct stderr write: must show even when DEVDIGEST_MCP_LOG_LEVEL=error. Origin only.
    process.stderr.write(
      `devdigest-mcp: WARNING: DEVDIGEST_API_URL is non-loopback (${safeOrigin(config.apiUrl)}, DEVDIGEST_ALLOW_REMOTE_API=1); PR/review data leaves this machine\n`,
    );
  }
  const api = createHttpApiClient({ baseUrl: config.apiUrl, defaultTimeoutMs: config.httpTimeoutMs, logger });
  const server = createServer({ api, config, logger, sleep: defaultSleep, now: Date.now });
  const transport = new StdioServerTransport();

  let closing = false;
  const shutdown = (reason: string): void => {
    if (closing) return;
    closing = true;
    logger.info("shutting down", { reason });
    // Never wait forever on close; the run on the API side is left untouched.
    const force = setTimeout(() => process.exit(0), 2_000);
    force.unref();
    server.close().then(
      () => process.exit(0),
      () => process.exit(0),
    );
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.stdin.on("end", () => shutdown("stdin closed"));

  await server.connect(transport);
  logger.info("devdigest-mcp ready", { apiUrl: safeOrigin(config.apiUrl) });
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`devdigest-mcp: fatal: ${msg}\n`);
  process.exit(1);
});
