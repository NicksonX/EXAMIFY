import { describe, expect, it } from "vitest";
import adminSource from "./Admin.tsx?raw";
import billingReturnSource from "./BillingReturn.tsx?raw";
import helpSource from "./Help.tsx?raw";
import landingSource from "./Landing.tsx?raw";
import referralsSource from "./Referrals.tsx?raw";
import upgradeSource from "./Upgrade.tsx?raw";
import walletSource from "./Wallet.tsx?raw";
import walletReturnSource from "./WalletReturn.tsx?raw";

const browserSources = [
  adminSource,
  billingReturnSource,
  helpSource,
  landingSource,
  referralsSource,
  upgradeSource,
  walletReturnSource,
  walletSource,
];

const prohibitedCustomerCopy = [
  /paystack/i,
  /administrator/i,
  /admin review/i,
  /finance review/i,
  /provider[- ]verified/i,
  /provider verification/i,
  /account holder name before you continue/i,
];

function quotedText(source: string): string[] {
  return source.match(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/gs) ?? [];
}

describe("browser financial copy", () => {
  it("does not expose payment-provider or internal review wording", () => {
    for (const source of browserSources) {
      const literals = quotedText(source).join("\n");
      for (const pattern of prohibitedCustomerCopy) {
        expect(literals).not.toMatch(pattern);
      }
    }
  });
});
