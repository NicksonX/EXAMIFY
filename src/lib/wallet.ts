import { supabase } from "@/lib/supabase";

export interface WalletBalance {
  currency: "NGN";
  status: "active" | "frozen" | "closed";
  settledBalanceKobo: number;
  availableBalanceKobo: number;
  heldBalanceKobo: number;
}

export interface WalletTransaction {
  id: string;
  transactionType:
    | "wallet_topup"
    | "wallet_topup_reversal"
    | "withdrawal_paid"
    | "withdrawal_release"
    | "referral_credit"
    | "manual_adjustment";
  status: "posted" | "reversed";
  amountKobo: number;
  direction: "debit" | "credit";
  provider: string | null;
  providerReference: string | null;
  createdAt: string;
}

export interface WalletSettings {
  minimumTopupKobo: number;
  maximumTopupKobo: number | null;
  paystackWalletEnabled: boolean;
  minimumWithdrawalKobo: number;
  withdrawalsEnabled: boolean;
  paystackPayoutsEnabled: boolean;
  manualPayoutRequestsEnabled: boolean;
}

export interface PayoutBank {
  name: string;
  code: string;
}

export type ManualPayoutBank = PayoutBank;

export interface ManualPayoutRequest {
  id: string;
  amountKobo: number;
  status: string;
  bankName: string;
  accountHolderName: string;
  accountNumberMasked: string;
  requestedAt: string;
  reviewReason: string | null;
  completedAt: string | null;
}

export function filterPayoutBanks(banks: PayoutBank[], search: string): PayoutBank[] {
  const query = search.trim().toLocaleLowerCase("en-NG");
  if (!query) return banks;
  return banks.filter((bank) =>
    `${bank.name} ${bank.code}`.toLocaleLowerCase("en-NG").includes(query),
  );
}

export interface PayoutDestination {
  id: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  status:
    | "pending_confirmation"
    | "confirming"
    | "confirmed"
    | "reconciliation_required"
    | "unavailable";
  confirmationExpiresAt: string | null;
  createdAt: string | null;
}

export interface PendingPayoutDestination {
  id: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  confirmationToken: string;
  confirmationExpiresAt: string;
}

export interface PayoutRequest {
  id: string;
  amountKobo: number;
  status: string;
  destination: Record<string, unknown>;
  reviewReason: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
}

class WalletError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "WalletError";
  }
}

function finiteAmount(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function errorCode(error: unknown): string {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "";
}

function walletRpcError(
  error: unknown,
  scope: "balance" | "settings" | "activity",
): WalletError {
  const code = errorCode(error);
  if (code === "PGRST202" || code === "42883") {
    return new WalletError(
      "Wallet setup is unavailable right now. Please try again shortly. [WALLET_SCHEMA_UNAVAILABLE]",
      "WALLET_SCHEMA_UNAVAILABLE",
    );
  }
  if (code === "42501") {
    return new WalletError(
      "Your wallet access is unavailable. Sign in again, then contact support if it continues. [WALLET_ACCESS_UNAVAILABLE]",
      "WALLET_ACCESS_UNAVAILABLE",
    );
  }
  if (code === "401" || code === "PGRST301") {
    return new WalletError(
      "Your session has expired. Sign in again to use your wallet. [WALLET_SIGN_IN_REQUIRED]",
      "WALLET_SIGN_IN_REQUIRED",
    );
  }
  const label =
    scope === "balance"
      ? "balance"
      : scope === "settings"
        ? "funding options"
        : "wallet activity";
  return new WalletError(
    `We couldn't load your ${label} right now. Please try again. [WALLET_${scope.toUpperCase()}_UNAVAILABLE]`,
    `WALLET_${scope.toUpperCase()}_UNAVAILABLE`,
  );
}

async function functionError(
  error: unknown,
  fallback: string,
  submissionMayBeUnconfirmed = false,
): Promise<WalletError> {
  const context =
    error && typeof error === "object" && "context" in error
      ? error.context
      : null;
  if (context instanceof Response) {
    try {
      const body = record(await context.clone().json());
      const safeCode =
        typeof body.error === "string" && /^[A-Z0-9_]{3,80}$/.test(body.error)
          ? body.error
          : "WALLET_SERVICE_UNAVAILABLE";
      const safeMessage =
        typeof body.message === "string" &&
        body.message.length > 0 &&
        body.message.length <= 220
          ? body.message
          : fallback;
      if (safeCode === "INTERNAL_ERROR" && submissionMayBeUnconfirmed) {
        return new WalletError(
          "We could not confirm this withdrawal request. Check its status before trying again. [PAYOUT_REQUEST_UNCONFIRMED]",
          "PAYOUT_REQUEST_UNCONFIRMED",
        );
      }
      if (safeCode === "INTERNAL_ERROR")
        return new WalletError(fallback, "WALLET_SERVICE_UNAVAILABLE");
      return new WalletError(`${safeMessage} [${safeCode}]`, safeCode);
    } catch {
      return submissionMayBeUnconfirmed
        ? new WalletError("We could not confirm this withdrawal request. Check its status before trying again. [PAYOUT_REQUEST_UNCONFIRMED]", "PAYOUT_REQUEST_UNCONFIRMED")
        : new WalletError(fallback, "WALLET_SERVICE_UNAVAILABLE");
    }
  }
  const name =
    error &&
    typeof error === "object" &&
    "name" in error &&
    typeof error.name === "string"
      ? error.name
      : "";
  if (submissionMayBeUnconfirmed) {
    return new WalletError(
      "We could not confirm this withdrawal request. Check its status before trying again. [PAYOUT_REQUEST_UNCONFIRMED]",
      "PAYOUT_REQUEST_UNCONFIRMED",
    );
  }
  if (name === "FunctionsFetchError") {
    return new WalletError(
      "We can't reach the wallet service. Check your connection and try again. [WALLET_SERVICE_UNREACHABLE]",
      "WALLET_SERVICE_UNREACHABLE",
    );
  }
  if (name === "FunctionsRelayError") {
    return new WalletError(
      "The wallet service is temporarily unavailable. Please try again shortly. [WALLET_SERVICE_UNAVAILABLE]",
      "WALLET_SERVICE_UNAVAILABLE",
    );
  }
  return new WalletError(fallback, "WALLET_SERVICE_UNAVAILABLE");
}

export function isManualPayoutSubmissionUnconfirmed(error: unknown): boolean {
  return error instanceof WalletError && error.code === "PAYOUT_REQUEST_UNCONFIRMED";
}

export async function getMyWallet(): Promise<WalletBalance> {
  const { data, error } = await supabase.rpc("get_my_wallet");
  if (error) throw walletRpcError(error, "balance");
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== "object")
    throw new WalletError(
      "Wallet setup is unavailable right now. Please try again shortly. [WALLET_SCHEMA_UNAVAILABLE]",
      "WALLET_SCHEMA_UNAVAILABLE",
    );
  const value = row as Record<string, unknown>;
  return {
    currency: value.currency === "NGN" ? "NGN" : "NGN",
    status:
      value.status === "active" ||
      value.status === "frozen" ||
      value.status === "closed"
        ? value.status
        : "active",
    settledBalanceKobo: finiteAmount(value.settled_balance_kobo),
    availableBalanceKobo: finiteAmount(value.available_balance_kobo),
    heldBalanceKobo: finiteAmount(value.held_balance_kobo),
  };
}

export async function getWalletSettings(): Promise<WalletSettings> {
  const { data, error } = await supabase.rpc("get_wallet_settings");
  if (error) throw walletRpcError(error, "settings");
  const root = record(data);
  const wallet = record(root.wallet_policy);
  const withdrawal = record(root.withdrawal_policy);
  const providers = record(root.provider_features);
  return {
    minimumTopupKobo: finiteAmount(wallet.minimum_topup_kobo, 50_000),
    maximumTopupKobo:
      wallet.maximum_topup_kobo === null
        ? null
        : finiteAmount(wallet.maximum_topup_kobo, 0) || null,
    paystackWalletEnabled: providers.paystack_wallet === true,
    minimumWithdrawalKobo: finiteAmount(withdrawal.minimum_withdrawal_kobo, 50_000),
    withdrawalsEnabled: withdrawal.withdrawals_enabled === true,
    paystackPayoutsEnabled: providers.paystack_payouts === true,
    manualPayoutRequestsEnabled: providers.manual_payout_requests === true,
  };
}

export async function getWalletTransactions(): Promise<WalletTransaction[]> {
  const { data, error } = await supabase.rpc("get_my_wallet_transactions", {
    p_limit: 50,
    p_offset: 0,
  });
  if (error) throw walletRpcError(error, "activity");
  return (Array.isArray(data) ? data : []).flatMap(
    (item): WalletTransaction[] => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (
        typeof row.id !== "string" ||
        typeof row.transaction_type !== "string" ||
        typeof row.created_at !== "string"
      )
        return [];
      return [
        {
          id: row.id,
          transactionType:
            row.transaction_type as WalletTransaction["transactionType"],
          status: row.status === "reversed" ? "reversed" : "posted",
          amountKobo: finiteAmount(row.amount_kobo),
          direction: row.direction === "debit" ? "debit" : "credit",
          provider: typeof row.provider === "string" ? row.provider : null,
          providerReference:
            typeof row.provider_reference === "string"
              ? row.provider_reference
              : null,
          createdAt: row.created_at,
        },
      ];
    },
  );
}

export async function createWalletTopup(amountKobo: number): Promise<string> {
  const { data, error } = await supabase.functions.invoke(
    "create-wallet-topup",
    { body: { amountKobo } },
  );
  if (error)
    throw await functionError(
      error,
      "We couldn't start wallet funding. Please try again.",
    );
  const authorizationUrl = record(data).authorizationUrl;
  if (
    typeof authorizationUrl !== "string" ||
    !authorizationUrl.startsWith("https://")
  )
    throw new WalletError(
      "Wallet funding did not return a valid payment link. [WALLET_INVALID_CHECKOUT]",
      "WALLET_INVALID_CHECKOUT",
    );
  return authorizationUrl;
}

export type WalletTopupStatus =
  | "paid"
  | "pending"
  | "reconciling"
  | "failed"
  | "cancelled"
  | "expired"
  | "reversed";

export interface OpenWalletTopup {
  reference: string;
  amountKobo: number;
  currency: "NGN";
  status: "pending" | "initialized" | "reconciling";
  createdAt: string;
  expiresAt: string;
}

export async function verifyWalletTopupReturn(
  reference: string,
): Promise<WalletTopupStatus> {
  const { data, error } = await supabase.functions.invoke(
    "verify-wallet-topup-return",
    { body: { reference } },
  );
  if (error)
    throw await functionError(
      error,
      "We couldn't verify this wallet funding payment yet.",
    );
  const status = record(data).status;
  if (
    ![
      "paid",
      "pending",
      "reconciling",
      "failed",
      "cancelled",
      "expired",
      "reversed",
    ].includes(String(status))
  ) {
    throw new WalletError(
      "The wallet funding status was invalid. [WALLET_INVALID_STATUS]",
      "WALLET_INVALID_STATUS",
    );
  }
  return status as WalletTopupStatus;
}

export async function getMyOpenWalletTopup(): Promise<OpenWalletTopup | null> {
  const { data, error } = await supabase.rpc("get_my_open_wallet_topup");
  if (error) throw walletRpcError(error, "activity");
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  const statuses = ["pending", "initialized", "reconciling"] as const;
  if (
    typeof value.reference !== "string" ||
    typeof value.created_at !== "string" ||
    typeof value.expires_at !== "string" ||
    !statuses.includes(value.status as (typeof statuses)[number])
  )
    return null;
  return {
    reference: value.reference,
    amountKobo: finiteAmount(value.amount_kobo),
    currency: "NGN",
    status: value.status as OpenWalletTopup["status"],
    createdAt: value.created_at,
    expiresAt: value.expires_at,
  };
}

export interface ReferralSummary {
  code: string | null;
  pendingKobo: number;
  eligibleKobo: number;
  transferRequestedKobo: number;
  creditedKobo: number;
  referredCount: number;
}

export async function getMyReferralSummary(): Promise<ReferralSummary> {
  const { data, error } = await supabase.rpc("get_my_referral_summary");
  if (error) throw error;
  const value = record(data);
  return {
    code: typeof value.code === "string" ? value.code : null,
    pendingKobo: finiteAmount(value.pending_kobo),
    eligibleKobo: finiteAmount(value.eligible_kobo),
    transferRequestedKobo: finiteAmount(value.transfer_requested_kobo),
    creditedKobo: finiteAmount(value.credited_kobo),
    referredCount: finiteAmount(value.referred_count),
  };
}

export interface ReferralReward {
  id: string;
  amountKobo: number;
  status: string;
  createdAt: string;
  eligibleAt: string | null;
  transferStatus: string | null;
  reviewReason: string | null;
  reviewedAt: string | null;
}

export async function getMyReferralRewards(): Promise<ReferralReward[]> {
  const { data, error } = await supabase.rpc(
    "get_my_referral_reward_transfers",
  );
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((row): ReferralReward[] => {
    const value = record(row);
    if (
      typeof value.reward_id !== "string" ||
      typeof value.reward_created_at !== "string"
    )
      return [];
    return [
      {
        id: value.reward_id,
        amountKobo: finiteAmount(value.amount_kobo),
        status:
          typeof value.reward_status === "string"
            ? value.reward_status
            : "pending",
        createdAt: value.reward_created_at,
        eligibleAt:
          typeof value.eligible_at === "string" ? value.eligible_at : null,
        transferStatus:
          typeof value.transfer_status === "string"
            ? value.transfer_status
            : null,
        reviewReason:
          typeof value.review_reason === "string" ? value.review_reason : null,
        reviewedAt:
          typeof value.reviewed_at === "string" ? value.reviewed_at : null,
      },
    ];
  });
}

export async function requestReferralWalletTransfer(
  rewardId: string,
): Promise<void> {
  const { error } = await supabase.rpc("create_my_referral_transfer_request", {
    p_reward_id: rewardId,
  });
  if (error)
    throw new WalletError(
      "We couldn't request this referral reward transfer. Please refresh and try again.",
      "REFERRAL_TRANSFER_UNAVAILABLE",
    );
}

function payoutDestination(row: unknown): PayoutDestination | null {
  const value = record(row);
  const statuses = [
    "pending_confirmation",
    "confirming",
    "confirmed",
    "reconciliation_required",
    "unavailable",
  ] as const;
  if (
    typeof value.id !== "string" ||
    typeof value.bank_name !== "string" ||
    typeof value.account_name !== "string" ||
    typeof value.account_number_masked !== "string" ||
    typeof value.created_at !== "string" ||
    !statuses.includes(value.status as (typeof statuses)[number])
  ) return null;
  return {
    id: value.id,
    bankName: value.bank_name,
    accountName: value.account_name,
    accountNumberMasked: value.account_number_masked,
    status: value.status as PayoutDestination["status"],
    confirmationExpiresAt:
      typeof value.confirmation_expires_at === "string"
        ? value.confirmation_expires_at
        : null,
    createdAt: value.created_at,
  };
}

export async function getManualPayoutBanks(): Promise<ManualPayoutBank[]> {
  const { data, error } = await supabase.rpc("get_manual_payout_banks");
  if (error) throw walletRpcError(error, "activity");
  return (Array.isArray(data) ? data : []).flatMap((row): ManualPayoutBank[] => {
    const value = record(row);
    const code = typeof value.code === "string" ? value.code.trim() : "";
    const name = typeof value.name === "string" ? value.name.trim() : "";
    return code && name ? [{ code, name }] : [];
  });
}

function manualPayoutRequest(row: unknown): ManualPayoutRequest | null {
  const value = record(row);
  if (typeof value.id !== "string" || typeof value.requested_at !== "string") return null;
  return {
    id: value.id,
    amountKobo: finiteAmount(value.amount_kobo),
    status: typeof value.status === "string" ? value.status : "requested",
    bankName: typeof value.bank_name === "string" ? value.bank_name : "Nigerian bank",
    accountHolderName: typeof value.account_holder_name === "string" ? value.account_holder_name : "Account holder",
    accountNumberMasked: typeof value.account_number_masked === "string" ? value.account_number_masked : "******",
    requestedAt: value.requested_at,
    reviewReason: typeof value.review_reason === "string" ? value.review_reason : null,
    completedAt: typeof value.completed_at === "string" ? value.completed_at : null,
  };
}

export async function getMyManualPayoutRequests(): Promise<ManualPayoutRequest[]> {
  const { data, error } = await supabase.rpc("get_my_manual_payout_requests", { p_limit: 50 });
  if (error) throw walletRpcError(error, "activity");
  return (Array.isArray(data) ? data : []).flatMap((row): ManualPayoutRequest[] => {
    const request = manualPayoutRequest(row);
    return request ? [request] : [];
  });
}

export async function getMyManualPayoutRequestByClientRequestId(
  clientRequestId: string,
): Promise<ManualPayoutRequest | null> {
  const { data, error } = await supabase.rpc(
    "get_my_manual_payout_request_by_client_request_id",
    { p_client_request_id: clientRequestId },
  );
  if (error) throw walletRpcError(error, "activity");
  const row = Array.isArray(data) ? data[0] : null;
  return row ? manualPayoutRequest(row) : null;
}

export interface ManualPayoutSubmission {
  requestId: string;
}

export async function requestManualPayout(input: {
  bankCode: string;
  accountNumber: string;
  accountHolderName: string;
  amountKobo: number;
  pin: string;
  clientRequestId: string;
}): Promise<ManualPayoutSubmission> {
  const { data, error } = await supabase.functions.invoke("request-manual-payout", { body: input });
  if (error) {
    throw await functionError(
      error,
      "We couldn't place this withdrawal request. Please try again.",
      true,
    );
  }
  const result = record(data);
  if (result.status !== "requested" || typeof result.requestId !== "string") {
    throw new WalletError(
      "We could not confirm this withdrawal request. Check its status before trying again. [PAYOUT_REQUEST_UNCONFIRMED]",
      "PAYOUT_REQUEST_UNCONFIRMED",
    );
  }
  return { requestId: result.requestId };
}

export async function cancelManualPayoutRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_my_manual_payout_request", { p_request_id: requestId });
  if (error) throw new WalletError("This withdrawal request can no longer be cancelled. [PAYOUT_CANCEL_UNAVAILABLE]", "PAYOUT_CANCEL_UNAVAILABLE");
}

export async function getPaystackPayoutBanks(): Promise<PayoutBank[]> {
  const { data, error } = await supabase.functions.invoke(
    "list-paystack-payout-banks",
  );
  if (error)
    throw await functionError(error, "We couldn't load Nigerian banks right now.");
  const banks = record(data).banks;
  if (!Array.isArray(banks)) {
    throw new WalletError(
      "The Nigerian bank list was unavailable. Please retry. [PAYOUT_BANK_LIST_INVALID]",
      "PAYOUT_BANK_LIST_INVALID",
    );
  }
  const unique = new Map<string, PayoutBank>();
  for (const bank of banks) {
    const value = record(bank);
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const code = typeof value.code === "string" ? value.code.trim() : "";
    if (name && code) unique.set(code, { name, code });
  }
  return [...unique.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "en-NG"),
  );
}

export async function resolvePaystackPayoutDestination(input: {
  bankCode: string;
  accountNumber: string;
}): Promise<PendingPayoutDestination> {
  const { data, error } = await supabase.functions.invoke(
    "resolve-paystack-payout-destination",
    { body: input },
  );
  if (error)
    throw await functionError(error, "We couldn't verify that bank account.");
  const value = record(record(data).destination);
  if (
    typeof value.id !== "string" ||
    typeof value.bankName !== "string" ||
    typeof value.accountName !== "string" ||
    typeof value.accountNumberMasked !== "string" ||
    typeof value.confirmationToken !== "string" ||
    typeof value.confirmationExpiresAt !== "string"
  ) throw new WalletError("The verified bank account details were invalid. [PAYOUT_DESTINATION_INVALID]", "PAYOUT_DESTINATION_INVALID");
  return {
    id: value.id,
    bankName: value.bankName,
    accountName: value.accountName,
    accountNumberMasked: value.accountNumberMasked,
    confirmationToken: value.confirmationToken,
    confirmationExpiresAt: value.confirmationExpiresAt,
  };
}

export async function confirmPaystackPayoutDestination(input: {
  destinationId: string;
  confirmationToken: string;
}): Promise<PayoutDestination> {
  const { data, error } = await supabase.functions.invoke(
    "confirm-paystack-payout-destination",
    { body: input },
  );
  if (error)
    throw await functionError(error, "We couldn't save that verified bank account.");
  const value = record(record(data).destination);
  if (
    typeof value.id !== "string" ||
    typeof value.bankName !== "string" ||
    typeof value.accountName !== "string" ||
    typeof value.accountNumberMasked !== "string"
  ) throw new WalletError("The bank account confirmation was invalid. [PAYOUT_DESTINATION_INVALID]", "PAYOUT_DESTINATION_INVALID");
  return {
    id: value.id,
    bankName: value.bankName,
    accountName: value.accountName,
    accountNumberMasked: value.accountNumberMasked,
    status: "confirmed",
    confirmationExpiresAt: null,
    createdAt: null,
  };
}

export async function getMyPaystackPayoutDestinations(): Promise<PayoutDestination[]> {
  const { data, error } = await supabase.rpc("get_my_paystack_payout_destinations");
  if (error) throw walletRpcError(error, "activity");
  return (Array.isArray(data) ? data : []).flatMap((row): PayoutDestination[] => {
    const destination = payoutDestination(row);
    return destination ? [destination] : [];
  });
}

export async function getMyPaystackPayoutRequests(): Promise<PayoutRequest[]> {
  const { data, error } = await supabase.rpc("get_my_paystack_payout_requests", {
    p_limit: 50,
  });
  if (error) throw walletRpcError(error, "activity");
  return (Array.isArray(data) ? data : []).flatMap((row): PayoutRequest[] => {
    const value = record(row);
    if (
      typeof value.id !== "string" ||
      typeof value.requested_at !== "string" ||
      typeof value.status !== "string"
    ) return [];
    return [{
      id: value.id,
      amountKobo: finiteAmount(value.amount_kobo),
      status: value.status,
      destination: record(value.destination_snapshot),
      reviewReason: typeof value.review_reason === "string" ? value.review_reason : null,
      requestedAt: value.requested_at,
      reviewedAt: typeof value.reviewed_at === "string" ? value.reviewed_at : null,
      completedAt: typeof value.completed_at === "string" ? value.completed_at : null,
    }];
  });
}

export async function getWithdrawalPinStatus(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke(
    "get-withdrawal-pin-status",
    { body: {} },
  );
  if (error)
    throw await functionError(error, "We couldn't check your withdrawal PIN status.");
  return record(data).configured === true;
}

export async function setWithdrawalPin(pin: string): Promise<void> {
  const { error } = await supabase.functions.invoke("set-withdrawal-pin", {
    body: { pin },
  });
  if (error)
    throw await functionError(error, "We couldn't save your withdrawal PIN.");
}

export async function requestPaystackPayout(input: {
  destinationId: string;
  amountKobo: number;
  pin: string;
  clientRequestId: string;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke(
    "request-paystack-payout",
    { body: input },
  );
  if (error)
    throw await functionError(
      error,
      "We couldn't place this withdrawal request. Your Wallet balance was not debited.",
    );
  if (record(data).status !== "requested") {
    throw new WalletError(
      "The withdrawal request was not accepted. Your Wallet balance was not debited. [PAYOUT_REQUEST_INVALID]",
      "PAYOUT_REQUEST_INVALID",
    );
  }
}

export async function cancelPaystackPayoutRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_my_paystack_payout_request", {
    p_request_id: requestId,
  });
  if (error)
    throw new WalletError(
      "This withdrawal request can no longer be cancelled. [PAYOUT_CANCEL_UNAVAILABLE]",
      "PAYOUT_CANCEL_UNAVAILABLE",
    );
}

export async function getFinanceAdminSummary(): Promise<Record<
  string,
  number
> | null> {
  const { data, error } = await supabase.rpc("get_finance_admin_summary");
  if (error || !data || typeof data !== "object") return null;
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([key, value]) => [
      key,
      finiteAmount(value),
    ]),
  );
}
