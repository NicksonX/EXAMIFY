import {
  appUrl,
  corsHeaders,
  ensureTrialCheckoutAvailable,
  errorResponse,
  HttpError,
  initializePaystackTransaction,
  PaystackProviderError,
  optionsResponse,
  parseJsonBody,
  requiredPlanProduct,
  requireUser,
  serviceClient,
} from "../_shared/security.ts";

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  let headers: HeadersInit = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.", requestId);

    const user = await requireUser(request);
    if (!user.email) throw new HttpError(400, "MISSING_EMAIL", "Add an email address to your account before paying.", requestId);
    const body = await parseJsonBody(request);
    const productSlug = requiredPlanProduct(body.planSlug);
    const admin = serviceClient();
    await ensureTrialCheckoutAvailable(admin, user.id, requestId);

    const { data: plan, error: planError } = await admin
      .from("plans")
      .select("slug, name, price_kobo, tier, access_days, active")
      .eq("slug", productSlug)
      .eq("active", true)
      .maybeSingle();
    if (planError) throw planError;

    const planTier = plan?.tier === "plus" || plan?.tier === "pro" ? plan.tier : null;
    const accessDays = plan?.access_days === 30 || plan?.access_days === 365
      ? plan.access_days
      : null;
    const currency = "NGN";
    if (
      !plan ||
      !Number.isSafeInteger(plan.price_kobo) ||
      plan.price_kobo <= 0 ||
      !planTier ||
      !accessDays
    ) {
      throw new HttpError(409, "PLAN_UNAVAILABLE", "That pass is not currently available.", requestId);
    }

    const now = new Date().toISOString();
    const { error: expireError } = await admin
      .from("payment_intents")
      .update({ status: "expired", updated_at: now })
      .eq("user_id", user.id)
      .in("status", ["pending", "initialized", "reconciling"])
      .lte("expires_at", now);
    if (expireError) throw expireError;

    const { data: pendingIntent, error: pendingError } = await admin
      .from("payment_intents")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["pending", "initialized", "reconciling"])
      .gt("expires_at", now)
      .limit(1)
      .maybeSingle();
    if (pendingError) throw pendingError;
    if (pendingIntent) {
      throw new HttpError(409, "CHECKOUT_ALREADY_OPEN", "Finish or wait for your current checkout to expire before opening another one.", requestId);
    }

    const { data: currentEntitlement, error: entitlementError } = await admin
      .from("entitlements")
      .select("plan_slug")
      .eq("user_id", user.id)
      .eq("status", "active")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (entitlementError) throw entitlementError;
    if (currentEntitlement?.plan_slug === "pro" && planTier === "plus") {
      throw new HttpError(409, "DOWNGRADE_NOT_AVAILABLE", "Your active Pro pass already includes Plus access.", requestId);
    }

    const reference = `exf_${crypto.randomUUID().replaceAll("-", "")}`;
    const attemptedAt = new Date().toISOString();
    const { data: intent, error: intentError } = await admin
      .from("payment_intents")
      .insert({
        user_id: user.id,
        provider: "paystack",
        provider_reference: reference,
        // Payment intent fields are immutable checkout snapshots. Do not accept
        // money, tier, duration, or currency from the browser.
        plan_slug: planTier,
        product_slug: plan.slug,
        plan_tier: planTier,
        access_days: accessDays,
        plan_name: plan.name,
        amount_kobo: plan.price_kobo,
        currency,
        status: "pending",
        checkout_request_id: requestId,
        initialization_attempted_at: attemptedAt,
      })
      .select("id")
      .single();
    if (intentError || !intent) throw intentError ?? new Error("Payment intent creation failed.");

    const callbackUrl = `${appUrl()}/billing/return?reference=${encodeURIComponent(reference)}`;
    try {
      const checkout = await initializePaystackTransaction({
        email: user.email,
        amount: plan.price_kobo,
        reference,
        callbackUrl,
        metadata: {
          intent_id: intent.id,
          product_slug: plan.slug,
          plan_slug: planTier,
          plan_tier: planTier,
          access_days: String(accessDays),
          user_id: user.id,
        },
        requestId,
      });
      if (!checkout.authorization_url || checkout.reference !== reference) {
        throw new Error("Paystack returned an invalid checkout session.");
      }
      const { error: initializedError } = await admin
        .from("payment_intents")
        .update({
          status: "initialized",
          checkout_authorization_url: checkout.authorization_url,
          initialized_at: new Date().toISOString(),
          initialization_outcome: "initialized",
          provider_initialization_http_status: 200,
          updated_at: new Date().toISOString(),
        })
        .eq("id", intent.id)
        .eq("status", "pending");
      if (initializedError) throw initializedError;
      return Response.json({ authorizationUrl: checkout.authorization_url }, {
        headers: { ...headers, "x-request-id": requestId },
      });
    } catch (error) {
      const providerStatus = error instanceof PaystackProviderError ? error.providerStatus : null;
      const providerRejected = providerStatus !== null && providerStatus >= 400 && providerStatus < 500;
      const status = providerRejected ? "failed" : "reconciling";
      const outcome = providerRejected ? "provider_rejected" : "reconciling";
      const { data: finalizedIntent, error: finalizationError } = await admin
        .from("payment_intents")
        .update({
          status,
          initialization_outcome: outcome,
          provider_initialization_http_status: providerStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", intent.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (finalizationError || !finalizedIntent) {
        console.error("Checkout initialization finalization failed", {
          requestId,
          outcome,
          providerStatus,
        });
        await admin
          .from("payment_intents")
          .update({
            status: "reconciling",
            initialization_outcome: "persistence_recovery_required",
            provider_initialization_http_status: providerStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", intent.id)
          .eq("status", "pending");
        throw new HttpError(
          503,
          "PAYMENT_INITIALIZATION_RECONCILING",
          "We are checking whether checkout was created. Do not try again yet.",
          requestId,
        );
      }

      console.warn("Checkout initialization did not return a payment link", {
        requestId,
        outcome,
        providerStatus,
      });
      if (providerRejected) {
        throw new HttpError(
          422,
          "PAYMENT_INITIALIZATION_REJECTED",
          "We could not open Paystack checkout. No payment was started, so you can try again.",
          requestId,
        );
      }
      throw new HttpError(
        503,
        "PAYMENT_INITIALIZATION_RECONCILING",
        "We are checking whether checkout was created. Do not try again yet.",
        requestId,
      );
    }
  } catch (error) {
    return errorResponse(
      error,
      headers ?? { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      requestId,
    );
  }
});
