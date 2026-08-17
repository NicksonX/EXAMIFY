import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sanitizedPaystackTransfer,
  type PaystackTransfer,
  verifyPaystackTransfer,
} from "./paystack-payouts.ts";

export type PayoutAttempt = {
  id: string;
  payout_request_id: string;
  provider_reference: string;
  expected_recipient_code: string;
  expected_recipient_id: string;
  amount_kobo: number;
  currency: string;
  state: string;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function getPaystackPayoutAttempt(
  admin: SupabaseClient,
  reference: string,
): Promise<PayoutAttempt | null> {
  const { data, error } = await admin
    .from("paystack_payout_attempts")
    .select("id, payout_request_id, provider_reference, expected_recipient_code, expected_recipient_id, amount_kobo, currency, state")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (error) throw error;
  return data as PayoutAttempt | null;
}

function assertVerifiedTransfer(attempt: PayoutAttempt, transfer: PaystackTransfer) {
  if (
    transfer.reference !== attempt.provider_reference ||
    transfer.amount !== attempt.amount_kobo ||
    transfer.currency !== attempt.currency ||
    String(transfer.recipient) !== attempt.expected_recipient_id ||
    !text(transfer.transfer_code) ||
    (typeof transfer.id !== "string" && typeof transfer.id !== "number")
  ) throw new Error("Paystack payout transfer did not match its local attempt.");
}

export async function recordVerifiedPaystackPayout(
  admin: SupabaseClient,
  reference: string,
  reconciliationLeaseToken: string,
): Promise<"paid" | "failed" | "reversed" | "processing" | "reconciliation_required"> {
  const [attempt, transfer] = await Promise.all([
    getPaystackPayoutAttempt(admin, reference),
    verifyPaystackTransfer(reference),
  ]);
  if (!attempt) throw new Error("Paystack payout attempt was not found.");
  assertVerifiedTransfer(attempt, transfer);
  const { data, error } = await admin.rpc(
    "record_verified_paystack_payout_outcome",
    {
      p_reference: reference,
      p_reconciliation_lease_token: reconciliationLeaseToken,
      p_provider_transfer_id: String(transfer.id),
      p_provider_transfer_code: transfer.transfer_code,
      p_provider_status: transfer.status,
      p_provider_data: sanitizedPaystackTransfer(transfer),
    },
  );
  if (error) throw error;
  if (!['paid', 'failed', 'reversed', 'processing', 'reconciliation_required'].includes(String(data)))
    throw new Error("Paystack payout outcome was invalid.");
  return data as "paid" | "failed" | "reversed" | "processing" | "reconciliation_required";
}
