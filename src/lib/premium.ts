import { supabase } from "@/lib/supabase";
import type { Grade } from "@/lib/exams";

// ---------- Plan catalog and live entitlement ----------

export type PlanSlug = "free" | "plus" | "pro";
export type PaidPlanSlug = "plus_monthly" | "plus_yearly" | "pro_monthly" | "pro_yearly";
export type PlanProductSlug = "free" | PaidPlanSlug;
export type PlanInterval = "free" | "monthly" | "yearly" | "one_time";

export interface Plan {
  id: string;
  slug: PlanProductSlug;
  name: string;
  price_kobo: number;
  interval: PlanInterval;
  tier: Exclude<PlanSlug, "free"> | null;
  access_days: 30 | 365 | null;
  tagline: string | null;
  features: string[];
  highlighted: boolean;
  active: boolean;
  sort_order: number;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  /** Display cache only. Feature decisions must use getMyEntitlement(). */
  plan_slug: PlanSlug;
}

interface EntitlementRpcPayload {
  plan?: unknown;
  status?: unknown;
  ends_at?: unknown;
  completed_exams?: unknown;
  remaining_exams?: unknown;
  can_take_exam?: unknown;
  can_download_results?: unknown;
  can_read_plus?: unknown;
  can_read_pro?: unknown;
}

export interface EntitlementInfo {
  plan: PlanSlug;
  status: "active";
  endsAt: string | null;
  completedExams: number;
  remainingExams: number | null;
  canTakeExam: boolean;
  canDownloadResults: boolean;
  canReadPlus: boolean;
  canReadPro: boolean;
}

/** Compatibility name used by existing dashboard UI. It is live entitlement data. */
export type PlanInfo = EntitlementInfo;

function isPlanSlug(value: unknown): value is PlanSlug {
  return value === "free" || value === "plus" || value === "pro";
}

export function isPaidPlanSlug(value: unknown): value is PaidPlanSlug {
  return value === "plus_monthly" || value === "plus_yearly" || value === "pro_monthly" || value === "pro_yearly";
}

export function planProductLabel(product: PaidPlanSlug): string {
  switch (product) {
    case "plus_monthly": return "Plus Monthly";
    case "plus_yearly": return "Plus Yearly";
    case "pro_monthly": return "Pro Monthly";
    case "pro_yearly": return "Pro Yearly";
  }
}

export function accessDurationLabel(accessDays: 30 | 365 | null | undefined): string {
  return accessDays === 365 ? "365-day pass" : "30-day pass";
}

function asNonNegativeInteger(value: unknown, fallback: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function entitlementFromPayload(payload: EntitlementRpcPayload): EntitlementInfo {
  const plan = isPlanSlug(payload.plan) ? payload.plan : "free";
  return {
    plan,
    status: "active",
    endsAt: typeof payload.ends_at === "string" ? payload.ends_at : null,
    completedExams: asNonNegativeInteger(payload.completed_exams, 0) ?? 0,
    remainingExams: asNonNegativeInteger(payload.remaining_exams, null),
    canTakeExam: payload.can_take_exam === true,
    canDownloadResults: payload.can_download_results === true,
    canReadPlus: payload.can_read_plus === true,
    canReadPro: payload.can_read_pro === true,
  };
}

export function isPaidPlan(plan: PlanSlug): boolean {
  return plan === "plus" || plan === "pro";
}

/** Use only for paid-plan presentation; it does not replace feature capabilities. */
export function isPremium(plan: PlanSlug): boolean {
  return isPaidPlan(plan);
}

export function planLabel(plan: PlanSlug): string {
  return plan === "pro" ? "Pro" : plan === "plus" ? "Plus" : "Free";
}

export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, plan_slug")
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Profile) ?? null;
}

export async function getMyEntitlement(): Promise<EntitlementInfo> {
  const { data, error } = await supabase.rpc("get_my_entitlement");
  if (error) throw error;
  return entitlementFromPayload((data ?? {}) as EntitlementRpcPayload);
}

export async function getPlan(): Promise<PlanSlug> {
  return (await getMyEntitlement()).plan;
}

export async function getPlanInfo(): Promise<PlanInfo> {
  return getMyEntitlement();
}

export async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Plan[];
}

export class PremiumError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "PremiumError";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function isResponseLike(value: unknown): value is { clone: () => { json: () => Promise<unknown> } } {
  const candidate = record(value);
  return typeof candidate.clone === "function";
}

const PUBLIC_PREMIUM_ERRORS: Record<string, string> = {
  UNAUTHENTICATED: "Sign in again to continue.",
  MISSING_EMAIL: "Add an email address to your account before paying.",
  INVALID_PLAN: "Choose an available Plus or Pro pass.",
  PLAN_UNAVAILABLE: "That pass is not currently available.",
  CHECKOUT_ALREADY_OPEN: "A checkout is already open. Resume it or check its status before trying another payment.",
  DOWNGRADE_NOT_AVAILABLE: "Your active Pro pass already includes Plus access.",
  PAYMENT_INITIALIZATION_REJECTED: "We could not open Paystack checkout. No payment was started, so you can try again.",
  PAYMENT_INITIALIZATION_RECONCILING: "We are checking whether checkout was created. Do not try again yet.",
  PAYMENT_PROVIDER_ERROR: "The payment provider is temporarily unavailable. Try again.",
  ORIGIN_NOT_ALLOWED: "Secure checkout is not available from this address.",
};

async function premiumFunctionError(
  error: unknown,
  fallback: string,
): Promise<PremiumError> {
  const context = record(error).context;
  if (isResponseLike(context)) {
    try {
      const body = record(await context.clone().json());
      const code = typeof body.error === "string" ? body.error : "";
      const message = PUBLIC_PREMIUM_ERRORS[code];
      if (message) return new PremiumError(message, code, isRequestId(body.requestId) ? body.requestId : undefined);
    } catch {
      // Fall through to the safe generic error below.
    }
  }
  const name = typeof record(error).name === "string" ? record(error).name : "";
  if (name === "FunctionsFetchError") {
    return new PremiumError(
      "We can't reach secure checkout. Check your connection and try again.",
      "PREMIUM_SERVICE_UNREACHABLE",
    );
  }
  return new PremiumError(fallback, "PREMIUM_SERVICE_UNAVAILABLE");
}

function functionMessage(_error: unknown, fallback: string): string {
  return fallback;
}

export interface OpenPaymentCheckout {
  product: PaidPlanSlug;
  tier: Exclude<PlanSlug, "free">;
  reference: string;
  status: "pending" | "initialized" | "reconciling";
  expiresAt: string;
}

function openPaymentCheckout(value: unknown): OpenPaymentCheckout | null {
  if (value === null) return null;
  const row = record(value);
  // `plan` is retained only for a short compatibility period while a migrated
  // checkout created before this frontend release can still be resumed.
  const rawProduct = row.product ?? row.plan;
  const product = isPaidPlanSlug(rawProduct)
    ? rawProduct
    : rawProduct === "plus" ? "plus_monthly"
    : rawProduct === "pro" ? "pro_monthly"
    : null;
  const tier = row.tier === "plus" || row.tier === "pro"
    ? row.tier
    : product?.startsWith("plus_") ? "plus" : product?.startsWith("pro_") ? "pro" : null;
  if (
    !product ||
    !tier ||
    typeof row.reference !== "string" || !/^exf_[A-Za-z0-9]{16,160}$/u.test(row.reference) ||
    (row.status !== "pending" && row.status !== "initialized" && row.status !== "reconciling") ||
    typeof row.expiresAt !== "string"
  ) return null;
  return { product, tier, reference: row.reference, status: row.status, expiresAt: row.expiresAt };
}

export async function getMyOpenPaymentCheckout(): Promise<OpenPaymentCheckout | null> {
  const { data, error } = await supabase.rpc("get_my_open_payment_checkout");
  if (error) throw new PremiumError("We couldn't check an existing checkout. Please try again.", "PREMIUM_CHECKOUT_UNAVAILABLE");
  return openPaymentCheckout(data);
}

export async function createCheckout(planSlug: PaidPlanSlug): Promise<string> {
  const { data, error } = await supabase.functions.invoke("create-checkout", { body: { planSlug } });
  if (error) throw await premiumFunctionError(error, "We couldn't start checkout. Please try again.");
  const authorizationUrl = record(data).authorizationUrl;
  if (typeof authorizationUrl !== "string" || !authorizationUrl.startsWith("https://")) {
    throw new PremiumError("Checkout did not return a valid payment link.", "PREMIUM_INVALID_CHECKOUT");
  }
  return authorizationUrl;
}

export async function resumePaymentCheckout(): Promise<{ authorizationUrl: string; reference: string }> {
  const { data, error } = await supabase.functions.invoke("resume-payment-checkout", { body: {} });
  if (error) throw await premiumFunctionError(error, "We couldn't resume that checkout. Please try again.");
  const response = record(data);
  if (
    typeof response.authorizationUrl !== "string" || !response.authorizationUrl.startsWith("https://") ||
    typeof response.reference !== "string" || !/^exf_[A-Za-z0-9]{16,160}$/u.test(response.reference)
  ) throw new PremiumError("Checkout did not return a valid payment link.", "PREMIUM_INVALID_CHECKOUT");
  return { authorizationUrl: response.authorizationUrl, reference: response.reference };
}

export type PaymentReturnStatus = "paid" | "pending" | "failed" | "verification_failed";

export interface PaymentReturn {
  status: PaymentReturnStatus;
  plan?: PlanSlug;
  product?: PaidPlanSlug;
  accessDays?: 30 | 365;
  endsAt?: string | null;
}

export async function verifyPaymentReturn(reference: string): Promise<PaymentReturn> {
  const { data, error } = await supabase.functions.invoke("verify-payment-return", { body: { reference } });
  if (error) throw await premiumFunctionError(error, "We couldn't verify this payment yet. Please try again.");
  const response = record(data);
  const status = response.status;
  if (status !== "paid" && status !== "pending" && status !== "failed" && status !== "verification_failed") {
    throw new PremiumError("The payment response was invalid.", "PREMIUM_INVALID_PAYMENT_RESPONSE");
  }
  return {
    status,
    plan: isPlanSlug(response.plan) ? response.plan : undefined,
    product: isPaidPlanSlug(response.product) ? response.product : undefined,
    accessDays: response.accessDays === 30 || response.accessDays === 365
      ? response.accessDays
      : undefined,
    endsAt: typeof response.endsAt === "string" ? response.endsAt : null,
  };
}

export async function downloadResultPdf(attemptId: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke("download-result-pdf", { body: { attemptId } });
  if (error) throw new Error(functionMessage(error, "We couldn't prepare your result PDF. Please try again."));
  if (!(data instanceof Blob)) throw new Error("The result PDF response was invalid.");
  return data;
}

export async function downloadStudyMaterialPdf(materialId: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke("download-study-material-pdf", { body: { materialId } });
  if (error) throw new Error(functionMessage(error, "We couldn't prepare your study-material PDF. Please try again."));
  if (!(data instanceof Blob)) throw new Error("The study-material PDF response was invalid.");
  return data;
}

// ---------- Grading ----------

export const GRADE_REMARKS: Record<Grade, string> = {
  A: "Excellent",
  B: "Very Good",
  C: "Good",
  D: "Fair",
  E: "Poor",
  F: "Fail",
};

export function remarkForGrade(grade: Grade | string | null): string {
  if (!grade) return "Awaiting result";
  return GRADE_REMARKS[grade as Grade] ?? "Awaiting result";
}

export interface GradeStyle {
  text: string;
  bg: string;
  ring: string;
}

export function gradeStyle(grade: Grade | string | null): GradeStyle {
  switch (grade) {
    case "A":
    case "B":
      return { text: "text-success", bg: "bg-success-soft", ring: "ring-success/30" };
    case "C":
    case "D":
      return { text: "text-gold-ink", bg: "bg-gold-soft", ring: "ring-gold/30" };
    case "E":
    case "F":
      return { text: "text-accent-ink", bg: "bg-accent-soft", ring: "ring-accent/30" };
    default:
      return { text: "text-ink-soft", bg: "bg-canvas", ring: "ring-line" };
  }
}

// ---------- Formatting ----------

export function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes <= 0) return `${remainder}s`;
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}
