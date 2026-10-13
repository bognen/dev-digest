/**
 * Direct OpenAI-compatible runtime for the CONTENT tier (skillTask). Talks to OpenRouter (or any
 * OpenAI-compatible gateway) with a plain chat.completions call — DeepSeek and other non-Anthropic
 * models work natively here, no Anthropic Skin and no translating proxy.
 *
 * This mirrors reviewer-core/src/llm/openrouter.ts (same OpenAI-SDK-against-OpenRouter pattern) but
 * returns free text instead of structured JSON, which is what the skill-quality judge scores.
 *
 * It has NO tools, subagents, or skills — so it only fits content-only cases. agentTask and
 * workflowTask stay on the Claude Agent SDK (run-claude.ts), which is the only runtime that
 * produces the subagent/skill/file-read trace those tiers assert on.
 */

import OpenAI from "openai";
import { EVAL_MODEL } from "../config.js";
import type { Result, RunOptions } from "./run-claude.js";

const BASE_URL = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");

/** Run one content-only turn against an OpenAI-compatible endpoint and shape it as a Result. */
export async function runOpenRouter(prompt: string, opts: RunOptions = {}): Promise<Result> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("EVAL_BACKEND=openrouter but OPENROUTER_API_KEY is not set");

  // Match run-claude's no-tools contract so the injected artifact behaves the same in both runtimes.
  const directive =
    "\n\nYou have NO tools available in this session. Do not attempt any tool calls. " +
    "Answer directly and completely from the information given in the prompt.";
  const system = (opts.systemPrompt ?? "") + directive;

  // Streamed, not one blocking request: reasoning models (DeepSeek V4 Flash) can think for 3-4+
  // minutes before writing a long report, so any fixed whole-request timeout either cuts off
  // correct answers or is uselessly large. With streaming the client timeout only covers the
  // time to first response; the overall cap is vitest's testTimeout.
  const client = new OpenAI({ apiKey: key, baseURL: BASE_URL, timeout: 120_000, maxRetries: 1 });

  const started = Date.now();
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let isError = false;
  try {
    const stream = await client.chat.completions.create({
      model: opts.model ?? EVAL_MODEL,
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });
    let sawChoice = false;
    for await (const chunk of stream) {
      // OpenRouter can send an in-band error chunk (upstream error / moderation) — surface it.
      const errMsg = (chunk as unknown as { error?: { message?: string } }).error?.message;
      if (errMsg) throw new Error(`OpenRouter stream error: ${errMsg}`);
      const choice = chunk.choices?.[0];
      if (choice) {
        sawChoice = true;
        text += choice.delta?.content ?? "";
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
      }
    }
    if (!sawChoice) throw new Error("OpenRouter returned no choices");
  } catch (err) {
    isError = true;
    text = err instanceof Error ? err.message : String(err);
  }

  return {
    text,
    toolsUsed: [],
    subagents: [],
    skillsInvoked: [],
    filesRead: [],
    numTurns: 1,
    isError,
    metrics: { durationMs: Date.now() - started, inputTokens, outputTokens, toolCallCount: 0 },
  };
}
