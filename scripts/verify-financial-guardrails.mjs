import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const file = (path) => readFile(resolve(root, path), "utf8");
const failures = [];

function requireText(source, text, label) {
  if (!source.includes(text)) failures.push(label);
}

function forbidText(source, text, label) {
  if (source.includes(text)) failures.push(label);
}

const closedWalletFunctions = [
  "create-wallet-topup",
  "set-withdrawal-pin",
  "request-paystack-payout",
  "request-manual-payout",
  "resolve-paystack-payout-destination",
  "confirm-paystack-payout-destination",
  "get-withdrawal-pin-status",
  "list-paystack-payout-banks",
  "verify-wallet-topup-return",
];
const retiredWorkers = [
  "reconcile-paystack-payout-destinations",
];

const [
  productsMigration,
  retirementMigration,
  security,
  createCheckout,
  verifyPaymentReturn,
  paystackWebhook,
  walletReconciler,
  walletWebhook,
  payoutReconciler,
  payoutWebhook,
  manualPayoutReconciler,
  walletRetirement,
  walletPage,
  walletReturnPage,
  referralsPage,
  adminPage,
  adminClient,
  appShell,
  appRoutes,
  premium,
  upgrade,
  billingReturn,
  landing,
  ...functionSources
] = await Promise.all([
  file("supabase/migrations/0042_prepaid_subscription_products.sql"),
  file("supabase/migrations/0043_wallet_operational_retirement.sql"),
  file("supabase/functions/_shared/security.ts"),
  file("supabase/functions/create-checkout/index.ts"),
  file("supabase/functions/verify-payment-return/index.ts"),
  file("supabase/functions/paystack-webhook/index.ts"),
  file("supabase/functions/reconcile-wallet-topups/index.ts"),
  file("supabase/functions/wallet-paystack-webhook/index.ts"),
  file("supabase/functions/reconcile-paystack-payouts/index.ts"),
  file("supabase/functions/paystack-payout-webhook/index.ts"),
  file("supabase/functions/reconcile-manual-payouts/index.ts"),
  file("supabase/functions/_shared/wallet-retirement.ts"),
  file("src/pages/Wallet.tsx"),
  file("src/pages/WalletReturn.tsx"),
  file("src/pages/Referrals.tsx"),
  file("src/pages/Admin.tsx"),
  file("src/lib/admin.ts"),
  file("src/components/AppShell.tsx"),
  file("src/App.tsx"),
  file("src/lib/premium.ts"),
  file("src/pages/Upgrade.tsx"),
  file("src/pages/BillingReturn.tsx"),
  file("src/pages/Landing.tsx"),
  ...closedWalletFunctions.map((name) => file(`supabase/functions/${name}/index.ts`)),
  ...retiredWorkers.map((name) => file(`supabase/functions/${name}/index.ts`)),
]);

const closedFunctionSources = functionSources.slice(0, closedWalletFunctions.length);
const retiredWorkerSources = functionSources.slice(closedWalletFunctions.length);

for (const product of [
  "plus_monthly",
  "plus_yearly",
  "pro_monthly",
  "pro_yearly",
]) {
  requireText(productsMigration, product, `0042 must define ${product}`);
  requireText(security, `"${product}"`, `Checkout validation must allow ${product}`);
  requireText(premium, `"${product}"`, `Browser plan model must include ${product}`);
}
requireText(productsMigration, "access_days integer", "0042 must snapshot product access duration");
requireText(productsMigration, "make_interval(days => v_intent.access_days)", "Settlement must use the intent duration snapshot");
requireText(productsMigration, "product_slug text", "0042 must snapshot the purchased product");
requireText(createCheckout, "requiredPlanProduct", "Checkout must validate a product identifier");
requireText(createCheckout, "access_days: accessDays", "Checkout must persist server-loaded duration");
requireText(createCheckout, "amount_kobo: plan.price_kobo", "Checkout must persist server-loaded price");
requireText(createCheckout, "PAYMENT_INITIALIZATION_REJECTED", "Checkout must classify a definitive provider rejection");
requireText(createCheckout, "providerRejected ? \"failed\"", "Checkout must close a definitive provider rejection");
requireText(createCheckout, "status: \"reconciling\"", "Checkout must preserve ambiguous provider outcomes");
requireText(createCheckout, "checkout_request_id: requestId", "Checkout must persist a safe support correlation ID");
requireText(createCheckout, "const currency = \"NGN\"", "Checkout currency must be server-owned");
forbidText(createCheckout, "body.amount", "Checkout must not accept a browser-controlled amount");
forbidText(createCheckout, "body.accessDays", "Checkout must not accept a browser-controlled duration");
requireText(verifyPaymentReturn, "metadata.product_slug", "Return verification must bind the product metadata");
requireText(verifyPaymentReturn, "metadata.access_days", "Return verification must bind duration metadata");
requireText(paystackWebhook, "settle_verified_paystack_payment", "Main webhook must retain subscription settlement");
requireText(createCheckout, "exf_", "Subscription checkout references must use the exf_ prefix");
requireText(paystackWebhook, "reference.startsWith(\"wlt_\")", "Main webhook must retain legacy Wallet routing while reconciling");

requireText(retirementMigration, "wallet_operationally_retired", "0043 must audit the Wallet retirement");
requireText(retirementMigration, "'wallet_retirement'", "0043 must persist the retirement state");
requireText(retirementMigration, "'state', 'retired'", "0043 must mark Wallet state retired");
requireText(retirementMigration, "disable trigger on_examify_profile_wallet_created", "0043 must stop future Wallet provisioning");
requireText(retirementMigration, "disable trigger on_examify_profile_referral_created", "0043 must stop future referral provisioning");
requireText(retirementMigration, "resolve_referral_transfer_review", "0043 must revoke referral transfer approval");
requireText(retirementMigration, "claim_paystack_payout_dispatch", "0043 must revoke payout dispatch claims");
forbidText(retirementMigration.toLowerCase(), "drop table", "0043 must not delete financial tables");
forbidText(retirementMigration.toLowerCase(), "truncate", "0043 must not erase financial records");

requireText(security, "WALLET_RETIRED", "Wallet retirement must use a stable error code");
requireText(security, "410", "Wallet retirement must use HTTP 410");
for (let index = 0; index < closedWalletFunctions.length; index += 1) {
  const source = closedFunctionSources[index];
  requireText(source, "walletRetired()", `${closedWalletFunctions[index]} must fail closed`);
}
requireText(walletRetirement, "wallet_retirement", "Legacy reconciliation must read the retirement cutoff");
requireText(walletRetirement, "createdAt > cutoff", "Legacy reconciliation must reject post-cutoff records");
for (let index = 0; index < retiredWorkers.length; index += 1) {
  requireText(retiredWorkerSources[index], "status: 410", `${retiredWorkers[index]} must not create destinations`);
}
for (const source of [walletReconciler, walletWebhook]) {
  requireText(source, "requireLegacyWalletTopupReference", "Wallet reconciliation must permit only pre-cutoff records");
}
for (const source of [payoutReconciler, payoutWebhook]) {
  requireText(source, "requireLegacyPaystackPayoutReference", "Payout reconciliation must permit only pre-cutoff records");
}
requireText(manualPayoutReconciler, "requireLegacyManualPayoutReference", "Manual payout reconciliation must permit only pre-cutoff records");

forbidText(walletPage, "@/lib/wallet", "Wallet placeholder must not call Wallet browser APIs");
forbidText(walletPage, "createWallet", "Wallet placeholder must not create financial activity");
forbidText(walletReturnPage, "verifyWalletTopupReturn", "Wallet return must not settle payments in the browser");
requireText(referralsPage, "Navigate", "Referral route must safely redirect");
requireText(appShell, "comingSoon: true", "Wallet navigation must be marked coming soon");
forbidText(appShell, 'to: "/referrals"', "Referral navigation must be removed");
requireText(appRoutes, 'path="/referrals"', "Historical referral URLs must remain safe");
for (const forbiddenAction of [
  "claimManualPayoutReview",
  "claimPaystackPayoutReview",
  "reviewManualPayout",
  "reviewPaystackPayout",
  "reviewReferralTransfer",
  "resolve_manual_payout_review",
  "resolve_paystack_payout_review",
  "resolve_referral_transfer_review",
]) {
  forbidText(`${adminPage}\n${adminClient}`, forbiddenAction, `Admin browser code must not expose ${forbiddenAction}`);
}

requireText(upgrade, "There is no automatic renewal", "Upgrade page must describe prepaid passes accurately");
requireText(billingReturn, "accessDurationLabel", "Billing return must display actual pass duration");
requireText(landing, "there is no automatic renewal", "Landing must describe prepaid passes accurately");

if (failures.length) {
  console.error("Financial guardrail check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Financial guardrail check passed.");
