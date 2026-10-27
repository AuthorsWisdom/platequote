"use client";

import { useEffect, useRef, useState } from "react";

type PayPalSession = {
  start: (
    options: { presentationMode: "auto" },
    orderPromise: Promise<{ orderId: string }>,
  ) => Promise<void>;
};

type PayPalInstance = {
  findEligibleMethods?: (options: { currencyCode: string }) => Promise<{
    isEligible: (name: string) => boolean;
  }>;
  createPayPalOneTimePaymentSession: (options: {
    onApprove: (data: { orderId: string }) => Promise<void> | void;
    onCancel?: () => void;
    onError?: (error: unknown) => void;
  }) => PayPalSession;
};

declare global {
  interface Window {
    paypal?: {
      createInstance: (options: {
        clientId: string;
        components: string[];
        pageType?: string;
      }) => Promise<PayPalInstance>;
    };
  }
}

function loadSdk(): Promise<void> {
  if (window.paypal?.createInstance) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>("script[data-platequote-paypal]");
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("PayPal script failed")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
    script.async = true;
    script.dataset.platequotePaypal = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the PayPal sandbox script."));
    document.head.appendChild(script);
  });
}

export function PaypalCheckout({
  orderId,
  clientId,
  onPaid,
}: {
  orderId: string;
  clientId: string;
  onPaid: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let button: HTMLElement | null = null;

    const onClick = async (event: Event) => {
      event.preventDefault();
      setBusy(true);
      setMessage(null);
      try {
        await loadSdk();
        if (!window.paypal || cancelled) return;
        const sdk = await window.paypal.createInstance({
          clientId,
          components: ["paypal-payments"],
          pageType: "checkout",
        });
        const session = sdk.createPayPalOneTimePaymentSession({
          async onApprove(data) {
            const response = await fetch(
              `/api/paypal/orders/${encodeURIComponent(data.orderId)}/capture`,
              { method: "POST" },
            );
            const payload = (await response.json()) as { message?: string };
            if (!response.ok) {
              throw new Error(payload.message || "PayPal capture failed.");
            }
            onPaidRef.current();
          },
          onCancel() {
            setMessage("Checkout was cancelled. The quote is still here.");
          },
          onError(error) {
            const text = error instanceof Error ? error.message : "PayPal reported an error.";
            setMessage(text);
          },
        });
        await session.start({ presentationMode: "auto" }, createOrder(orderId));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Checkout could not start.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    loadSdk()
      .then(() => {
        if (cancelled) return;
        button = document.createElement("paypal-button");
        button.setAttribute("type", "pay");
        button.textContent = "Pay with PayPal";
        button.addEventListener("click", onClick);
        host.replaceChildren(button);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not load PayPal.");
        }
      });

    return () => {
      cancelled = true;
      button?.removeEventListener("click", onClick);
      host.replaceChildren();
    };
  }, [clientId, orderId]);

  return (
    <div className="space-y-3">
      <div ref={hostRef} className={busy ? "pointer-events-none opacity-60" : undefined} />
      <p className="text-xs text-muted-foreground">
        Sandbox only. The amount is the quoted total stored on the server. The browser cannot change it.
      </p>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}

async function createOrder(orderId: string): Promise<{ orderId: string }> {
  const response = await fetch("/api/paypal/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  });
  const payload = (await response.json()) as { paypalOrderId?: string; message?: string };
  if (!response.ok || !payload.paypalOrderId) {
    throw new Error(payload.message || "Could not start PayPal checkout.");
  }
  return { orderId: payload.paypalOrderId };
}
