import { prisma } from "@/lib/db";
import type { OrderDTO, OrderStatus } from "@/lib/types";

const STATUSES = new Set<OrderStatus>(["quoted", "paid", "printing", "shipped"]);

export async function listOrders(): Promise<OrderDTO[]> {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { quote: { include: { material: true } } },
  });
  return orders.map((order) => ({
    id: order.id,
    status: STATUSES.has(order.status as OrderStatus) ? (order.status as OrderStatus) : "quoted",
    amountCents: order.amountCents,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    payerEmail: order.payerEmail,
    quote: {
      id: order.quote.id,
      originalFilename: order.quote.originalFilename,
      quantity: order.quote.quantity,
      color: order.quote.color,
      materialName: order.quote.material.name,
      printTimeSeconds: order.quote.printTimeSeconds,
      filamentGrams: order.quote.filamentGrams,
    },
  }));
}

export async function advanceOrder(id: string, status: "printing" | "shipped") {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return { ok: false as const, status: 404, message: "Order not found." };
  const allowed =
    (order.status === "paid" && status === "printing") ||
    (order.status === "printing" && status === "shipped");
  if (!allowed) {
    return {
      ok: false as const,
      status: 409,
      message: "That status change is not available. Payment is the only way into the paid state.",
    };
  }
  await prisma.order.update({
    where: { id },
    data: {
      status,
      printingAt: status === "printing" ? new Date() : order.printingAt,
      shippedAt: status === "shipped" ? new Date() : order.shippedAt,
    },
  });
  return { ok: true as const };
}
