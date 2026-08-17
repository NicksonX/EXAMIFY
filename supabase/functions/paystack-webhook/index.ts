import {
  errorResponse,
  HttpError,
  parseProviderTimestamp,
  requiredEnv,
  sanitizedProviderData,
  serviceClient,
  sha512HmacHex,
  timingSafeEqualHex,
  verifyPaystackTransaction,
} from "../_shared/security.ts";

type PaystackWebhookPayload = {
  event?: unknown;
  data?: {
    id?: unknown;
    reference?: unknown;
    transaction_reference?: unknown;
    transaction?: { id?: unknown; reference?: unknown };
  };
};

Deno.serve(async (request) => {
  let eventId: string | null = null;
  let admin: ReturnType<typeof serviceClient> | null = null;
  try {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const signature = request.headers.get("x-paystack-signature")?.trim().toLowerCase() ?? "";
    const rawBody = await request.arrayBuffer();
    const expectedSignature = await sha512HmacHex(rawBody, requiredEnv("PAYSTACK_SECRET_KEY"));
    if (!timingSafeEqualHex(signature, expectedSignature)) {
      console.warn("Rejected Paystack webhook with invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }

    let payload: PaystackWebhookPayload;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody)) as PaystackWebhookPayload;
    } catch {
      return new Response("Invalid payload", { status: 400 });
    }
    const eventType = typeof payload.event === "string" ? payload.event : "";
    const transactionId = payload.data?.transaction?.id ?? payload.data?.id;
    const reference = payload.data?.transaction?.reference
      ?? payload.data?.transaction_reference
      ?? payload.data?.reference;

    // Paystack accepts one integration webhook URL. Keep the established plan
    // endpoint as that URL and dispatch wallet-only references to the isolated
    // wallet handler without changing any plan intent or entitlement behavior.
    if (typeof reference === "string" && reference.startsWith("wlt_")) {
      const walletResponse = await fetch(
        `${requiredEnv("SUPABASE_URL")}/functions/v1/wallet-paystack-webhook`,
        {
          method: "POST",
          headers: {
            "content-type": request.headers.get("content-type") ?? "application/json",
            "x-paystack-signature": signature,
          },
          body: rawBody,
        },
      );
      return new Response(await walletResponse.text(), {
        status: walletResponse.status,
        headers: { "content-type": walletResponse.headers.get("content-type") ?? "text/plain; charset=utf-8" },
      });
    }

    // Outgoing transfers retain the existing Paystack Dashboard ingress. The
    // isolated handler verifies the same raw signature again before touching a
    // payout event; it cannot affect subscription or Wallet-top-up logic.
    if (
      typeof reference === "string" &&
      reference.startsWith("wdp_") &&
      eventType.startsWith("transfer.")
    ) {
      const payoutResponse = await fetch(
        `${requiredEnv("SUPABASE_URL")}/functions/v1/paystack-payout-webhook`,
        {
          method: "POST",
          headers: {
            "content-type": request.headers.get("content-type") ?? "application/json",
            "x-paystack-signature": signature,
          },
          body: rawBody,
        },
      );
      return new Response(await payoutResponse.text(), {
        status: payoutResponse.status,
        headers: { "content-type": payoutResponse.headers.get("content-type") ?? "text/plain; charset=utf-8" },
      });
    }

    if (!eventType || (typeof transactionId !== "number" && typeof transactionId !== "string") || typeof reference !== "string") {
      return new Response("Incomplete payload", { status: 400 });
    }

    eventId = `${eventType}:${String(transactionId)}`;
    admin = serviceClient();
    const { error: eventError } = await admin.from("payment_webhook_events").insert({
      provider: "paystack",
      event_key: eventId,
      event_type: eventType,
      provider_reference: reference,
      signature_valid: true,
      payload,
    });
    if (eventError?.code === "23505") {
      const { data: priorEvent, error: priorEventError } = await admin
        .from("payment_webhook_events")
        .select("outcome")
        .eq("event_key", eventId)
        .single();
      if (priorEventError) throw priorEventError;
      if (["settled", "reversed", "reversal_ignored", "ignored_event", "verification_failed", "intent_mismatch", "settlement_rejected"].includes(priorEvent.outcome ?? "")) {
        return new Response("Already processed", { status: 200 });
      }
    } else if (eventError) {
      throw eventError;
    }

    const reversalStatus = eventType === "refund.processed"
      ? "refunded"
      : eventType.startsWith("charge.dispute.")
        ? "disputed"
        : null;
    if (reversalStatus) {
      const { error: reversalError } = await admin.rpc("revoke_paystack_payment_entitlement", {
        p_reference: reference,
        p_payment_status: reversalStatus,
      });
      const postgresCode = reversalError?.code ?? "";
      if (reversalError && postgresCode !== "42501") throw reversalError;
      await admin.from("payment_webhook_events").update({
        processed_at: new Date().toISOString(),
        outcome: reversalError ? "reversal_ignored" : "reversed",
      }).eq("event_key", eventId);
      return new Response(reversalError ? "Unknown payment" : "Reversed", { status: 200 });
    }

    if (eventType !== "charge.success") {
      await admin.from("payment_webhook_events").update({ processed_at: new Date().toISOString(), outcome: "ignored_event" }).eq("event_key", eventId);
      return new Response("Ignored", { status: 200 });
    }

    const transaction = await verifyPaystackTransaction(reference);
    if (transaction.status !== "success" || transaction.reference !== reference || String(transaction.id) !== String(transactionId)) {
      await admin.from("payment_webhook_events").update({ processed_at: new Date().toISOString(), outcome: "verification_failed" }).eq("event_key", eventId);
      return new Response("Verification failed", { status: 200 });
    }

    const { data: intent, error: intentError } = await admin
      .from("payment_intents")
      .select("id, user_id, plan_slug, product_slug, plan_tier, access_days")
      .eq("provider", "paystack")
      .eq("provider_reference", reference)
      .maybeSingle();
    if (intentError) throw intentError;
    const metadata = transaction.metadata ?? {};
    const baseMetadataMatches =
      !!intent &&
      metadata.intent_id === intent.id &&
      metadata.user_id === intent.user_id &&
      metadata.plan_slug === intent.plan_slug;
    const isLegacyIntent =
      !!intent &&
      intent.product_slug === intent.plan_slug &&
      (intent.plan_slug === "plus" || intent.plan_slug === "pro");
    const metadataMatches = baseMetadataMatches && (
      isLegacyIntent || (
        metadata.product_slug === intent?.product_slug &&
        metadata.plan_tier === intent?.plan_tier &&
        metadata.access_days === String(intent?.access_days)
      )
    );
    if (!metadataMatches) {
      await admin.from("payment_webhook_events").update({ processed_at: new Date().toISOString(), outcome: "intent_mismatch" }).eq("event_key", eventId);
      return new Response("Intent mismatch", { status: 200 });
    }

    try {
      const { error: settleError } = await admin.rpc("settle_verified_paystack_payment", {
        p_reference: reference,
        p_transaction_id: String(transaction.id),
        p_amount_kobo: transaction.amount,
        p_currency: transaction.currency,
        p_paid_at: parseProviderTimestamp(transaction.paid_at),
        p_provider_data: sanitizedProviderData(transaction),
      });
      if (settleError) throw settleError;
      await admin.from("payment_webhook_events").update({ processed_at: new Date().toISOString(), outcome: "settled" }).eq("event_key", eventId);
      return new Response("Settled", { status: 200 });
    } catch (error) {
      const postgresCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      console.error("Verified Paystack transaction could not settle", error instanceof Error ? error.message : "unknown error");
      if (postgresCode === "42501" || postgresCode === "23505") {
        await admin.from("payment_webhook_events").update({ processed_at: new Date().toISOString(), outcome: "settlement_rejected" }).eq("event_key", eventId);
        return new Response("Settlement rejected", { status: 200 });
      }
      throw error;
    }
  } catch (error) {
    if (eventId && admin) {
      await admin.from("payment_webhook_events").update({ processed_at: new Date().toISOString(), outcome: "processing_error" }).eq("event_key", eventId);
    }
    return errorResponse(error);
  }
});
