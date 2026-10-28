import { isRenderHost } from "@/lib/deploy-env";

export function workerToken(): string {
  return (process.env.SLICER_WORKER_TOKEN || "").trim();
}

export function workerHeaders(): Record<string, string> {
  const token = workerToken();
  return token ? { "X-Worker-Token": token } : {};
}

/** Render must not call an open /slice. Local unset still matches an open dev worker. */
export function workerMisconfigured(): boolean {
  return isRenderHost() && !workerToken();
}
