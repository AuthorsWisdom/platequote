export function jsonError(status: number, error: string, message: string) {
  return Response.json({ error, message }, { status });
}
