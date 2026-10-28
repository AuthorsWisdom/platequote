import type { OrderStatus } from "@/lib/types";

export type PublicOrder = {
  id: string;
  status: OrderStatus;
  amountCents: number;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  paidAt: string | null;
};

/** Quote pages are public. The PayPal buyer email stays on the admin order list. */
export function toPublicOrder(order: {
  id: string;
  status: OrderStatus;
  amountCents: number;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  payerEmail: string | null;
  paidAt: string | null;
}): PublicOrder {
  return {
    id: order.id,
    status: order.status,
    amountCents: order.amountCents,
    paypalOrderId: order.paypalOrderId,
    paypalCaptureId: order.paypalCaptureId,
    paidAt: order.paidAt,
  };
}
