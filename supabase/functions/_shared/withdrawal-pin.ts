import { HttpError, requiredEnv } from "./security.ts";

const encoder = new TextEncoder();

export function requiredWithdrawalPin(value: unknown): string {
  const pin = typeof value === "string" ? value.trim() : "";
  if (!/^\d{6}$/u.test(pin)) {
    throw new HttpError(400, "INVALID_WITHDRAWAL_PIN", "Enter a valid six-digit withdrawal PIN.");
  }
  const digits = [...pin].map(Number);
  const repeated = new Set(digits).size === 1;
  const ascending = digits.every((digit, index) => index === 0 || digit === digits[index - 1] + 1);
  const descending = digits.every((digit, index) => index === 0 || digit === digits[index - 1] - 1);
  if (repeated || ascending || descending) {
    throw new HttpError(400, "WEAK_WITHDRAWAL_PIN", "Choose a less predictable six-digit withdrawal PIN.");
  }
  return pin;
}

export function activeWithdrawalPinPepperVersion(): number {
  const raw = requiredEnv("WITHDRAWAL_PIN_PEPPER_VERSION");
  if (!/^[1-9]\d{0,5}$/u.test(raw)) {
    throw new Error("WITHDRAWAL_PIN_PEPPER_VERSION must be a positive integer.");
  }
  return Number(raw);
}

export function preflightWithdrawalPinPepper(configuredPepperVersion: number): void {
  if (!Number.isSafeInteger(configuredPepperVersion) || configuredPepperVersion < 1) {
    throw new Error("Withdrawal PIN pepper version is invalid.");
  }
  requiredEnv(`WITHDRAWAL_PIN_PEPPER_V${configuredPepperVersion}`);
}

export async function withdrawalPinProof(
  userId: string,
  pin: string,
  configuredPepperVersion = activeWithdrawalPinPepperVersion(),
): Promise<{
  proof: string;
  pepperVersion: number;
}> {
  preflightWithdrawalPinPepper(configuredPepperVersion);
  const pepperVersion = configuredPepperVersion;
  const pepper = requiredEnv(`WITHDRAWAL_PIN_PEPPER_V${pepperVersion}`);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`examify-withdrawal-pin-v1:${userId}:${pin}`),
  );
  return {
    proof: Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    pepperVersion,
  };
}

export function payoutRequestError(message: string): HttpError {
  if (message.includes("INVALID_WHOLE_NAIRA_AMOUNT"))
    return new HttpError(400, "INVALID_WHOLE_NAIRA_AMOUNT", "Enter a whole-naira withdrawal amount.");
  if (message.includes("INVALID_AMOUNT"))
    return new HttpError(400, "INVALID_AMOUNT", "Enter a valid withdrawal amount.");
  if (message.includes("WITHDRAWAL_PIN_REQUIRED"))
    return new HttpError(409, "WITHDRAWAL_PIN_REQUIRED", "Set a withdrawal PIN before requesting a bank withdrawal.");
  if (message.includes("WITHDRAWAL_PIN_LOCKED"))
    return new HttpError(429, "WITHDRAWAL_PIN_LOCKED", "Too many incorrect PIN attempts. Try again later.");
  if (message.includes("INVALID_PIN"))
    return new HttpError(400, "INVALID_WITHDRAWAL_PIN", "The withdrawal PIN was incorrect.");
  if (message.includes("ACCOUNT_ONBOARDING_REQUIRED"))
    return new HttpError(409, "ACCOUNT_ONBOARDING_REQUIRED", "Complete your account setup before requesting a bank withdrawal.");
  if (message.includes("TERMS_ACCEPTANCE_REQUIRED"))
    return new HttpError(409, "TERMS_ACCEPTANCE_REQUIRED", "Accept the current Terms before requesting a bank withdrawal.");
  if (message.includes("PAYOUT_PROVIDER_NOT_ENABLED"))
    return new HttpError(409, "PAYOUT_PROVIDER_NOT_ENABLED", "Bank withdrawals are not available right now.");
  if (message.includes("WALLET_NOT_ACTIVE"))
    return new HttpError(409, "WALLET_NOT_ACTIVE", "Your Wallet is not available for withdrawals right now.");
  if (message.includes("WITHDRAWAL_BELOW_MINIMUM"))
    return new HttpError(400, "WITHDRAWAL_BELOW_MINIMUM", "The amount is below the minimum withdrawal.");
  if (message.includes("INVALID_MANUAL_PAYOUT_DETAILS"))
    return new HttpError(400, "INVALID_MANUAL_PAYOUT_DETAILS", "Enter the account-holder name and bank details exactly as they should be reviewed.");
  if (message.includes("INVALID_MANUAL_PAYOUT_BANK"))
    return new HttpError(400, "INVALID_MANUAL_PAYOUT_BANK", "Choose a bank from the Nigerian bank list.");
  if (message.includes("PAYOUT_DESTINATION_NOT_CONFIRMED"))
    return new HttpError(409, "PAYOUT_DESTINATION_NOT_CONFIRMED", "Confirm the verified bank account before continuing.");
  if (message.includes("INSUFFICIENT_AVAILABLE_BALANCE"))
    return new HttpError(409, "INSUFFICIENT_AVAILABLE_BALANCE", "Your available Wallet balance is not enough for this withdrawal.");
  if (message.includes("TOO_MANY_PENDING_WITHDRAWALS"))
    return new HttpError(409, "TOO_MANY_PENDING_WITHDRAWALS", "You already have the maximum number of pending withdrawals.");
  if (message.includes("MANUAL_PAYOUT_ACCOUNT_ALREADY_USED"))
    return new HttpError(409, "MANUAL_PAYOUT_ACCOUNT_ALREADY_USED", "You already have a withdrawal request for this bank account.");
  return new HttpError(503, "PAYOUT_REQUEST_UNCONFIRMED", "We could not confirm this withdrawal request. Check its status before trying again.");
}
