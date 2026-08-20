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

## Database and confidential release artifacts

SQL migration bodies are intentionally ignored from GitHub. The public repository contains application code and release documentation only; the ordered SQL bundle is held in protected deployment storage. Do not reconstruct a missing migration from this README, force-add `*.sql`, or paste secrets into an issue, CI log, or frontend variable.

For a new development database, use the complete ordered migration bundle supplied through the private deployment channel. For an existing staging or production database:

1. Inspect the linked migration history with `supabase migration list --linked`.
2. Take the approved restore point and record the target project/ref.
3. Run the private bundle’s read-only preflight checks for open attempts, answer keys, historical results, avatar objects, entitlement state, and payment state.
4. Apply only pending, forward-compatible migrations in their recorded order. Never reset production or rerun legacy content-seeding migrations against an existing environment.
5. Verify RPC permissions, RLS, trial boundaries, answer-key secrecy, timeout finalization, and existing-record preservation before promoting.

The private release manifest must record the release ID, ordered filenames, SHA-256 hashes, approver, target environment, preflight evidence, apply timestamps, and post-apply checks. The confidential bundle currently includes the secure-attempt, optional-provider-avatar, objective-protocol-v2, exact-trial, trial-checkout-lock, source-backed university-directory, and objective-progress corrective changes. The latest assessment artifacts also harden attempt concurrency, immutable response/media ownership, strict grading, reviewer separation, audit events, continuation routes, and one-per-definition learning-reward eligibility. The additive assessment catalog/runtime, private media, academic-review, and learning-reward artifacts are staged behind published assessment definitions; they are not production-ready until they have passed an isolated/staging forward-only database test, media/RLS review, reviewer approval, and authenticated browser journeys.

The public GitHub quality workflow runs code-only checks: tests, lint, build, financial guardrails, and a production dependency audit. Migration reset/lint/integration checks belong in the protected deployment pipeline that receives the private SQL bundle explicitly; they must never run against production.

`0007_harden_google_auth.sql` supports both Google and Apple metadata, including Apple private-relay accounts and limited metadata. `0030_identity_terms_onboarding_and_payout_pin.sql` adds Terms acceptance, username/profile onboarding, private `profile-avatars` Storage, and PIN-gated payout requests; a legal/business owner must approve the exact seeded Terms and privacy text before production application. Existing users are not silently treated as having accepted Terms.

## Verified Nigerian university directory

The university selector lists only published, evidence-backed Nigerian university identities from the approved National Universities Commission (NUC) directory import. A directory entry means only that the institution identity was verified; it does **not** mean Examify has published that university’s programmes, faculties, departments, course outlines, lessons, or CBT questions.

Directory-only entries deliberately show an availability message instead of a course selector. The faculty → department → course path is shown only for a separately reviewed `catalogue_published` institution. Keep NUC source pages, retrieval timestamps, checksums, import batches, reviewer approval, and publication actions in the protected release channel—not in frontend code or public GitHub artifacts. The validated import remains hidden until an authorized reviewer invokes the service-role-only directory approval procedure after checking the private source manifest.

## Paystack prepaid passes

Examify uses Paystack Standard hosted checkout for prepaid, non-recurring access:

| Product | Price | Access |
| --- | ---: | --- |
| Free | ₦0 | One completed exam lifetime and sample material |
| Plus Monthly | ₦5,000 | Selected Plus lessons and 20 completed exams for 30 days |
| Plus Yearly | ₦50,000 | Plus access for 365 days; yearly pricing includes two months at no extra cost |
| Pro Monthly | ₦10,000 | All available lessons, unlimited completed exams, and result PDFs for 30 days |
| Pro Yearly | ₦100,000 | Pro access for 365 days; yearly pricing includes two months at no extra cost |

The browser submits only an allowed product identifier: `plus_monthly`, `plus_yearly`, `pro_monthly`, or `pro_yearly`. It never submits a trusted price, user ID, payment status, entitlement, or plan update. New checkout creation and hosted-checkout resume are unavailable until the exact 15-day trial expires according to database time; this is enforced by the server and payment-intent guard, not browser time. Access is activated only after a signed Paystack webhook **and** server-to-server transaction verification settle the internal payment intent. The payment-return page repeats verification for webhook/redirect races, but a callback URL by itself never grants access.

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

Wallet and payout operations are retired for new learner activity. Historic finance-only secrets and recovery workers, if any remain necessary for non-terminal records, belong exclusively in protected operational runbooks. They are not part of the application release path and must remain absent from browser configuration, source control, logs, tickets, and `VITE_*` values.

Do not put any of these values in `.env`, logs, tickets, browser code, or `VITE_*` variables.

### Deploy functions and register Paystack URLs

After the private migration bundle has passed staging validation, deploy the active learner functions to that staging project:

```bash
supabase functions deploy create-checkout
supabase functions deploy paystack-webhook --no-verify-jwt
supabase functions deploy verify-payment-return
supabase functions deploy resume-payment-checkout
supabase functions deploy get-study-material
supabase functions deploy download-study-material-pdf
supabase functions deploy download-result-pdf
supabase functions deploy get-account-state
supabase functions deploy complete-onboarding-profile
supabase functions deploy update-profile-avatar
supabase functions deploy request-account-deletion
# Only after the assessment migrations, private bucket, and reviewer controls
# pass staging validation:
supabase functions deploy assessment-media
```

Do not deploy or reactivate Wallet/payout intake functions as part of this learner release. Any historic recovery-only function remains subject to its own restricted runbook and reconciliation evidence.

In **Paystack Dashboard → Settings → API Keys & Webhooks**, set the webhook URL to:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/paystack-webhook
```

Paystack sends the signed webhook to this address. The hosted checkout callback is created server-side as `APP_URL/billing/return?reference=…`; ensure the deployed host rewrites that route to `index.html` and is allowed in Supabase Auth redirect URLs if authentication can be resumed there.

### Test before enabling live payments

1. Use **Paystack test** credentials only and complete one hosted checkout for Plus and Pro.
2. Confirm a `payment_intents` row is initialized, then a verified `payments` row and `entitlements` row appear after the signed webhook or return verification.
3. Confirm the exact 15-day trial is derived from account creation time, grants only the published trial capabilities, and new paid checkout creation/resume is rejected until the server-recorded trial expiry.
4. Confirm the post-trial Free limit, Plus completed-exam limit, Pro access, locked material access, and private PDFs are all checked by the server rather than the browser.
5. Test cancelled, failed, altered amount/reference, wrong-user return, duplicate webhook, invalid signature, callback/webhook race paths, and existing paid/trial transitions. None may grant access incorrectly.
6. Only then replace the test secret in Supabase secrets with the live secret and complete a controlled live transaction.

Refunds, chargebacks, and disputes require an owner/support settlement procedure before launch. Do not manually edit `profiles.plan_slug`; it is a display cache, not payment proof.

## Wallet and legacy financial records

Wallet funding, learner withdrawals, and referral cash operations are retired from the learner product. The `/wallet` route remains a non-financial coming-soon/retirement surface; it must not accept deposits, create payout requests, or imply that a transfer is available.

Existing Wallet, ledger, payout, referral, payment, and audit records are preserved for support, reconciliation, and legal/financial retention. Do not delete, reset, manually edit, or repurpose those records. Historic provider workers may remain deployed only when required to reconcile already-created non-terminal records, with server-only credentials and no new learner intake.

Plus/Pro prepaid checkout is independent of Wallet history and continues to settle only through the signed Paystack webhook plus server-side transaction verification. Keep the configured subscription webhook unchanged:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/paystack-webhook
```

Never put payment secrets, service-role keys, bank data, payout credentials, or scheduler headers in the browser. Any future reactivation of financial operations requires a separately approved product, legal, finance, provider, migration, and staging release gate; it is not enabled by this repository.

Run `npm run check:financial-guardrails` in every change set and `npm run audit:production` with a working npm registry before release.

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

## Release scope and quality checks

The currently releasable legacy assessment flow is objective CBT practice with server-owned deadlines, answer keys, progression, strict new-submission grading (A 90%, B 80%, C 70%, D 60%, E 50%), result history, study access, and private PDFs. Historical completed rows retain their original grades. The additive Main/mixed assessment path is gated behind published definitions and approved reviewer/media controls; no essay or video result is final until server-side review publishes it, and no perfect proctoring claim is made. Curriculum is limited to content that has actually been published and reviewed; the UI must not imply universal WAEC, JAMB, NECO, Post-UTME, or university coverage.

```bash
npm test -- --run
npm run lint
npm run build
npm run check:financial-guardrails
npm run audit:production
```

Before staging promotion, validate the private migration bundle forward-only against a non-production database, then run at least two authenticated accounts through OAuth cancellation/callback, Terms/onboarding with and without a provider avatar, dashboard/study/practice, refresh/resume, forward-only progression, timeout, results, trial expiry, paid checkout, and private-download paths at desktop and mobile widths. Do not call the product production-ready until provider configuration, database evidence, monitoring, rollback-by-disable controls, and legal/content approvals are recorded.
