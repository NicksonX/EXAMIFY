import { HttpError, type serviceClient } from "./security.ts";

type AdminClient = ReturnType<typeof serviceClient>;

type RetirementConfig = {
  state?: unknown;
  cutoff_at?: unknown;
};

function cutoffFrom(value: unknown): Date {
  const config = value && typeof value === "object"
    ? value as RetirementConfig
    : {};
  if (config.state !== "retired" || typeof config.cutoff_at !== "string") {
    throw new HttpError(
      503,
      "WALLET_RECONCILIATION_UNAVAILABLE",
      "Legacy payment reconciliation is not available right now.",
    );
  }
  const cutoff = new Date(config.cutoff_at);
  if (!Number.isFinite(cutoff.getTime())) {
    throw new HttpError(
      503,
      "WALLET_RECONCILIATION_UNAVAILABLE",
      "Legacy payment reconciliation is not available right now.",
    );
  }
  return cutoff;
}

async function cutoffAt(admin: AdminClient): Promise<Date> {
  const { data, error } = await admin
    .from("financial_config")
    .select("value")
    .eq("key", "wallet_retirement")
    .maybeSingle();
  if (error) throw error;
  return cutoffFrom(data?.value);
}

/**
 * Legacy Wallet settlement is allowed only for a record that already existed
 * at the operational-retirement cutoff. This is intentionally server-only.
 */
export async function requireLegacyWalletTopupReference(
  admin: AdminClient,
  reference: string,
): Promise<void> {
  const cutoff = await cutoffAt(admin);
  const { data, error } = await admin
    .from("wallet_topup_intents")
    .select("created_at")
    .eq("provider", "paystack")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (error) throw error;

  const createdAt = typeof data?.created_at === "string"
    ? new Date(data.created_at)
    : null;
  if (!createdAt || !Number.isFinite(createdAt.getTime()) || createdAt > cutoff) {
    throw new HttpError(
      410,
      "WALLET_RETIRED",
      "This feature is not available right now.",
    );
  }
}

export async function requireLegacyPaystackPayoutReference(
  admin: AdminClient,
  reference: string,
): Promise<void> {
  const cutoff = await cutoffAt(admin);
  const { data, error } = await admin
    .from("paystack_payout_attempts")
    .select("created_at")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (error) throw error;

  const createdAt = typeof data?.created_at === "string"
    ? new Date(data.created_at)
    : null;
  if (!createdAt || !Number.isFinite(createdAt.getTime()) || createdAt > cutoff) {
    throw new HttpError(
      410,
      "WALLET_RETIRED",
      "This feature is not available right now.",
    );
  }
}

export async function requireLegacyManualPayoutReference(
  admin: AdminClient,
  reference: string,
): Promise<void> {
  const cutoff = await cutoffAt(admin);
  const { data, error } = await admin
    .from("manual_payout_requests")
    .select("requested_at")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (error) throw error;

  const createdAt = typeof data?.requested_at === "string"
    ? new Date(data.requested_at)
    : null;
  if (!createdAt || !Number.isFinite(createdAt.getTime()) || createdAt > cutoff) {
    throw new HttpError(
      410,
      "WALLET_RETIRED",
      "This feature is not available right now.",
    );
  }
}
