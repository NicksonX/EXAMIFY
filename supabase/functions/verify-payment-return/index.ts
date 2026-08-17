import {
  corsHeaders,
  errorResponse,
  HttpError,
  optionsResponse,
  parseJsonBody,
  parseProviderTimestamp,
  requiredReference,
  requireUser,
  sanitizedProviderData,
  serviceClient,
  verifyPaystackTransaction,
} from "../_shared/security.ts";

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");

    const user = await requireUser(request);
    const body = await parseJsonBody(request);
    const reference = requiredReference(body.reference);
    const admin = serviceClient();
    const { data: intent, error: intentError } = await admin
      .from("payment_intents")
      .select("id, user_id, plan_slug, product_slug, plan_tier, access_days, status")
      .eq("provider", "paystack")
      .eq("provider_reference", reference)
      .maybeSingle();
    if (intentError) throw intentError;
    if (!intent || intent.user_id !== user.id) throw new HttpError(404, "PAYMENT_NOT_FOUND", "We couldn't find that checkout for your account.");

    const transaction = await verifyPaystackTransaction(reference);
    const metadata = transaction.metadata ?? {};
    const baseMetadataMatches =
      metadata.intent_id === intent.id &&
      metadata.user_id === user.id &&
      metadata.plan_slug === intent.plan_slug;
    // Checkouts created before the product migration only have the tier in
    // Paystack metadata. Their migrated snapshots remain safe to settle. Every
    // new checkout must match its immutable product and access-duration values.
    const isLegacyIntent =
      intent.product_slug === intent.plan_slug &&
      (intent.plan_slug === "plus" || intent.plan_slug === "pro");
    const metadataMatches = baseMetadataMatches && (
      isLegacyIntent || (
        metadata.product_slug === intent.product_slug &&
        metadata.plan_tier === intent.plan_tier &&
        metadata.access_days === String(intent.access_days)
      )
    );
    if (transaction.status !== "success") {
      const terminal = ["failed", "abandoned", "reversed"].includes(transaction.status);
      if (terminal && intent.status !== "paid") {
        await admin.from("payment_intents").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", intent.id).in("status", ["pending", "initialized", "reconciling"]);
      }
      return Response.json({ status: terminal ? "failed" : "pending" }, { headers });
    }
    if (!metadataMatches || transaction.reference !== reference) {
      console.warn("Payment return metadata mismatch", { reference, intentId: intent.id });
      return Response.json({ status: "verification_failed" }, { headers });
    }

    const { data: settlement, error: settlementError } = await admin.rpc("settle_verified_paystack_payment", {
      p_reference: reference,
      p_transaction_id: String(transaction.id),
      p_amount_kobo: transaction.amount,
      p_currency: transaction.currency,
      p_paid_at: parseProviderTimestamp(transaction.paid_at),
      p_provider_data: sanitizedProviderData(transaction),
    });
    if (settlementError) {
      console.error("Payment return settlement rejected", { reference, code: settlementError.code });
      return Response.json({ status: "verification_failed" }, { headers });
    }
    const settled = settlement as {
      status?: string;
      plan?: string;
      product?: string;
      ends_at?: string;
    } | null;
    if (settled?.status !== "paid") return Response.json({ status: "pending" }, { headers });
    return Response.json({
      status: "paid",
      plan: settled.plan ?? intent.plan_tier,
      product: settled.product ?? intent.product_slug,
      accessDays: intent.access_days,
      endsAt: settled.ends_at ?? null,
    }, { headers });
  } catch (error) {
    return errorResponse(error, headers ?? { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  }
});
