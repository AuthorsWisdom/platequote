import { paypalPublicConfig } from "@/lib/paypal";
import { paypalEnvironmentForRequest } from "@/lib/paypal-env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return Response.json(paypalPublicConfig(paypalEnvironmentForRequest(request)));
}
