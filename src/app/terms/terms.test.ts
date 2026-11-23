import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TermsPage from "@/app/terms/page";
import { UNPAID_UPLOAD_TTL_HOURS } from "@/lib/upload-store";

function termsText(): string {
  return renderToStaticMarkup(createElement(TermsPage))
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&rsquo;|&#8217;|\u2019/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|[\u201c\u201d]/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("terms page", () => {
  const text = termsText();

  it("describes database storage of uploads as the upload store implements it", () => {
    expect(UNPAID_UPLOAD_TTL_HOURS).toBe(48);
    expect(text).toContain(
      "We store uploaded files in our database and keep a temporary copy on the web server. We use the files to slice and fulfill orders and to derive measurements for printability review. Unpaid database copies are eligible for deletion after 48 hours and are cleaned up when new files are uploaded. This cleanup excludes files for paid orders.",
    );
    expect(text).not.toMatch(/cleared whenever the service restarts/);
  });

  it("drops the price-filter promise for the reviewed wording", () => {
    expect(text).not.toMatch(/filter dollar amounts/i);
    expect(text).toContain(
      "AI-written notes can be wrong. Use the amount shown at checkout. PlateQuote calculates that amount from the slicing estimate and the shop's rates for your selected options.",
    );
  });

  it("names every field the review payload sends", () => {
    for (const phrase of [
      "overhang angle threshold",
      "thin-wall flag",
      "whether it would fit if rotated",
      "bed size",
      "names of the materials the shop stocks",
      "filament volume",
      "profile name",
      "slicer name",
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it("states Anthropic retention as its policy does", () => {
    expect(text).not.toMatch(/deletes that data within 30 days/);
    expect(text).toMatch(/standard retention period is 30 days/);
    expect(text).toMatch(/usage polic/i);
  });

  it("says checkout on platequote.tech is PayPal sandbox only, with no live orders claim", () => {
    expect(text).toContain(
      "On platequote.tech, checkout runs in PayPal's sandbox: no real money moves, and nothing paid here is printed or shipped.",
    );
    expect(text).not.toMatch(/live orders?/i);
    expect(text).not.toMatch(/for software judging/i);
  });

  it("has no em or en dashes", () => {
    expect(text).not.toMatch(/[–—]/);
  });
});
