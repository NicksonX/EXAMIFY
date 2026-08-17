# Examify

Examify is a React and Supabase study platform for WAEC, JAMB, NECO, Post-UTME, and university CBT practice. Students securely sign in with Google or Apple, choose a subject or course, study structured material, take timed exams, and review results.

## Stack

- React 18, TypeScript, Vite, Tailwind CSS
- Supabase Auth and PostgreSQL
- Google and Apple OAuth through Supabase PKCE
- Framer Motion and Lucide icons

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

The local application runs at `http://localhost:5173`.

Required browser environment variables:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

`VITE_*` values are bundled into the browser. Never place a Supabase service-role key, Google client secret, Apple private key (`.p8`), Apple client-secret JWT, Paystack secret key, or database password in a `VITE_*` variable.

## Database migrations

For a new database, apply migrations in order:

```text
0001_init.sql
0002_catalog.sql
0003_seed_samples.sql
0004_seed_catalog.sql
0005_complete_secondary_content.sql
0006_complete_university_content.sql
0007_harden_google_auth.sql
0008_billing_entitlements.sql
0009_secure_study_materials.sql
0010_wallet_foundation.sql
0011_wallet_paystack.sql
0012_withdrawals_referrals.sql
0013_admin_accounts.sql
0014_admin_review_queues.sql
0015_referral_qualification.sql
0016_withdrawal_provider_guard.sql
0017_wallet_topup_reversals.sql
0018_wallet_referral_hardening.sql
0019_fix_wallet_balance_rpc.sql
0020_secure_withdrawal_review.sql
0021_secure_wallet_settlement_execution.sql
0022_converge_withdrawal_and_wallet_security.sql
0023_financial_security_acl_convergence.sql
0024_wallet_paystack_reliability.sql
0025_wallet_reconciliation_and_deletion_safety.sql
0027_disable_withdrawals.sql
0028_paystack_nigerian_payouts.sql
0029_paystack_payout_terminal_state_safety.sql
0030_identity_terms_onboarding_and_payout_pin.sql
0031_pgcrypto_extension_search_path.sql
0032_fix_onboarding_avatar_key_pattern.sql
0033_checkout_recovery_and_payout_resolution.sql
0034_fix_legacy_withdrawal_retirement_lint.sql
0035_revoke_anonymous_open_checkout_access.sql
0036_checkout_reconciliation_and_payout_confirmation_pause.sql
0037_make_onboarding_completion_idempotent.sql
0038_manual_payout_requests.sql
0039_secondary_grade_taxonomy.sql
```

Recommended CLI flow:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

For a **new development database**, apply the complete ordered migration history. For an existing staging or production database, first inspect its migration history with `supabase migration list --linked`, create a restore point, then apply only pending forward migrations with `supabase db push --linked`. Never rerun `0003_seed_samples.sql`, `0005_complete_secondary_content.sql`, or `0006_complete_university_content.sql` against an existing environment: they contain legacy content-seeding/deletion behavior and are not a production deployment shortcut. Do not use `migration repair` merely to bypass a failed migration.

If using Supabase SQL Editor for a pending forward migration, run its complete file only after verifying that it is truly pending. Do not paste only part of a PostgreSQL `do $tag$ ... end $tag$;` block.

`0007_harden_google_auth.sql` creates and backfills protected profile rows from `auth.users`. Run it before opening authentication to users. Its profile metadata handling works for both Google and Apple, including Apple accounts that return a private-relay email or limited metadata.

`0008_billing_entitlements.sql` is the payment and exam-entitlement boundary. `0009_secure_study_materials.sql` must follow it before publishing paid study content: it removes direct browser reads of full lesson JSON and defaults all existing non-sample material to Pro until explicitly curated as Plus.

`0030_identity_terms_onboarding_and_payout_pin.sql` adds the current Terms version, mandatory Terms acceptance, a mandatory username/profile-photo onboarding gate, private `profile-avatars` Storage, and PIN-gated payout requests. **Do not apply it to production until a legal/business owner has approved the exact seeded Terms text, effective date, privacy/contact information, and suspension/liability provisions.** It deliberately does not treat existing users as having accepted Terms or completed their profile. Uploaded avatars are private and are delivered only through short-lived, authenticated signed URLs.

## Paystack prepaid passes

Examify uses Paystack Standard hosted checkout for prepaid, non-recurring access:

| Product | Price | Access |
| --- | ---: | --- |
| Free | ₦0 | One completed exam lifetime and sample material |
| Plus Monthly | ₦5,000 | Selected Plus lessons and 20 completed exams for 30 days |
| Plus Yearly | ₦50,000 | Plus access for 365 days; yearly pricing includes two months at no extra cost |
| Pro Monthly | ₦10,000 | All available lessons, unlimited completed exams, and result PDFs for 30 days |
| Pro Yearly | ₦100,000 | Pro access for 365 days; yearly pricing includes two months at no extra cost |

The browser submits only an allowed product identifier: `plus_monthly`, `plus_yearly`, `pro_monthly`, or `pro_yearly`. It never submits a trusted price, user ID, payment status, entitlement, or plan update. Access is activated only after a signed Paystack webhook **and** server-to-server transaction verification settle the internal payment intent. The payment-return page repeats verification for webhook/redirect races, but a callback URL by itself never grants access.

### Configure server secrets

Set secrets in the Supabase project that hosts the functions; never add them to `.env`, source code, or a `VITE_*` value:

```bash
supabase secrets set \
  PAYSTACK_SECRET_KEY=sk_test_REPLACE_ME \
  APP_URL=http://localhost:5173 \
  APP_ALLOWED_ORIGINS=http://localhost:5173
```

Use your HTTPS application origin for `APP_URL` and `APP_ALLOWED_ORIGINS` in staging/production. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to deployed Edge Functions by Supabase; do not copy the service-role key into the frontend.

For local browser testing, `APP_URL=http://localhost:5173` is the return address while Paystack’s Dashboard webhook remains the deployed Supabase `paystack-webhook` URL. Use an `sk_test_` key in the non-production project. A Paystack initialization rejection cannot be fixed by changing a browser price, CORS, or retrying: collect the safe Support ID, selected product, UTC time, and any `exf_` reference, then inspect the private function logs and `payment_intents` diagnostics before working with Paystack Dashboard/support. Never include a secret, hosted checkout URL, provider response body, or payment details in a ticket.

The private Wallet reconciler additionally needs an opaque scheduler secret. Generate and set it only in a trusted terminal; do not print, commit, or use it in browser code:

```bash
supabase secrets set WALLET_RECONCILIATION_SECRET="$(openssl rand -base64 48)"
```

Historic resolver-based Paystack payout recovery and the new manual withdrawal path share the server-only account-number encryption and fingerprint keys. Generate and store them only with Supabase secrets. `PAYOUT_DESTINATION_ENCRYPTION_KEY_V1` must be a base64-encoded 256-bit AES-GCM key. Keep every historical `..._V<version>` key available until all account data encrypted with it is retired or re-encrypted; set `PAYOUT_DESTINATION_ENCRYPTION_KEY_VERSION` only to a key version that is already deployed.

```bash
supabase secrets set \
  PAYOUT_DESTINATION_ENCRYPTION_KEY_VERSION=1 \
  PAYOUT_DESTINATION_ENCRYPTION_KEY_V1="$(openssl rand -base64 32)" \
  PAYOUT_DESTINATION_FINGERPRINT_KEY="$(openssl rand -base64 48)" \
  PAYSTACK_PAYOUT_DISPATCH_SECRET="$(openssl rand -base64 48)" \
  PAYSTACK_PAYOUT_RECONCILIATION_SECRET="$(openssl rand -base64 48)" \
  PAYSTACK_PAYOUT_DESTINATION_RECONCILIATION_SECRET="$(openssl rand -base64 48)"
```

`PAYSTACK_PAYOUT_AUTOMATED_TRANSFERS_APPROVED` is retained only for historic resolver-based `wdp_` recovery. Leave it absent or `false` unless that legacy recovery flow has separately passed its sandbox evidence.

The active manual payout dispatcher and reconciler each require an independent opaque scheduler secret. `MANUAL_PAYOUT_AUTOMATED_TRANSFERS_APPROVED` is an explicit release acknowledgement, not a secret. Leave both that value and the database flag `financial_config.provider_features.manual_payout_requests` disabled until the full staging matrix, finance-review process, scheduler authentication, transfer authorization requirements, and reconciliation evidence are approved. The dispatcher refuses to initiate a transfer unless the acknowledgement is exactly `true`.

```bash
supabase secrets set \
  MANUAL_PAYOUT_DISPATCH_SECRET="$(openssl rand -base64 48)" \
  MANUAL_PAYOUT_RECONCILIATION_SECRET="$(openssl rand -base64 48)" \
  MANUAL_PAYOUT_AUTOMATED_TRANSFERS_APPROVED=false
```

Invoke the private workers only from a trusted scheduler, never from a browser:

```text
POST /functions/v1/dispatch-approved-manual-payouts
x-manual-payout-dispatch-secret: <MANUAL_PAYOUT_DISPATCH_SECRET>

POST /functions/v1/reconcile-manual-payouts
x-manual-payout-reconciliation-secret: <MANUAL_PAYOUT_RECONCILIATION_SECRET>
```

Withdrawal PINs also require a versioned server-only HMAC pepper. Generate it only in a trusted terminal and retain every prior version while any PIN credential uses that version; rotating the active version without retaining its historical value prevents users from verifying existing PINs.

```bash
supabase secrets set \
  WITHDRAWAL_PIN_PEPPER_VERSION=1 \
  WITHDRAWAL_PIN_PEPPER_V1="$(openssl rand -base64 48)"
```

Do not put any of these values in `.env`, logs, tickets, browser code, or `VITE_*` variables.

### Deploy functions and register Paystack URLs

After applying migrations, deploy each function:

```bash
supabase functions deploy create-checkout
supabase functions deploy paystack-webhook --no-verify-jwt
supabase functions deploy verify-payment-return
supabase functions deploy resume-payment-checkout
supabase functions deploy get-study-material
supabase functions deploy download-result-pdf
supabase functions deploy create-wallet-topup
supabase functions deploy verify-wallet-topup-return
supabase functions deploy wallet-paystack-webhook --no-verify-jwt
supabase functions deploy reconcile-wallet-topups --no-verify-jwt
supabase functions deploy list-paystack-payout-banks
supabase functions deploy resolve-paystack-payout-destination
supabase functions deploy confirm-paystack-payout-destination
supabase functions deploy paystack-payout-webhook --no-verify-jwt
supabase functions deploy dispatch-approved-paystack-payouts --no-verify-jwt
supabase functions deploy reconcile-paystack-payouts --no-verify-jwt
supabase functions deploy reconcile-paystack-payout-destinations --no-verify-jwt
# Legacy resolver-based payout functions above remain deployed only to recover non-terminal wdp_ records.
supabase functions deploy request-manual-payout
supabase functions deploy dispatch-approved-manual-payouts --no-verify-jwt
supabase functions deploy reconcile-manual-payouts --no-verify-jwt
supabase functions deploy get-account-state
supabase functions deploy complete-onboarding-profile
supabase functions deploy get-withdrawal-pin-status
supabase functions deploy set-withdrawal-pin
# Historic request endpoint retained only for non-terminal wdp_ recovery; new withdrawals use request-manual-payout.
supabase functions deploy request-paystack-payout
supabase functions deploy request-account-deletion
supabase functions deploy download-study-material-pdf
```

In **Paystack Dashboard → Settings → API Keys & Webhooks**, set the webhook URL to:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/paystack-webhook
```

Paystack sends the signed webhook to this address. The hosted checkout callback is created server-side as `APP_URL/billing/return?reference=…`; ensure the deployed host rewrites that route to `index.html` and is allowed in Supabase Auth redirect URLs if authentication can be resumed there.

### Test before enabling live payments

1. Use **Paystack test** credentials only and complete one hosted checkout for Plus and Pro.
2. Confirm a `payment_intents` row is initialized, then a verified `payments` row and `entitlements` row appear after the signed webhook or return verification.
3. Confirm Free remains limited to one completed exam, Plus stops at 20 completed exams in its active pass, and Pro remains unlimited.
4. Confirm a direct REST request cannot read `study_materials.content`, a locked lesson URL receives no content, and a Pro account receives a server-generated PDF.
5. Test cancelled, failed, altered amount/reference, wrong-user return, duplicate webhook, invalid signature, and callback/webhook race paths. None may grant access.
6. Only then replace the test secret in Supabase secrets with the live secret and complete a controlled live transaction.

Refunds, chargebacks, and disputes require an owner/support settlement procedure before launch. Do not manually edit `profiles.plan_slug`; it is a display cache, not payment proof.

## Wallet, referrals, and financial administration

Wallet operations are isolated from Plus/Pro billing. Wallet balances are derived from immutable NGN/kobo double-entry ledger entries and active withdrawal holds; neither the browser nor an administrator can directly edit a learner balance.

- Paystack wallet funding starts in `create-wallet-topup`, uses references beginning with `wlt_`, and settles only through the wallet-specific handler or the authenticated return verifier after Paystack server verification. Signed refunds are reconciled using their exact provider-confirmed amount; dispute notifications freeze the affected wallet for review and do not themselves create a full reversal.
- Paystack accepts one integration webhook URL. Keep the existing configured endpoint:

  ```text
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/paystack-webhook
  ```

  The endpoint preserves the established Plus/Pro settlement behavior, securely dispatches references beginning with `wlt_` to the isolated Wallet handler, and forwards only `transfer.*` events for historic `wdp_` payout references to the isolated payout handler. Manual `mwd_` withdrawal finality is deliberately obtained by the private dispatcher/reconciler through an independent Paystack transfer retrieval; do not treat this webhook as its settlement path unless dedicated signed-event routing has been implemented and staging-proven. Deploy the isolated handlers alongside it, but do **not** replace the configured Paystack webhook URL, reuse plan-payment references, or send Paystack directly to a Wallet/payout-specific endpoint.

- `0021_secure_wallet_settlement_execution.sql` and `0022_converge_withdrawal_and_wallet_security.sql` enforce that only the server-side `service_role` can call Wallet settlement. `0023_financial_security_acl_convergence.sql` removes PostgreSQL's default `PUBLIC EXECUTE` access from financial/account `SECURITY DEFINER` routines. Browser roles must never receive access to settlement, reversal, dispute, tombstoning, or ledger-posting routines. If a deployment was interrupted while applying `0020`, apply the complete replay-safe migration before `0022`; do not mark a partial migration as applied or manually edit a Wallet balance.
- `0024_wallet_paystack_reliability.sql` permits exactly one open Wallet Paystack intent per learner/provider, treats ambiguous checkout failures as `reconciling`, binds provider transaction IDs to one intent, and leases webhook processing. It intentionally fails before creating its unique index when legacy duplicate open intents exist: reconcile those references with Paystack first, then rerun the complete migration.
- `0025_wallet_reconciliation_and_deletion_safety.sql` rotates and leases intent recovery without an age cutoff, separates retry-exhausted provider events into a dead-letter backlog, blocks account deletion during `reconciling`, and records—not credits—any provider-confirmed late success against an inactive or tombstoned Wallet. Such exceptions require controlled refund/support resolution; do not reactivate an account or edit balances to clear one.
- `reconcile-wallet-topups` is a private scheduled worker, not a Paystack webhook. Set a high-entropy server-only `WALLET_RECONCILIATION_SECRET`, deploy the function, and invoke it from a trusted scheduler using only the `x-wallet-reconciliation-secret` header. It pages through unresolved Wallet intents regardless of age, performs a separate terminal recovery scan, reclaims expired webhook leases, and emits a dead-letter backlog signal for retry-exhausted events. It never accepts browser input or posts ledger entries directly.
- `0027_disable_withdrawals.sql` remains the shutdown boundary for historic Flutterwave withdrawal records. It rejects legacy withdrawal creation and approval before a Wallet hold, request, or ledger entry can be written. A finance administrator may use `retire_unsubmitted_withdrawal` only for a legacy `requested`, `under_review`, or `approved` request after confirming no provider transfer was submitted; it releases its active hold exactly once and writes an audit record. `processing` requests or requests with provider evidence require provider-confirmed reconciliation. Do not manually edit a balance, hold, provider mapping, or ledger row.
- `0028_paystack_nigerian_payouts.sql` and its resolver-based `wdp_` transfer workflow are historic recovery infrastructure. Keep its provider feature disabled and retain its functions/webhook routing only until every non-terminal historic `wdp_` record has been reconciled. Do not use it for new learner withdrawals. Do not repurpose `provider_features.paystack_wallet`; that flag controls incoming Wallet funding only.
- `0038_manual_payout_requests.sql` is the active learner withdrawal model. The learner selects a controlled Nigerian bank, enters a ten-digit account number and the holder name exactly as displayed by their bank, double-checks the preview, enters their transaction PIN, and submits the request for manual finance review. **No automatic account-name resolution or provider name verification occurs during intake.** The holder name is permanently labelled `learner_entered`, not provider-verified.
- The request creates an active Wallet hold, not a debit. A finance administrator may claim, reject with a learner-visible reason, or approve it for private processing; an administrator browser action cannot create a recipient, transfer money, settle a transfer, alter the ledger, or mark it paid. Only the private dispatcher may create a Paystack recipient and transfer after approval. It independently retrieves provider state before settlement: verified success posts exactly one immutable `withdrawal_paid` debit, documented pre-settlement failure releases exactly one hold, a verified post-payment reversal posts exactly one `withdrawal_release` credit, and any unknown/ambiguous result remains held as `reconciliation_required` without resend, release, or debit.
- Account numbers are encrypted with a server-only versioned key and deduplicated with a keyed fingerprint. Browser and finance-admin projections expose only the selected bank, learner-entered holder name, and masked account number; they never expose the raw number, ciphertext, encryption metadata, Paystack recipient codes, transfer references, PIN proofs, or raw provider payloads.
- Referral attribution is allowed once for a new account, with self-referral, repeated attribution, and matching hashed installation/device/network risk signals blocked or flagged. The ₦300 inviter reward remains non-spendable until qualification, the reversal window, an explicit learner transfer request, and finance-admin approval.
- Financial admin roles are assigned only in `app_roles` by a trusted operator. Never add admin roles in user metadata or frontend code. The admin UI has no email-editing, account-deletion, or arbitrary-balance-editing controls.
- Account deletion tombstones the profile and blocks future authentication while retaining restricted financial/audit records. Learners must first have zero wallet balance and no active holds, withdrawals, or top-ups.

### Manual payout release gate

Do not enable manual withdrawals merely because migration `0038` and its functions are deployed. Keep `financial_config.withdrawal_policy.withdrawals_enabled`, `financial_config.provider_features.manual_payout_requests`, and `MANUAL_PAYOUT_AUTOMATED_TRANSFERS_APPROVED` disabled until a trusted operator retains staging evidence for all of the following:

1. The learner path never calls account resolution: it accepts only a controlled bank, a ten-digit account number, and a learner-entered holder name; the warning and double-check acknowledgement appear before PIN submission; all browser projections remain masked and describe the name as unverified.
2. PIN failures and lockout, duplicate client request IDs, concurrent available-balance holds, cancellation, review-claim contention, rejection with reason, approval, and disabled-feature behavior. No browser or finance-admin action may create a Paystack recipient, transfer money, post a ledger entry, or mark a request paid.
3. Paystack sandbox recipient creation and transfer initiation after private approval, independent transfer retrieval, terminal-status handling, provider status finality, reversal behavior, and any required authorization/OTP flow. This implementation has no OTP-finalization route: if initiation can return `otp`, or Paystack requires merchant-approval callbacks, keep automated transfers disabled until a separately designed, sandbox-proven server-owned authorization flow exists.
4. Dispatch timeout, duplicate reference, transfer-ID/amount/currency mismatch, delayed provider success, terminal failure, post-payment reversal, worker retry, and retrieval failure. Each ambiguous result must remain held under its original `mwd_` reference as `reconciliation_required`; it must never be blindly resent, released, or marked paid.
5. Ledger/hold invariants: each paid request has exactly one independently verified provider transfer and one balanced debit for the approved amount; a pre-settlement failure releases exactly one hold and posts no learner debit; a paid reversal posts exactly one compensating Wallet credit; provider fees never reduce the learner’s approved amount.
6. Role/RLS verification in staging, secret-authenticated scheduler invocation, monitoring for stale/reconciliation-required records, backup/restore readiness, documented finance review process, an incident owner, and one controlled live transfer only after all sandbox cases pass.

Invoke `dispatch-approved-manual-payouts` only from a trusted scheduler with `x-manual-payout-dispatch-secret`; invoke `reconcile-manual-payouts` only with `x-manual-payout-reconciliation-secret`. Do not expose the endpoints or header values to the browser. The manual reconciler has no age cutoff for non-terminal transfers and continues to retrieve paid transfers for provider-confirmed reversals. Escalate ambiguous records; never alter Wallet balances, holds, payout requests, provider references, or ledger rows by hand. Historic `wdp_` dispatcher/reconciler/destination-reconciler functions remain separately deployed for recovery until their non-terminal records are resolved.

### Financial incident and release runbook

1. **Pause only the affected intake path first.** For incoming Wallet funding, set only the trusted `financial_config.provider_features.paystack_wallet` flag to `false`. For manual withdrawal intake, set `provider_features.manual_payout_requests` to `false`; if automated transfer dispatch must stop, also set `MANUAL_PAYOUT_AUTOMATED_TRANSFERS_APPROVED=false`. Keep the manual reconciler online for in-flight `mwd_` records. `provider_features.paystack_payouts` and its workers remain the separate historic `wdp_` recovery boundary. Do not disable reconciliation, delete events, or alter in-flight holds/references; Plus/Pro checkout remains independent.
2. **Capture evidence before changing schema or configuration.** Create a database restore point and record the affected `wlt_…`, `mwd_…`, or historic `wdp_…` reference, Wallet intent/payout request, provider event, provider transaction/transfer, ledger transaction, deployed function versions, function ACLs, and Paystack verification result. Never copy secrets, full provider payloads, raw bank account data, ciphertext, or recipient codes into tickets or chat.
3. **Treat Paystack's server verification as payment truth.** Verify the exact reference using a server-only function or Paystack dashboard/API. A successful charge must settle through `settle_verified_wallet_topup`; a manual payout transfer must settle only through `record_manual_payout_outcome`; a historic `wdp_` transfer must settle only through `record_verified_paystack_payout_outcome`; a refund/dispute must use its dedicated provider-confirmed routine. Never insert, update, or delete wallet balances, intent statuses, provider mappings, holds, or ledger rows by hand.
4. **Recover processing safely.** Inspect failed or reconciliation-required Wallet and payout records and run the corresponding private reconciler from a trusted scheduler or operator environment. A retry-exhausted event, provider transaction/transfer collision, metadata/amount/currency/recipient mismatch, provider success without a matching ledger entry, or ambiguous dispatch result is an escalation—not a manual credit, manual release, or resubmission case.
5. **Rehearse database repair in staging.** With migration-history drift, replay the complete affected migration against a staging clone, compare function definitions/RLS/ACLs to the repository, then apply only the pending forward migration. Do not mark migrations as applied merely to unblock `supabase db push`.
6. **Release Wallet funding or manual withdrawals only after controlled sandbox evidence.** For each flow, require exactly one approved provider transaction/transfer, one verified completion, and one balanced ledger transaction. Repeat Plus and Pro sandbox payments to prove the unchanged main webhook still settles subscriptions. For manual withdrawals, additionally prove the finance-review process, independent transfer retrieval, scheduler authentication, and reconciliation/reversal handling. Review backup/restore readiness, secret rotation, alerting, and the frontend bundle warning before opening either flow to real users.

Run `npm run check:financial-guardrails` in every change set and `npm run audit:production` with a working npm registry before release. CI also runs both checks; a failed audit or migration/reconciliation check blocks release until investigated.

## OAuth configuration

Examify uses Supabase's PKCE OAuth flow. The browser redirects to `/auth/callback`, and the Supabase client automatically completes the exchange. Do **not** add a manual `exchangeCodeForSession` call.

### 1. Configure Supabase URLs

In **Supabase Dashboard -> Authentication -> URL Configuration**:

```text
Site URL:       http://localhost:5173
Redirect URL:   http://localhost:5173/auth/callback
```

The browser callback is not the callback configured in Google Cloud or Apple Developer. Both upstream providers redirect to Supabase first:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

### 2. Configure Google

In **Google Cloud Console -> APIs & Services -> Credentials**, configure the OAuth 2.0 Web Client:

```text
Authorized JavaScript origin:
http://localhost:5173

Authorized redirect URI:
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Then enable **Google** in **Supabase Dashboard -> Authentication -> Providers -> Google** and paste the Google OAuth client ID and client secret there. The client secret must remain in Google/Supabase configuration, never in the Vite app.

### 3. Configure Apple

Apple sign-in requires an Apple Developer Program account and a Services ID configured for web OAuth.

1. Create or enable an **App ID** with _Sign in with Apple_.
2. Create a **Services ID** for the web client and associate it with that App ID.
3. In the Services ID web configuration, add the return URL exactly:

   ```text
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```

   Add the associated Supabase domain as required by Apple.

4. Create a **Sign in with Apple key**, record its Key ID, Team ID, and download the `.p8` private key once.
5. Generate an Apple client-secret JWT with the Team ID as issuer, the Services ID as subject/client ID, the Key ID in the JWT header, and Apple's audience (`https://appleid.apple.com`).
6. Enable **Apple** in **Supabase Dashboard -> Authentication -> Providers -> Apple**, then enter the Services ID, Team ID, Key ID, and generated client-secret JWT.

Treat the `.p8` file and client-secret JWT as production secrets. Keep them in a controlled secret manager, assign an owner, and rotate/regenerate the JWT before it expires. Never commit either file or pass them to the browser.

Apple may only provide a name on the first authorization and may provide a private relay email. Test first and repeat Apple login with a real Apple account; do not assume that matching Google and Apple email addresses automatically link identities.

### Production setup

When a production domain is available, add it alongside localhost:

```text
Supabase Site URL:       https://app.example.com
Supabase Redirect URL:   https://app.example.com/auth/callback
Google JS origin:        https://app.example.com
```

Keep the upstream Google and Apple return URL set to the Supabase callback for that environment:

```text
https://YOUR_PRODUCTION_PROJECT_REF.supabase.co/auth/v1/callback
```

Because this is a React BrowserRouter app, the production host must rewrite direct requests such as `/auth/callback`, `/billing/return`, `/wallet/return`, `/dashboard`, `/study/...`, `/terms`, `/terms/accept`, `/onboarding`, and `/help` to `index.html` while preserving query strings. Do not rewrite static assets, Supabase endpoints, or Paystack endpoints. A fresh direct request to `/wallet/return?reference=wlt_…` must render the Examify return-status page rather than a host 404 or blank document.

## OAuth troubleshooting

| Symptom                                    | Fix                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch` from Google        | Add `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` exactly in Google Cloud.                |
| Apple rejects the return URL               | Add the exact Supabase callback to the Services ID web configuration.                               |
| Supabase rejects the browser redirect      | Add `http://localhost:5173/auth/callback` exactly to Supabase Redirect URLs.                        |
| A provider button cannot open its provider | Confirm that provider is enabled in Supabase and its credentials/Apple JWT are current.             |
| Callback never completes                   | Check Supabase Auth logs and verify the Site URL and browser callback match the running app origin. |
| Page is blank on startup                   | Confirm `.env` exists and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` have real values.          |

## Quality checks

```bash
npm run lint
npm run build
```

Manual checks should include phone and desktop layouts, a protected deep link, Google and Apple cancellation paths, sign-out, a timed exam, a lesson page, and a result page. Test Apple on Safari/iOS before releasing it to students.
