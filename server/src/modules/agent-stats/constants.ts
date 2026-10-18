/**
 * Minimum decided findings (accepted + dismissed) before an agent's accept-rate
 * is considered a reliable signal. Below it the rate is still reported, but
 * flagged `low_sample` and never ranked against agents that meet it.
 */
export const MIN_DECISIONS = 10;

/** Every stored run cost is a DevDigest estimate; no billing data is ingested. */
export const COST_BASIS = 'estimate' as const;
