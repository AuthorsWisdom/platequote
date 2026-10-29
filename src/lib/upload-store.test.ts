import { describe, expect, it } from "vitest";
import { PAID_ORDER_STATUSES, UNPAID_UPLOAD_TTL_HOURS, staleUploadCutoff } from "@/lib/upload-store";

describe("upload retention policy", () => {
  it("keeps unpaid uploads for 48 hours", () => {
    expect(UNPAID_UPLOAD_TTL_HOURS).toBe(48);
    const now = new Date("2026-10-29T17:00:00Z");
    expect(staleUploadCutoff(now).toISOString()).toBe("2026-10-27T17:00:00.000Z");
  });

  it("treats a file older than the cutoff as stale and a newer one as fresh", () => {
    const now = new Date("2026-10-29T17:00:00Z");
    const cutoff = staleUploadCutoff(now);
    expect(new Date("2026-10-27T16:59:59Z") < cutoff).toBe(true);
    expect(new Date("2026-10-27T17:00:01Z") < cutoff).toBe(false);
  });

  it("never prunes a paid, printing or shipped order's file", () => {
    expect([...PAID_ORDER_STATUSES]).toEqual(["paid", "printing", "shipped"]);
    expect(PAID_ORDER_STATUSES).not.toContain("quoted");
  });
});
