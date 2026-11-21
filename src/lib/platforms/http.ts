export class PlatformError extends Error {
  constructor(
    message: string,
    public opts: { code?: string; status?: number; retryable?: boolean; auth?: boolean; body?: unknown } = {},
  ) { super(message); }
  get retryable() { return this.opts.retryable ?? false; }
  get auth() { return this.opts.auth ?? false; }
}

function extractMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return typeof body === "string" ? body.slice(0, 300) : undefined;
  const b = body as Record<string, any>;
  return b.error?.message ?? b.error_description ?? b.message ?? b.detail ?? b.description ?? b.errors?.[0]?.message ?? b.title
    ?? (typeof b.error === "string" ? b.error : undefined);
}

/** fetch wrapper that classifies failures so the queue knows whether to retry or flag a reconnect. */
export async function api<T = any>(url: string, init: RequestInit & { json?: unknown; form?: Record<string, string>; timeoutMs?: number } = {}, label = "API"): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) { headers.set("Content-Type", "application/json"); body = JSON.stringify(init.json); }
  if (init.form) { headers.set("Content-Type", "application/x-www-form-urlencoded"); body = new URLSearchParams(init.form).toString(); }
  if (!headers.has("User-Agent")) headers.set("User-Agent", "Orbit/0.1");
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, body, signal: AbortSignal.timeout(init.timeoutMs ?? 30_000) });
  } catch (e) {
    throw new PlatformError(`${label}: network error (${(e as Error).message})`, { retryable: true, code: "network" });
  }
  const text = await res.text();
  let parsed: any = text;
  try { parsed = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
  if (!res.ok || (parsed && typeof parsed === "object" && parsed.ok === false)) {
    const msg = extractMessage(parsed) ?? res.statusText;
    const status = res.status;
    const auth = status === 401 || parsed?.error?.code === 190 || /token|expired|revoked|unauthori[sz]ed/i.test(String(parsed?.error?.type ?? "")) && status === 400 && parsed?.error?.code === 190;
    const retryable = status === 429 || status >= 500 || parsed?.error?.is_transient === true;
    throw new PlatformError(`${label}: ${msg} (HTTP ${status})`, { status, retryable, auth: auth || status === 401, code: String(parsed?.error?.code ?? parsed?.error_code ?? status), body: parsed });
  }
  return parsed as T;
}
