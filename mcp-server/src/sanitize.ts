/**
 * PURE text sanitation for API-sourced strings (inner ring: no I/O, no imports).
 * Strips characters that can hide or reorder text from a human/LLM reader:
 * C0/C1 controls (keeping \t \n \r in stripUnsafe), zero-width, bidi
 * overrides/isolates, line/paragraph separators, BOM and Unicode tag characters.
 */

const UNSAFE_CHARS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff\u{e0000}-\u{e007f}]/gu;

/** Remove hidden/control characters but keep ordinary whitespace (\t \n \r) and layout. */
export function stripUnsafe(text: string): string {
  return text.replace(UNSAFE_CHARS, "");
}

/** stripUnsafe + collapse whitespace to single spaces, so text cannot reshape a message. */
export function sanitizeText(text: string): string {
  return stripUnsafe(text).replace(/\s+/g, " ").trim();
}

/** Origin only (scheme://host[:port]); never userinfo, path, query or fragment. */
export function safeOrigin(url: string): string {
  try {
    const origin = new URL(url).origin;
    return origin === "null" ? "<invalid url>" : origin;
  } catch {
    return "<invalid url>";
  }
}
