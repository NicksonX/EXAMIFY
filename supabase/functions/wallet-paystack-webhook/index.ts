import {
  errorResponse,
  HttpError,
  requiredEnv,
  serviceClient,
  sha512HmacHex,
  timingSafeEqualHex,
} from "../_shared/security.ts";
import { requireLegacyWalletTopupReference } from "../_shared/wallet-retirement.ts";
import { processVerifiedWalletPaystackEvent } from "../_shared/wallet-paystack.ts";

type PaystackWebhookPayload = {
  event?: unknown;
  data?: Record<string, unknown>;
};

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function completeEvent(
  admin: ReturnType<typeof serviceClient>,
  eventKey: string,
  leaseToken: string,
  processingStatus: "processed" | "ignored" | "failed",
  processingError?: string,
) {
  const { error } = await admin.rpc("complete_wallet_provider_event", {
    p_event_key: eventKey,
    p_lease_token: leaseToken,
    p_processing_status: processingStatus,
    p_processing_error: processingError ?? null,
  });
  if (error) throw error;
}

Deno.serve(async (request) => {
  let eventKey: string | null = null;
  let leaseToken: string | null = null;
  const admin = serviceClient();
  try {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const signature = request.headers.get("x-paystack-signature")?.trim().toLowerCase() ?? "";
    const rawBody = await request.arrayBuffer();
    const rawHash = await sha512HmacHex(rawBody, requiredEnv("PAYSTACK_SECRET_KEY"));
    if (!timingSafeEqualHex(signature, rawHash)) {
      console.warn("wallet_paystack_webhook_invalid_signature");
      return new Response("Invalid signature", { status: 401 });
    }

    let payload: PaystackWebhookPayload;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody)) as PaystackWebhookPayload;
    } catch {
      return new Response("Invalid payload", { status: 400 });
    }

    const eventType = textValue(payload.event);
    const data = payload.data ?? {};
    const nestedTransaction = data.transaction && typeof data.transaction === "object" && !Array.isArray(data.transaction)
      ? data.transaction as Record<string, unknown>
      : {};
    const reference = textValue(nestedTransaction.reference)
      ?? textValue(data.transaction_reference)
      ?? textValue(data.reference);
    const transactionId = nestedTransaction.id ?? data.transaction_id ?? data.id;
    const refundReference = textValue(data.refund_reference);
    const eventIdentity = eventType === "refund.processed"
      ? refundReference ?? textValue(data.id) ?? textValue(data.reference)
      : textValue(data.id) ?? textValue(transactionId) ?? reference;

    if (!eventType || !eventIdentity || !reference) return new Response("Incomplete payload", { status: 400 });
    try {
      await requireLegacyWalletTopupReference(admin, reference);
    } catch (error) {
      if (error instanceof HttpError && error.code === "WALLET_RETIRED") {
        return new Response("Ignored", { status: 200 });
      }
      throw error;
    }
    eventKey = `${eventType}:${eventIdentity}`;

    const { error: insertError } = await admin
      .from("wallet_provider_events")
      .insert({
        provider: "paystack",
        event_key: eventKey,
        event_type: eventType,
        provider_reference: reference,
        payload_hash: rawHash,
        payload,
      });
    if (insertError && insertError.code !== "23505") throw insertError;

    leaseToken = crypto.randomUUID();
    const { data: claimed, error: claimError } = await admin.rpc("claim_wallet_provider_event", {
      p_event_key: eventKey,
      p_lease_token: leaseToken,
      p_lease_seconds: 180,
    });
    if (claimError) throw claimError;

    if (claimed !== true) {
      const { data: existingEvent, error: existingError } = await admin
        .from("wallet_provider_events")
        .select("processing_status")
        .eq("event_key", eventKey)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existingEvent?.processing_status === "processed" || existingEvent?.processing_status === "ignored") {
        return new Response("Already processed", { status: 200 });
      }
      return new Response("Already processing", { status: 200 });
    }

    const result = await processVerifiedWalletPaystackEvent(admin, { eventType, reference, transactionId, data });
    await completeEvent(admin, eventKey, leaseToken, result.processingStatus, result.processingError);
    console.info("wallet_paystack_webhook_processed", { eventKey, eventType, reference, status: result.processingStatus });
    return new Response(result.message, { status: 200 });
  } catch (error) {
    if (eventKey && leaseToken) {
      try {
        await completeEvent(admin, eventKey, leaseToken, "failed", "Processing error");
      } catch (statusError) {
        console.error("wallet_paystack_webhook_failure_record_failed", { eventKey, message: statusError instanceof Error ? statusError.message : "unknown" });
      }
    }
    console.error("wallet_paystack_webhook_unhandled", { eventKey, message: error instanceof Error ? error.message : "unknown" });
    return errorResponse(error);
  }
});
