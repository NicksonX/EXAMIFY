import {
  HttpError,
  paystackRequest,
  requiredEnv,
} from "./security.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type PaystackPayoutBank = {
  name: string;
  code: string;
  active?: boolean;
  country?: string;
  currency?: string;
  type?: string;
};

export type PaystackResolvedAccount = {
  account_number: string;
  account_name: string;
  bank_id?: number;
};

export type PaystackTransferRecipient = {
  id: number | string;
  recipient_code: string;
  active?: boolean;
  details?: {
    account_number?: string;
    account_name?: string;
    bank_code?: string;
    bank_name?: string;
  };
};

export type PaystackTransfer = {
  id: number | string;
  transfer_code: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  recipient: number | string;
  reason?: string | null;
  transferred_at?: string | null;
  createdAt?: string | null;
  fees?: number | string | null;
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64(value: string, field: string): Uint8Array {
  try {
    const normalized = value.trim().replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new Error(`Invalid server configuration: ${field}`);
  }
}

function cryptoBytes(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function activeEncryptionKeyVersion(): number {
  const raw = requiredEnv("PAYOUT_DESTINATION_ENCRYPTION_KEY_VERSION").trim();
  if (!/^[1-9]\d{0,5}$/u.test(raw)) {
    throw new Error("PAYOUT_DESTINATION_ENCRYPTION_KEY_VERSION must be a positive integer.");
  }
  return Number(raw);
}

async function encryptionKey(keyVersion: number): Promise<CryptoKey> {
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new Error("Payout destination encryption key version is invalid.");
  }
  const keyName = `PAYOUT_DESTINATION_ENCRYPTION_KEY_V${keyVersion}`;
  const bytes = fromBase64(requiredEnv(keyName), keyName);
  if (bytes.length !== 32)
    throw new Error(`${keyName} must be a base64 256-bit key.`);
  return crypto.subtle.importKey("raw", cryptoBytes(bytes), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function fingerprintKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(requiredEnv("PAYOUT_DESTINATION_FINGERPRINT_KEY")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export function requiredNigerianAccountNumber(value: unknown): string {
  const normalized = typeof value === "string" ? value.replace(/\s+/gu, "") : "";
  if (!/^\d{10}$/u.test(normalized))
    throw new HttpError(400, "INVALID_ACCOUNT_NUMBER", "Enter a valid 10-digit Nigerian account number.");
  return normalized;
}

export function requiredBankCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9A-Za-z_-]{2,32}$/u.test(code))
    throw new HttpError(400, "INVALID_BANK", "Choose a valid Nigerian bank.");
  return code;
}

export function maskAccountNumber(accountNumber: string): string {
  return `******${accountNumber.slice(-4)}`;
}

export async function preflightPayoutDestinationCrypto(): Promise<void> {
  const keyVersion = activeEncryptionKeyVersion();
  await Promise.all([encryptionKey(keyVersion), fingerprintKey()]);
}

export async function encryptPayoutAccountNumber(accountNumber: string): Promise<{
  ciphertext: string;
  iv: string;
  keyVersion: number;
}> {
  const keyVersion = activeEncryptionKeyVersion();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(keyVersion),
    encoder.encode(accountNumber),
  );
  return {
    ciphertext: base64Url(new Uint8Array(encrypted)),
    iv: base64Url(iv),
    keyVersion,
  };
}

export async function decryptPayoutAccountNumber(
  ciphertext: string,
  iv: string,
  keyVersion: number,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: cryptoBytes(fromBase64(iv, "payout destination IV")) },
    await encryptionKey(keyVersion),
    cryptoBytes(fromBase64(ciphertext, "payout destination ciphertext")),
  );
  const accountNumber = decoder.decode(plaintext);
  return requiredNigerianAccountNumber(accountNumber);
}

export async function payoutAccountFingerprint(
  bankCode: string,
  accountNumber: string,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await fingerprintKey(),
    encoder.encode(`${bankCode}:${accountNumber}`),
  );
  return base64Url(new Uint8Array(signature));
}

export async function listPaystackNigerianBanks(): Promise<PaystackPayoutBank[]> {
  const banks = new Map<string, PaystackPayoutBank>();
  // Paystack can return more than one page. Keep this bounded so a provider
  // pagination defect cannot turn a browser-facing request into an endless job.
  for (let page = 1; page <= 10; page += 1) {
    const batch = await paystackRequest<PaystackPayoutBank[]>(
      `/bank?currency=NGN&perPage=100&page=${page}`,
    );
    for (const bank of batch) {
      const name = typeof bank?.name === "string" ? bank.name.trim() : "";
      const code = typeof bank?.code === "string" ? bank.code.trim() : "";
      const country = typeof bank?.country === "string"
        ? bank.country.trim().toLowerCase()
        : "";
      const currency = typeof bank?.currency === "string"
        ? bank.currency.trim().toUpperCase()
        : "";
      if (
        name && code && bank.active !== false &&
        (!country || country === "nigeria") &&
        (!currency || currency === "NGN")
      ) banks.set(code, { ...bank, name, code });
    }
    if (batch.length < 100) break;
  }
  return [...banks.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "en-NG"),
  );
}

export async function resolvePaystackNigerianAccount(
  accountNumber: string,
  bankCode: string,
): Promise<PaystackResolvedAccount> {
  const query = new URLSearchParams({ account_number: accountNumber, bank_code: bankCode });
  const resolved = await paystackRequest<PaystackResolvedAccount>(`/bank/resolve?${query}`);
  if (
    resolved.account_number !== accountNumber ||
    typeof resolved.account_name !== "string" ||
    !resolved.account_name.trim()
  ) {
    throw new HttpError(409, "ACCOUNT_RESOLUTION_MISMATCH", "The bank could not verify this account.");
  }
  return { ...resolved, account_name: resolved.account_name.trim().slice(0, 160) };
}

export async function createPaystackTransferRecipient(input: {
  accountNumber: string;
  bankCode: string;
  accountName: string;
}): Promise<PaystackTransferRecipient> {
  const recipient = await paystackRequest<PaystackTransferRecipient>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: input.accountName,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "NGN",
    }),
  });
  if (
    typeof recipient.recipient_code !== "string" ||
    !recipient.recipient_code.trim() ||
    (typeof recipient.id !== "string" && typeof recipient.id !== "number")
  ) {
    throw new HttpError(
      502,
      "PAYOUT_PROVIDER_ERROR",
      "The payout provider did not return a recipient.",
    );
  }
  return recipient;
}

export async function listPaystackTransferRecipients(): Promise<
  PaystackTransferRecipient[]
> {
  const recipients: PaystackTransferRecipient[] = [];
  for (let page = 1; ; page += 1) {
    const batch = await paystackRequest<PaystackTransferRecipient[]>(
      `/transferrecipient?perPage=100&page=${page}`,
    );
    recipients.push(...batch);
    if (batch.length < 100) return recipients;
  }
}

export async function initiatePaystackTransfer(input: {
  recipientCode: string;
  amountKobo: number;
  reference: string;
}): Promise<PaystackTransfer> {
  return paystackRequest<PaystackTransfer>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: input.amountKobo,
      recipient: input.recipientCode,
      reference: input.reference,
      reason: "Examify Wallet payout",
      currency: "NGN",
    }),
  });
}

export async function verifyPaystackTransfer(reference: string): Promise<PaystackTransfer> {
  return paystackRequest<PaystackTransfer>(
    `/transfer/verify/${encodeURIComponent(reference)}`,
  );
}

export function sanitizedPaystackTransfer(transfer: PaystackTransfer): Record<string, unknown> {
  const fee = typeof transfer.fees === "number" && Number.isSafeInteger(transfer.fees) && transfer.fees >= 0
    ? transfer.fees
    : null;
  return {
    id: String(transfer.id),
    transfer_code: transfer.transfer_code,
    reference: transfer.reference,
    amount: transfer.amount,
    currency: transfer.currency,
    status: transfer.status,
    recipient_id: String(transfer.recipient),
    transferred_at: transfer.transferred_at ?? null,
    fee_kobo: fee,
  };
}
