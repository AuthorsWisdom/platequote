import { paypalPublicConfig } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(paypalPublicConfig());
}
