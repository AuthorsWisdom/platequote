/** True on a Render service. Local docker compose does not set these. */
export function isRenderHost(): boolean {
  return process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID?.trim());
}
