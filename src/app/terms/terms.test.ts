import { afterEach, describe, expect, it, vi } from "vitest";

const DISTINCTIVE_FILENAME = "zz-secret-bracket-QX7731.stl";

const findUniqueMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  prisma: {
    order: { findUnique: findUniqueMock, update: vi.fn(async () => ({})) },
  },
}));
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

/** Runs the real createPaypalCheckout against a mocked database and fetch; returns the create-order body. */
async function createOrderBody(originalFilename: string): Promise<string> {
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  findUniqueMock.mockResolvedValue({
    id: "ORDER-LOCAL-1",
    status: "quoted",
    amountCents: 1234,
    paypalOrderId: null,
    paypalEnv: null,
    shop: { name: "Northline Print" },
    quote: { quantity: 2, originalFilename },
  });
  const sent: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 300 }), { status: 200 });
      }
      sent.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({ id: "PAYPAL-1" }), { status: 201 });
    }),
  );
  const { createPaypalCheckout } = await import("@/lib/paypal");
  const result = await createPaypalCheckout("ORDER-LOCAL-1", "sandbox");
  expect(result.ok).toBe(true);
  expect(sent).toHaveLength(1);
  return sent[0];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("terms page", () => {
  const text = termsText();

  it("describes database storage of uploads as the upload store implements it", () => {
    expect(UNPAID_UPLOAD_TTL_HOURS).toBe(48);
    expect(text).toContain(
      "We store uploaded files in our database and keep a temporary copy on the web server. We use the files to produce the quote and to derive measurements for printability review. Database copies are eligible for deletion after 48 hours and are cleaned up when new files are uploaded. Files attached to a test order that completed a sandbox checkout are kept and are not part of this cleanup.",
    );
    expect(text).not.toMatch(/cleared whenever the service restarts/);
    expect(text).toContain("The web server copy is not deleted on a schedule");
  });

  it("drops the price-filter promise for the reviewed wording", () => {
    expect(text).not.toMatch(/filter dollar amounts/i);
    expect(text).toContain(
      "AI-written notes can be wrong. The notes are informational, not engineering advice, and nothing the AI writes changes the estimate. PlateQuote calculates the estimate from the slicing result and the sample shop's rates for your selected options.",
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

  it("keeps the no-training sentence and states Anthropic retention without an unchecked number", () => {
    expect(text).toContain("By default, Anthropic does not use inputs or outputs from its API to train its models.");
    expect(text).not.toMatch(/deletes that data within 30 days/);
    expect(text).not.toMatch(/retention period is \d+ days/);
    expect(text).toMatch(/API data retention policy/);
    expect(text).toMatch(/usage polic/i);
  });

  it("says the site is a demonstration with PayPal sandbox checkout only", () => {
    expect(text).toContain("PlateQuote is a demonstration of quoting software for 3D print shops.");
    expect(text).toContain("Nothing on this site is for sale.");
    expect(text).toContain("Checkout runs in PayPal's sandbox, PayPal's test environment. No real money moves");
    expect(text).toContain("Nothing is printed or shipped.");
    expect(text).toContain("there are no real orders, charges, refunds, shipping, or sales tax.");
    expect(text).not.toMatch(/live orders?/i);
    expect(text).not.toMatch(/for software judging/i);
  });

  it("makes no live-sale, refund, shipping, or tax claims", () => {
    for (const banned of [
      /By paying for an order/i,
      /sells to customers/i,
      /purchase protection and dispute process apply/i,
      /full refund/i,
      /refund in full/i,
      /reprint at no charge/i,
      /within 10 business days/i,
      /final price/i,
      /payment is captured/i,
      /shipping within the United States is included/i,
      /\bwe ship\b/i,
      /\bships\b/i,
      /risk of loss/i,
      /fulfil+ (and support )?orders/i,
      /tax records/i,
      /tax law requires/i,
      /shipping carrier/i,
      /to ship the order/i,
      /sales records/i,
      /before printing/i,
      /the amount you paid/i,
      /when you paid/i,
      /18 or older to order/i,
      /nothing paid here/i,
    ]) {
      expect(text, String(banned)).not.toMatch(banned);
    }
  });

  it("discloses what PayPal receives, and the outgoing create-order body carries no file name", async () => {
    expect(text).toContain(
      "we send PayPal the sample shop name, the quantity, the estimated price, and an internal order number, not your file or its name.",
    );
    const body = await createOrderBody(DISTINCTIVE_FILENAME);
    expect(body).toContain("ORDER-LOCAL-1");
    expect(body).not.toContain(DISTINCTIVE_FILENAME);
    expect(body).not.toContain("QX7731");
  });

  it("states retention and payer email only as the code behaves", () => {
    expect(text).not.toMatch(/until the demonstration is taken down/i);
    expect(text).toContain("The site does not delete these records, or files kept for test orders, on its own.");
    expect(text).toContain("When a sandbox checkout completes and PayPal provides one, we store the email address");
    expect(text).toContain("may still carry a PayPal description that includes the file name");
    for (const field of ["rush choice", "print purpose", "mesh measurements", "slicer results", "AI review notes", "PayPal sandbox order and capture IDs"]) {
      expect(text).toContain(field);
    }
  });

  it("defines a test order as the code creates it", () => {
    expect(text).toContain("it means the record the demo creates for each priced quote; a completed sandbox checkout marks it paid.");
  });

  it("does not present charges or refunds in the page metadata", async () => {
    const { metadata } = await import("@/app/terms/page");
    expect(typeof metadata.description).toBe("string");
    expect(typeof metadata.title).toBe("string");
    expect(metadata.description).toMatch(/demonstration/i);
    expect(metadata.title).toMatch(/terms/i);
    expect(String(metadata.description)).not.toMatch(/charges|refunds/i);
    expect(String(metadata.title)).not.toMatch(/refunds/i);
  });

  it("has no em or en dashes", () => {
    expect(text).not.toMatch(/[–—]/);
  });
});
