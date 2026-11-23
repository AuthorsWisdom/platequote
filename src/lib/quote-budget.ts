/** Must match `maxDuration` in src/app/api/quotes/route.ts (Next reads that one as a literal). */
export const QUOTE_ROUTE_MAX_MS = 120_000;
/** Kept back at the end of the route for building and sending the response. */
export const QUOTE_RESPONSE_MARGIN_MS = 5_000;
/** Kept back after slicing (and after the AI review) for pricing and the database write. */
export const QUOTE_SAVE_RESERVE_MS = 5_000;
const SLICER_MAX_MS = 120_000;
const SLICER_MIN_MS = 1_000;

/** The instant createQuote must have finished by, for a request that started at `startedAt`. */
export function quoteDeadline(startedAt: number): number {
  return startedAt + QUOTE_ROUTE_MAX_MS - QUOTE_RESPONSE_MARGIN_MS;
}

/** The slicer gets what is left before the deadline, less the save reserve, capped at 120 s. */
export function slicerTimeoutMs(deadline: number, now: number = Date.now()): number {
  return Math.max(SLICER_MIN_MS, Math.min(SLICER_MAX_MS, Math.floor(deadline - now - QUOTE_SAVE_RESERVE_MS)));
}
