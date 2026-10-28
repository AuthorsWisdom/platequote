import { isRenderHost } from "@/lib/deploy-env";

/**
 * Unsigned webhook posts are a local `next dev` fixture switch only.
 * Production (`next start`, Docker, Render) ignores the flag.
 */
export function unverifiedWebhooksPermitted(): boolean {
  if (process.env.PAYPAL_ALLOW_UNVERIFIED_WEBHOOKS !== "true") return false;
  if (process.env.NODE_ENV === "production") return false;
  if (isRenderHost()) return false;
  return true;
}
