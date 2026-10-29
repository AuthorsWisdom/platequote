"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const ModelPreview = dynamic(
  () => import("@/components/model-preview").then((mod) => mod.ModelPreview),
  { ssr: false, loading: () => <p className="p-6 text-sm text-muted-foreground">Loading preview…</p> },
);
import { PaypalCheckout } from "@/components/paypal-checkout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { colorHex } from "@/lib/constants";
import { formatDuration, formatGrams, formatPercent, formatUsd } from "@/lib/format";
import type { QuoteDTO } from "@/lib/types";

type PaypalConfig = {
  enabled: boolean;
  clientId: string | null;
  message: string | null;
};

export function QuoteResult({ id }: { id: string }) {
  const [quote, setQuote] = useState<QuoteDTO | null>(null);
  const [paypal, setPaypal] = useState<PaypalConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [repricing, setRepricing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [quoteResponse, paypalResponse] = await Promise.all([
      fetch(`/api/quotes/${id}`),
      fetch("/api/paypal/config"),
    ]);
    if (!quoteResponse.ok) {
      const payload = (await quoteResponse.json()) as { message?: string };
      throw new Error(payload.message || "That quote was not found.");
    }
    setQuote((await quoteResponse.json()) as QuoteDTO);
    if (paypalResponse.ok) setPaypal((await paypalResponse.json()) as PaypalConfig);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the quote.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function useMaterial(materialId: string, nextColor: string) {
    if (!quote) return;
    setRepricing(materialId);
    setError(null);
    try {
      const response = await fetch(`/api/quotes/${quote.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId,
          color: nextColor,
          quantity: quote.quantity,
          rush: quote.rush,
          purpose: quote.purpose,
        }),
      });
      const payload = (await response.json()) as QuoteDTO & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Could not reprice.");
      setQuote(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reprice.");
    } finally {
      setRepricing(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading the quote…</p>;
  if (error && !quote) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="font-heading text-2xl">No quote here</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          Start another quote
        </Link>
      </div>
    );
  }
  if (!quote) return null;

  const breakdown = quote.priceBreakdown;
  const paid = quote.order && quote.order.status !== "quoted";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{quote.shopName}</p>
          <h1 className="font-heading text-3xl tracking-tight">{quote.originalFilename}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {quote.material.name} · {quote.color} · qty {quote.quantity}
            {quote.rush ? " · rush" : ""}
          </p>
        </div>
        <Badge variant={quote.status === "failed" ? "destructive" : "secondary"}>{quote.status}</Badge>
      </div>

      {quote.status === "failed" ? (
        <div className="rounded-xl border border-destructive/40 bg-card p-4 text-sm">
          <p className="font-medium">No price, because the slice did not finish as a printable job.</p>
          <p className="mt-1 text-muted-foreground">{quote.errorMessage}</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="h-80 overflow-hidden rounded-2xl border border-border bg-card">
          <ModelPreview
            url={`/api/quotes/${quote.id}/model`}
            filename={quote.originalFilename}
            color={colorHex(quote.color)}
          />
        </div>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-heading text-2xl">Estimate</h2>
          {breakdown && quote.priceCents != null ? (
            <>
              <p className="mt-2 font-heading text-4xl">{formatUsd(quote.priceCents)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Profile {quote.profileName ?? "generic"}
                {quote.engine ? ` via ${quote.engine}` : ""}. Treat it as about ±
                {quote.estimateTolerancePct}% versus a shop-tuned profile. The shop can decline the job.
              </p>
              <dl className="mt-4 space-y-1.5 text-sm">
                <Row
                  label={`Filament ${formatGrams(breakdown.filamentGrams)} × $${breakdown.pricePerGram.toFixed(3)}/g × ${breakdown.quantity}`}
                  value={formatUsd(breakdown.materialCents)}
                />
                <Row
                  label={`Machine ${formatDuration(breakdown.printTimeSeconds)} × $${breakdown.pricePerMachineHour.toFixed(2)}/h × ${breakdown.quantity}`}
                  value={formatUsd(breakdown.machineCents)}
                />
                {breakdown.minimumApplied ? (
                  <Row label="Shop minimum replaces the sum above" value={formatUsd(breakdown.minimumOrderCents)} />
                ) : null}
                {breakdown.rushFeeCents > 0 ? <Row label="Rush fee" value={formatUsd(breakdown.rushFeeCents)} /> : null}
              </dl>
              {breakdown.gramsSource === "density_adjusted" ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Filament mass was scaled from the sliced volume using this material&apos;s density. Print time
                  is unchanged.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              There is no price on this quote. PlateQuote does not invent grams or time.
            </p>
          )}
        </section>
      </div>

      {quote.mesh ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Bounding box" value={`${quote.mesh.boundingBoxMm.x} × ${quote.mesh.boundingBoxMm.y} × ${quote.mesh.boundingBoxMm.z} mm`} />
          <Fact label="Print time" value={quote.printTimeSeconds != null ? formatDuration(quote.printTimeSeconds) : "—"} />
          <Fact label="Supports" value={quote.supports == null ? "—" : quote.supports ? "Yes" : "No"} />
          <Fact
            label="Mesh"
            value={`${quote.mesh.watertight ? "Watertight" : "Not watertight"} · overhang ${formatPercent(quote.mesh.overhangFaceShare)}`}
          />
        </section>
      ) : null}

      {quote.review ? <ReviewBlock quote={quote} repricing={repricing} onUse={useMaterial} /> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-heading text-2xl">Checkout</h2>
        {paid && quote.order ? (
          <div className="mt-3 text-sm">
            <p className="font-medium">Paid in the PayPal sandbox.</p>
            <p className="mt-1 text-muted-foreground">
              Order {quote.order.id}. Status: {quote.order.status}.
              {quote.order.paypalCaptureId ? ` Capture ${quote.order.paypalCaptureId}.` : ""}
            </p>
            <Link href="/dashboard" className="mt-3 inline-block underline">
              Open the shop orders
            </Link>
          </div>
        ) : quote.order && quote.status === "quoted" && paypal?.enabled && paypal.clientId ? (
          <div className="mt-3">
            <PaypalCheckout orderId={quote.order.id} clientId={paypal.clientId} onPaid={() => load()} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {quote.status !== "quoted"
              ? "Checkout stays closed until a slicer price exists."
              : paypal?.message || "PayPal checkout is not available."}
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Sandbox checkout only. Refunds and shipment tracking are not part of this build. PlateQuote does not
          start or control a printer.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function ReviewBlock({
  quote,
  repricing,
  onUse,
}: {
  quote: QuoteDTO;
  repricing: string | null;
  onUse: (materialId: string, color: string) => void;
}) {
  const review = quote.review?.review;
  const quotes = quote.review?.materialQuotes ?? [];
  if (!review) return null;
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-2xl">Print notes</h2>
          <Badge variant="outline">{review.mocked ? "Built-in review" : review.provider}</Badge>
        </div>
        <p className="mt-3 text-sm leading-6">{review.summary}</p>
        <p className="mt-3 text-sm text-muted-foreground">{review.orientationNote}</p>
        {review.mockReason ? (
          <p className="mt-2 text-xs text-muted-foreground">Fallback reason: {review.mockReason}</p>
        ) : null}
        <ul className="mt-4 space-y-3">
          {review.warnings.length === 0 ? (
            <li className="text-sm text-muted-foreground">No warnings from the mesh facts.</li>
          ) : (
            review.warnings.map((warning) => (
              <li key={warning.title} className="rounded-xl bg-muted px-3 py-2 text-sm">
                <p className="font-medium">
                  {warning.severity === "blocker" ? "Stop" : warning.severity === "warning" ? "Check" : "Note"}
                  {" · "}
                  {warning.title}
                </p>
                <p className="mt-1 text-muted-foreground">{warning.detail}</p>
                <p className="mt-1">{warning.fix}</p>
              </li>
            ))
          )}
        </ul>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-heading text-2xl">Material advice</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The words come from the reviewer. Every dollar figure comes from the pricing engine.
        </p>
        <ul className="mt-4 space-y-3">
          {quotes.map((item) => {
            const stocked = quote.material.name.toLowerCase() === item.material.toLowerCase();
            return (
              <li key={item.material} className="rounded-xl border border-border px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">
                    {item.material}{" "}
                    <span className="font-normal text-muted-foreground">· {item.fit}</span>
                  </p>
                  <p className="font-medium">
                    {item.priceCents == null ? "No engine price" : formatUsd(item.priceCents)}
                  </p>
                </div>
                <p className="mt-1 text-muted-foreground">{item.reason}</p>
                {item.unavailable ? (
                  <p className="mt-2 text-xs">This shop does not stock it.</p>
                ) : stocked ? (
                  <p className="mt-2 text-xs">This is the priced material.</p>
                ) : item.priceCents != null && item.materialId && item.defaultColor ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={repricing !== null || quote.order?.status !== "quoted"}
                    onClick={() => onUse(item.materialId!, item.defaultColor!)}
                  >
                    {repricing ? "Repricing…" : `Price it in ${item.material}`}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
