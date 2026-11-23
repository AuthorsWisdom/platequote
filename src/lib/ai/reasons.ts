/**
 * Fallback reasons the customer can see. Anything else, including a raw error message saved by an
 * older build, is shown as `llm_failed`.
 */
const FIXED = new Set([
  "missing_api_key",
  "provider_disabled",
  "slice_failed",
  "no_time_left",
  "model_bad_reply",
  "llm_failed",
]);
const PROVIDER_CODE = /^(?:anthropic|openai)_(?:timeout|refusal|truncated|empty|bad_body|unreachable|http_\d{3})$/;

export function toPublicReason(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && (FIXED.has(raw) || PROVIDER_CODE.test(raw))) return raw;
  return "llm_failed";
}
