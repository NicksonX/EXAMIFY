import { supabase } from "@/lib/supabase";

export interface AdminReferralTransfer {
  id: string;
  userId: string;
  userEmail: string | null;
  amountKobo: number;
  status: string;
  createdAt: string;
}

export interface AdminPayoutRequest {
  id: string;
  userId: string;
  userEmail: string | null;
  amountKobo: number;
  status: string;
  requestedAt: string;
}

export interface AdminManualPayoutRequest {
  id: string;
  userId: string;
  userEmail: string | null;
  amountKobo: number;
  status: string;
  requestedAt: string;
}

const amount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

function archiveError(error: unknown, fallback: string): Error {
  const value = objectValue(error);
  if (value.code === "NOT_AUTHORIZED" || value.message === "NOT_AUTHORIZED") {
    return new Error("Your account is not authorized to view the finance archive.");
  }
  return new Error(fallback);
}

/** Read-only, masked projections used during legacy financial reconciliation. */
export async function getAdminReferralTransfers(): Promise<
  AdminReferralTransfer[]
> {
  const { data, error } = await supabase.rpc(
    "get_finance_admin_referral_transfer_queue",
  );
  if (error) {
    throw archiveError(error, "We couldn't load the legacy referral archive.");
  }

  return (Array.isArray(data) ? data : []).flatMap(
    (row): AdminReferralTransfer[] => {
      const value = objectValue(row);
      if (
        typeof value.id !== "string" ||
        typeof value.user_id !== "string" ||
        typeof value.created_at !== "string"
      ) {
        return [];
      }
      return [{
        id: value.id,
        userId: value.user_id,
        userEmail: typeof value.user_email === "string" ? value.user_email : null,
        amountKobo: amount(value.amount_kobo),
        status: typeof value.status === "string" ? value.status : "unknown",
        createdAt: value.created_at,
      }];
    },
  );
}

/** Read-only, masked projections used during legacy financial reconciliation. */
export async function getAdminManualPayoutRequests(): Promise<
  AdminManualPayoutRequest[]
> {
  const { data, error } = await supabase.rpc(
    "get_finance_admin_manual_payout_queue",
  );
  if (error) {
    throw archiveError(error, "We couldn't load the legacy manual-payment archive.");
  }

  return (Array.isArray(data) ? data : []).flatMap(
    (row): AdminManualPayoutRequest[] => {
      const value = objectValue(row);
      if (
        typeof value.id !== "string" ||
        typeof value.user_id !== "string" ||
        typeof value.status !== "string" ||
        typeof value.requested_at !== "string"
      ) {
        return [];
      }
      return [{
        id: value.id,
        userId: value.user_id,
        userEmail: typeof value.user_email === "string" ? value.user_email : null,
        amountKobo: amount(value.amount_kobo),
        status: value.status,
        requestedAt: value.requested_at,
      }];
    },
  );
}

/** Read-only, masked projections used during legacy financial reconciliation. */
export async function getAdminPayoutRequests(): Promise<AdminPayoutRequest[]> {
  const { data, error } = await supabase.rpc(
    "get_finance_admin_paystack_payout_queue",
  );
  if (error) {
    throw archiveError(error, "We couldn't load the legacy payout archive.");
  }

  return (Array.isArray(data) ? data : []).flatMap((row): AdminPayoutRequest[] => {
    const value = objectValue(row);
    if (
      typeof value.id !== "string" ||
      typeof value.user_id !== "string" ||
      typeof value.status !== "string" ||
      typeof value.requested_at !== "string"
    ) {
      return [];
    }
    return [{
      id: value.id,
      userId: value.user_id,
      userEmail: typeof value.user_email === "string" ? value.user_email : null,
      amountKobo: amount(value.amount_kobo),
      status: value.status,
      requestedAt: value.requested_at,
    }];
  });
}
