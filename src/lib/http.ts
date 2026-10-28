export function jsonError(status: number, error: string, message: string, extraHeaders?: HeadersInit) {
  return Response.json(
    { error, message },
    { status, headers: { "Cache-Control": "no-store", ...headersToObject(extraHeaders) } },
  );
}

function headersToObject(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}

/** A message we wrote for the client. Unexpected errors must not use this path. */
export class UserFacingError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
    this.code = code;
  }
}

export function errorResponse(error: unknown, fallbackStatus: number, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof UserFacingError) return jsonError(error.status, error.code, error.message);
  console.error(error);
  return jsonError(fallbackStatus, fallbackCode, fallbackMessage);
}

export function declaredBodyTooLarge(request: Request, maxBytes: number): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const declared = Number(raw);
  return Number.isFinite(declared) && declared > maxBytes;
}
