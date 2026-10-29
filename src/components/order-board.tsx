"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration, formatGrams, formatUsd } from "@/lib/format";
import type { OrderDTO, OrderStatus } from "@/lib/types";

export function OrderBoard() {
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/orders");
    if (response.status === 401) {
      window.location.assign("/login?next=/dashboard");
      return;
    }
    const payload = (await response.json()) as OrderDTO[] | { message?: string };
    if (!response.ok || !Array.isArray(payload)) {
      throw new Error(!Array.isArray(payload) ? payload.message || "Could not load orders." : "Could not load orders.");
    }
    setOrders(payload);
  }

  useEffect(() => {
    let cancelled = false;
    load().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load orders.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function advance(order: OrderDTO) {
    const next = order.status === "paid" ? "printing" : order.status === "printing" ? "shipped" : null;
    if (!next) return;
    setBusyId(order.id);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Could not update the order.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the order.");
    } finally {
      setBusyId(null);
    }
  }

  if (!orders && !error) return <p className="text-sm text-muted-foreground">Loading orders…</p>;
  if (error && !orders) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="font-heading text-2xl">Orders are unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Orders</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          A priced quote shows up as quoted. PayPal capture moves it to paid. Printing and shipped are local
          marks for this demo. Shipment tracking is not sent to PayPal yet.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {orders && orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-sm text-muted-foreground">
          No orders yet. A quote becomes an order as soon as the slicer returns a price.{" "}
          <Link href="/" className="underline">
            Price a sample part
          </Link>
          .
        </div>
      ) : null}
      <div className="space-y-3 md:hidden">
        {orders?.map((order) => (
          <article key={order.id} className="rounded-xl border border-border bg-card p-4 text-sm">
            <OrderBody order={order} busy={busyId === order.id} onAdvance={() => advance(order)} />
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Slice</th>
              <th className="px-3 py-2 font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Next</th>
            </tr>
          </thead>
          <tbody>
            {orders?.map((order) => (
              <tr key={order.id} className="border-b border-border last:border-0">
                <td className="px-3 py-3">
                  <Link href={`/q/${order.quote.id}`} className="font-medium underline-offset-2 hover:underline">
                    {order.quote.originalFilename}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {order.quote.materialName} · {order.quote.color} · qty {order.quote.quantity}
                  </p>
                  {order.payerEmail ? (
                    <p className="text-xs text-muted-foreground">PayPal buyer {order.payerEmail}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {order.quote.filamentGrams != null ? formatGrams(order.quote.filamentGrams) : "—"}
                  {" · "}
                  {order.quote.printTimeSeconds != null ? formatDuration(order.quote.printTimeSeconds) : "—"}
                </td>
                <td className="px-3 py-3">{formatUsd(order.amountCents)}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={order.status} />
                  {order.paypalEnv === "sandbox" && order.status !== "quoted" ? (
                    <p className="mt-1 text-xs text-muted-foreground">Sandbox payment, no real money</p>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <Advance order={order} busy={busyId === order.id} onAdvance={() => advance(order)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrderBody({
  order,
  busy,
  onAdvance,
}: {
  order: OrderDTO;
  busy: boolean;
  onAdvance: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/q/${order.quote.id}`} className="font-medium underline-offset-2 hover:underline">
          {order.quote.originalFilename}
        </Link>
        <StatusBadge status={order.status} />
      </div>
      <p className="text-muted-foreground">
        {order.quote.materialName} · qty {order.quote.quantity} · {formatUsd(order.amountCents)}
      </p>
      {order.payerEmail ? <p className="text-muted-foreground">PayPal buyer {order.payerEmail}</p> : null}
      <Advance order={order} busy={busy} onAdvance={onAdvance} />
    </div>
  );
}

function Advance({
  order,
  busy,
  onAdvance,
}: {
  order: OrderDTO;
  busy: boolean;
  onAdvance: () => void;
}) {
  if (order.status === "paid") {
    return (
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onAdvance}>
        Mark printing
      </Button>
    );
  }
  if (order.status === "printing") {
    return (
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onAdvance}>
        Mark shipped
      </Button>
    );
  }
  if (order.status === "quoted") return <span className="text-xs text-muted-foreground">Waiting for payment</span>;
  return <span className="text-xs text-muted-foreground">Done in PlateQuote</span>;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  if (status === "paid") return <Badge>Paid</Badge>;
  if (status === "printing") return <Badge variant="secondary">Printing</Badge>;
  if (status === "shipped") return <Badge variant="outline">Shipped</Badge>;
  return <Badge variant="outline">Quoted</Badge>;
}
