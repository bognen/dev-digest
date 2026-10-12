import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider, StructuredOutputError } from '../src/index.js';

/**
 * OpenRouterProvider.completeStructured with a stubbed OpenAI client (no network).
 * Covers Onboarding Tour NFR-1 (exactly one LLM call, no retries) and NFR-5
 * (raw model output must not leak into logs via the error).
 */
const schema = z.object({ ok: z.boolean() });
const SCHEMA_NAME = 'tour';
const RAW = 'SECRET-REPO-CONTENT not json';

function chat(content: string) {
  return { choices: [{ message: { content } }], usage: { prompt_tokens: 3, completion_tokens: 4 } };
}

function makeProvider(impl: (...args: any[]) => unknown) {
  const provider = new OpenRouterProvider('key');
  const create = vi.fn(impl);
  (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };
  return { provider, create };
}

const baseReq = {
  model: 'm',
  schema,
  schemaName: SCHEMA_NAME,
  messages: [{ role: 'user' as const, content: 'hi' }],
};

describe('OpenRouterProvider.completeStructured', () => {
  it('NFR-1: maxRetries 0 + invalid content => one call, StructuredOutputError with raw in non-enumerable details', async () => {
    const { provider, create } = makeProvider(async () => chat(RAW));
    const err = await provider
      .completeStructured({ ...baseReq, maxRetries: 0 })
      .catch((e: unknown) => e);

    expect(create).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(StructuredOutputError);
    const e = err as StructuredOutputError;
    expect(e.message).toBe(`OpenRouter structured output failed schema validation for ${SCHEMA_NAME}`);
    expect(e.details.raw).toBe(RAW);
  });

  it('NFR-5: details/raw are not enumerable nor serialized', async () => {
    const { provider } = makeProvider(async () => chat(RAW));
    const e = (await provider
      .completeStructured({ ...baseReq, maxRetries: 0 })
      .catch((x: unknown) => x)) as StructuredOutputError;

    expect(Object.keys(e)).not.toContain('details');
    expect(JSON.stringify(e)).not.toContain('SECRET-REPO-CONTENT');
    expect(JSON.stringify(e)).not.toContain('details');
    expect(e.details.raw).toBe(RAW);
  });

  it('NFR-1: per-request options reflect transportRetries and timeoutMs only when set', async () => {
    const { provider, create } = makeProvider(async () => chat('{"ok":true}'));

    await provider.completeStructured({ ...baseReq, transportRetries: 0, timeoutMs: 1234 });
    expect(create.mock.calls[0]![1]).toEqual({ maxRetries: 0, timeout: 1234 });

    await provider.completeStructured({ ...baseReq, timeoutMs: 500 });
    expect(create.mock.calls[1]![1]).toEqual({ timeout: 500 });

    await provider.completeStructured({ ...baseReq });
    const opts = create.mock.calls[2]![1] as Record<string, unknown>;
    expect(opts).not.toHaveProperty('maxRetries');
    expect(opts).not.toHaveProperty('timeout');
  });

  it('maxRetries 2 + always invalid => 3 calls with repair prompts appended between attempts', async () => {
    const lengths: number[] = [];
    const { provider, create } = makeProvider(async (body: { messages: unknown[] }) => {
      lengths.push(body.messages.length);
      return chat(RAW);
    });
    await expect(provider.completeStructured({ ...baseReq, maxRetries: 2 })).rejects.toBeInstanceOf(
      StructuredOutputError,
    );
    expect(create).toHaveBeenCalledTimes(3);
    expect(lengths).toEqual([1, 3, 5]);
  });

  it('valid first response returns data, tokens and attempts 1', async () => {
    const { provider, create } = makeProvider(async () => chat('{"ok":true}'));
    const res = await provider.completeStructured({ ...baseReq });
    expect(create).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ data: { ok: true }, tokensIn: 3, tokensOut: 4, attempts: 1 });
  });

  it('missing choices => "returned no choices" error', async () => {
    const { provider } = makeProvider(async () => ({ error: { message: 'upstream down' } }));
    await expect(provider.completeStructured({ ...baseReq })).rejects.toThrow(
      `OpenRouter returned no choices for ${SCHEMA_NAME}: upstream down`,
    );
  });
});
