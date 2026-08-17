import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  HttpError,
  sanitizedProviderData,
  type PaystackTransaction,
  verifyPaystackTransaction,
} from "./security.ts";

export type WalletTopupIntent = {
  id: string;
  user_id: string;
  amount_kobo: number;
  currency: string;
  status: string;
  expires_at: string;
  settled_at?: string | null;
};

type ProviderEventResult = {
  processingStatus: "processed" | "ignored" | "failed";
  processingError?: string;
  message: string;
};

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    return value;
  // Paystack refund webhooks commonly encode the amount as a decimal string.
  // Accept only a positive base-10 integer that still fits JavaScript's exact
  // integer range; kobo values must never be parsed as floating point.
  if (typeof value === "string" && /^[1-9]\d{0,14}$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export async function getWalletTopupIntent(
  admin: SupabaseClient,
  reference: string,
): Promise<WalletTopupIntent | null> {
  const { data, error } = await admin
    .from("wallet_topup_intents")
    .select(
      "id, user_id, amount_kobo, currency, status, expires_at, settled_at",
    )
    .eq("provider", "paystack")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (error) throw error;
  return data as WalletTopupIntent | null;
}

export function assertWalletTopupMetadata(
  intent: WalletTopupIntent,
  reference: string,
  transaction: PaystackTransaction,
) {
  const metadata = transaction.metadata ?? {};
  if (
    transaction.reference !== reference ||
    transaction.amount !== intent.amount_kobo ||
    transaction.currency !== intent.currency ||
    metadata.wallet_intent_id !== intent.id ||
    metadata.wallet_user_id !== intent.user_id ||
    metadata.purpose !== "wallet_topup"
  ) {
    throw new HttpError(
      409,
      "VERIFICATION_MISMATCH",
      "The payment provider details do not match this wallet funding request.",
    );
  }
}

export async function settleWalletTopup(
  admin: SupabaseClient,
  intent: WalletTopupIntent,
  transaction: PaystackTransaction,
): Promise<"settled" | "closed_account_exception"> {
  assertWalletTopupMetadata(intent, transaction.reference, transaction);
  const { data, error } = await admin.rpc("settle_verified_wallet_topup", {
    p_reference: transaction.reference,
    p_provider_transaction_id: String(transaction.id),
    p_amount_kobo: transaction.amount,
    p_currency: transaction.currency,
    p_provider_data: sanitizedProviderData(transaction),
  });
  if (error) throw error;

  // A NULL result is deliberate: the database recorded a provider-confirmed
  // payment against a closed/tombstoned Wallet as an operator exception instead
  // of creating a spendable credit.
  return data ? "settled" : "closed_account_exception";
}

export async function recordWalletTopupNonpayment(
  admin: SupabaseClient,
  intent: WalletTopupIntent,
  providerStatus: string,
  transaction: PaystackTransaction,
): Promise<"failed" | "cancelled" | "expired" | null> {
  const status =
    providerStatus === "failed"
      ? "failed"
      : new Date(intent.expires_at).getTime() <= Date.now()
        ? "expired"
        : null;
  if (!status) return null;
  const { error } = await admin.rpc("record_verified_wallet_topup_nonpayment", {
    p_reference: transaction.reference,
    p_status: status,
    p_provider_data: sanitizedProviderData(transaction),
  });
  if (error) throw error;
  return status;
}

export async function processVerifiedWalletPaystackEvent(
  admin: SupabaseClient,
  input: {
    eventType: string;
    reference: string;
    transactionId: unknown;
    data: Record<string, unknown>;
  },
): Promise<ProviderEventResult> {
  const transaction = await verifyPaystackTransaction(input.reference);
  if (
    transaction.reference !== input.reference ||
    transaction.status !== "success"
  ) {
    return {
      processingStatus: "failed",
      processingError: "Provider transaction verification mismatch",
      message: "Verification failed",
    };
  }

  const intent = await getWalletTopupIntent(admin, input.reference);
  if (!intent)
    return {
      processingStatus: "failed",
      processingError: "Wallet intent not found",
      message: "Intent mismatch",
    };

  try {
    assertWalletTopupMetadata(intent, input.reference, transaction);
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        processingStatus: "failed",
        processingError: "Wallet intent metadata mismatch",
        message: "Intent mismatch",
      };
    }
    throw error;
  }

  if (input.eventType === "refund.processed") {
    const refundReference = textValue(input.data.refund_reference);
    const refundAmountKobo = positiveInteger(input.data.amount);
    const refundCurrency = textValue(input.data.currency);
    if (
      !refundReference ||
      !refundAmountKobo ||
      refundCurrency !== intent.currency
    ) {
      return {
        processingStatus: "failed",
        processingError: "Refund payload mismatch",
        message: "Refund mismatch",
      };
    }
    const { error } = await admin.rpc("reverse_wallet_topup", {
      p_reference: input.reference,
      p_refund_reference: refundReference,
      p_amount_kobo: refundAmountKobo,
      p_provider_event: input.eventType,
      p_provider_data: {
        ...sanitizedProviderData(transaction),
        refund_reference: refundReference,
        refund_amount_kobo: refundAmountKobo,
      },
    });
    if (error) throw error;
    return { processingStatus: "processed", message: "Refund reversed" };
  }

  if (input.eventType.startsWith("charge.dispute.")) {
    if (
      input.eventType === "charge.dispute.create" ||
      input.eventType === "charge.dispute.remind"
    ) {
      const { error } = await admin.rpc("flag_wallet_topup_dispute", {
        p_reference: input.reference,
        p_provider_event: input.eventType,
        p_provider_data: sanitizedProviderData(transaction),
      });
      if (error) throw error;
    }
    return { processingStatus: "processed", message: "Dispute recorded" };
  }

  if (input.eventType !== "charge.success") {
    return { processingStatus: "ignored", message: "Ignored" };
  }

  if (
    (typeof input.transactionId !== "number" &&
      typeof input.transactionId !== "string") ||
    String(transaction.id) !== String(input.transactionId) ||
    transaction.amount !== intent.amount_kobo ||
    transaction.currency !== intent.currency
  ) {
    return {
      processingStatus: "failed",
      processingError: "Charge success verification mismatch",
      message: "Verification failed",
    };
  }

  const settlement = await settleWalletTopup(admin, intent, transaction);
  if (settlement === "closed_account_exception") {
    return {
      processingStatus: "ignored",
      processingError: "Closed Wallet payment exception recorded",
      message: "Closed Wallet exception recorded",
    };
  }
  return { processingStatus: "processed", message: "Settled" };
}
