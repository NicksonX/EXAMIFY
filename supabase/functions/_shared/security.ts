import {
  createClient,
  type SupabaseClient,
  type User,
} from "https://esm.sh/@supabase/supabase-js@2";

const textEncoder = new TextEncoder();

export const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

export function appUrl(): string {
  const value = requiredEnv("APP_URL");
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    throw new Error("APP_URL must use HTTPS outside local development.");
  }
  return url.origin;
}

function allowedOrigins(): Set<string> {
  const configured = requiredEnv("APP_ALLOWED_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);
  return new Set(configured);
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin) return { ...jsonHeaders };
  if (!allowedOrigins().has(origin))
    throw new HttpError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "This origin is not allowed.",
    );
  return {
    ...jsonHeaders,
    "access-control-allow-origin": origin,
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-expose-headers": "x-request-id",
    vary: "Origin",
  };
}

export function optionsResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

function headersWithRequestId(headers: HeadersInit, requestId?: string): Headers {
  const responseHeaders = new Headers(headers);
  if (requestId) responseHeaders.set("x-request-id", requestId);
  return responseHeaders;
}

export function errorResponse(
  error: unknown,
  headers: HeadersInit = jsonHeaders,
  requestId?: string,
): Response {
  const correlationId = error instanceof HttpError ? error.requestId ?? requestId : requestId;
  if (error instanceof HttpError) {
    return Response.json(
      {
        error: error.code,
        message: error.message,
        ...(correlationId ? { requestId: correlationId } : {}),
      },
      { status: error.status, headers: headersWithRequestId(headers, correlationId) },
    );
  }
  console.error("Unhandled Edge Function error", {
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    ...(correlationId ? { requestId: correlationId } : {}),
  });
  return Response.json(
    {
      error: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      ...(correlationId ? { requestId: correlationId } : {}),
    },
    { status: 500, headers: headersWithRequestId(headers, correlationId) },
  );
}

export function serviceClient(): SupabaseClient {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

/**
 * Checkout eligibility is resolved by Postgres from auth.users.created_at.
 * Never derive this decision from profile plan fields or browser time.
 */
export async function ensureTrialCheckoutAvailable(
  admin: SupabaseClient,
  userId: string,
  requestId?: string,
): Promise<void> {
  const { data, error } = await admin.rpc("get_trial_checkout_eligibility", {
    p_user_id: userId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Trial checkout eligibility response was invalid.");
  }
  const eligibility = data as Record<string, unknown>;
  if (eligibility.checkout_locked !== true && eligibility.checkout_locked !== false) {
    throw new Error("Trial checkout eligibility response was invalid.");
  }
  if (eligibility.checkout_locked) {
    throw new HttpError(
      403,
      "TRIAL_CHECKOUT_LOCKED",
      "Paid plans become available after your 15-day learning trial ends.",
      requestId,
    );
  }
}

// Use this only after requireUser(). It preserves the caller's JWT so an
// ownership-enforcing RPC using auth.uid() never runs as the service role.
export function authenticatedClient(request: Request): SupabaseClient {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_ANON_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { authorization } },
    },
  );
}

export async function requireUser(request: Request): Promise<User> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token)
    throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");

  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data.user)
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Your session has expired. Sign in again.",
    );
  return data.user;
}

export async function parseJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(
      415,
      "INVALID_CONTENT_TYPE",
      "Expected an application/json request.",
    );
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("not an object");
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "INVALID_REQUEST", "Request JSON is invalid.");
  }
}

export const PAID_PLAN_PRODUCTS = [
  "plus_monthly",
  "plus_yearly",
  "pro_monthly",
  "pro_yearly",
] as const;

export type PaidPlanProduct = typeof PAID_PLAN_PRODUCTS[number];

export function requiredPlanProduct(value: unknown): PaidPlanProduct {
  if (typeof value === "string" && PAID_PLAN_PRODUCTS.includes(value as PaidPlanProduct)) {
    return value as PaidPlanProduct;
  }
  throw new HttpError(400, "INVALID_PLAN", "Choose an available Plus or Pro pass.");
}

export function walletRetired(): never {
  throw new HttpError(
    410,
    "WALLET_RETIRED",
    "This feature is not available right now.",
  );
}

export function requiredReference(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]{16,160}$/.test(value)) {
    throw new HttpError(
      400,
      "INVALID_REFERENCE",
      "The payment reference is invalid.",
    );
  }
  return value;
}

export function requiredUuid(value: unknown, field = "id"): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new HttpError(400, "INVALID_REQUEST", `The ${field} is invalid.`);
  }
  return value;
}

export async function sha512HmacHex(
  rawBody: ArrayBuffer,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, rawBody);
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqualHex(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{128}$/i.test(actual) || !/^[a-f0-9]{128}$/i.test(expected))
    return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1)
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export async function timingSafeEqualText(
  actual: string,
  expected: string,
): Promise<boolean> {
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-512", textEncoder.encode(actual)),
    crypto.subtle.digest("SHA-512", textEncoder.encode(expected)),
  ]);
  const actualBytes = new Uint8Array(actualHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < actualBytes.length; index += 1)
    difference |= actualBytes[index] ^ expectedBytes[index];
  return difference === 0;
}

export interface PaystackTransaction {
  id: number | string;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
  customer?: { email?: string | null } | null;
  metadata?: Record<string, unknown> | null;
}

interface PaystackResponse<T> {
  status: boolean;
  message?: string;
  code?: string;
  type?: string;
  data?: T;
}

export class PaystackProviderError extends HttpError {
  readonly providerStatus: number;
  readonly definitiveTransferFailureCode:
    | "insufficient_balance"
    | "invalid_recipient"
    | null;
  readonly isDefinitiveTransferRejection: boolean;

  constructor(providerStatus: number, providerMessage: string | undefined) {
    const normalized = providerMessage?.trim().toLowerCase() ?? "";
    super(
      502,
      "PAYMENT_PROVIDER_ERROR",
      "Payment provider is temporarily unavailable. Try again.",
    );
    this.providerStatus = providerStatus;
    this.definitiveTransferFailureCode = providerStatus === 400
      ? normalized === "your balance is not enough to fulfill this request"
        ? "insufficient_balance"
        : normalized === "recipient specified is invalid"
        ? "invalid_recipient"
        : null
      : null;
    this.isDefinitiveTransferRejection =
      this.definitiveTransferFailureCode !== null;
  }
}

export async function paystackRequest<T>(
  path: string,
  init: RequestInit = {},
  diagnostics: { requestId?: string; operation?: string } = {},
): Promise<T> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${requiredEnv("PAYSTACK_SECRET_KEY")}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  let payload: PaystackResponse<T> | null = null;
  try {
    payload = (await response.json()) as PaystackResponse<T>;
  } catch {
    /* handled below */
  }
  if (!response.ok || !payload?.status || !payload.data) {
    console.error("Paystack API request failed", {
      operation: diagnostics.operation ?? "paystack_request",
      route: path.split("?", 1)[0],
      providerStatus: response.status,
      ...(diagnostics.requestId ? { requestId: diagnostics.requestId } : {}),
    });
    throw new PaystackProviderError(response.status, payload?.message);
  }
  return payload.data;
}

export async function initializePaystackTransaction(input: {
  email: string;
  amount: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
  requestId?: string;
}): Promise<{
  authorization_url: string;
  access_code?: string;
  reference: string;
}> {
  return paystackRequest("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amount,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
      channels: ["card", "bank", "ussd", "bank_transfer"],
    }),
  }, { requestId: input.requestId, operation: "transaction_initialize" });
}

export async function verifyPaystackTransaction(
  reference: string,
): Promise<PaystackTransaction> {
  return paystackRequest<PaystackTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}

export function parseProviderTimestamp(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function sanitizedProviderData(
  transaction: PaystackTransaction,
): Record<string, unknown> {
  return {
    id: String(transaction.id),
    reference: transaction.reference,
    status: transaction.status,
    amount: transaction.amount,
    currency: transaction.currency,
    paid_at: transaction.paid_at ?? null,
  };
}
