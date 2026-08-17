import {
  errorResponse,
  HttpError,
  requiredEnv,
  serviceClient,
  sha512HmacHex,
  timingSafeEqualHex,
} from "../_shared/security.ts";
import { recordVerifiedPaystackPayout } from "../_shared/paystack-payout-processing.ts";
import { requireLegacyPaystackPayoutReference } from "../_shared/wallet-retirement.ts";

type PaystackWebhookPayload = { event?: unknown; data?: Record<string, unknown> };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function payoutEventProjection(
  eventType: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    event: eventType,
    data: {
      id: text(data.id),
      transfer_code: text(data.transfer_code),
      reference: text(data.reference) ?? text(data.transfer_reference),
      status: text(data.status),
      amount: typeof data.amount === "number" && Number.isSafeInteger(data.amount)
        ? data.amount
        : null,
      currency: text(data.currency),
    },
  };
}

async function completeEvent(
  admin: ReturnType<typeof serviceClient>,
  eventKey: string,
  leaseToken: string,
  status: "processed" | "ignored" | "failed",
  error?: string,
) {
  const { error: completeError } = await admin.rpc(
    "complete_paystack_payout_provider_event",
    {
      p_event_key: eventKey,
      p_lease_token: leaseToken,
      p_processing_status: status,
      p_processing_error: error ?? null,
    },
  );
  if (completeError) throw completeError;
}

Deno.serve(async (request) => {
  let eventKey: string | null = null;
  let leaseToken: string | null = null;
  try {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const signature = request.headers.get("x-paystack-signature")?.trim().toLowerCase() ?? "";
    const rawBody = await request.arrayBuffer();
    const rawHash = await sha512HmacHex(rawBody, requiredEnv("PAYSTACK_SECRET_KEY"));
    if (!timingSafeEqualHex(signature, rawHash)) {
      console.warn("paystack_payout_webhook_invalid_signature");
      return new Response("Invalid signature", { status: 401 });
    }
    let payload: PaystackWebhookPayload;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody)) as PaystackWebhookPayload;
    } catch {
      return new Response("Invalid payload", { status: 400 });
    }
    const eventType = text(payload.event);
    const data = payload.data ?? {};
    const reference = text(data.reference) ?? text(data.transfer_reference);
    const eventIdentity = text(data.id) ?? text(data.transfer_code) ?? reference;
    if (!eventType || !eventIdentity || !reference || !reference.startsWith("wdp_"))
      return new Response("Ignored", { status: 200 });
    try {
      await requireLegacyPaystackPayoutReference(serviceClient(), reference);
    } catch (error) {
      if (error instanceof HttpError && error.code === "WALLET_RETIRED") {
        return new Response("Ignored", { status: 200 });
      }
      throw error;
    }

    eventKey = `${eventType}:${eventIdentity}`;
    const admin = serviceClient();
    const { error: insertError } = await admin.from("paystack_payout_provider_events").insert({
      event_key: eventKey,
      event_type: eventType,
      provider_reference: reference,
      payload_hash: rawHash,
      payload: payoutEventProjection(eventType, data),
    });
    if (insertError && insertError.code !== "23505") throw insertError;

    leaseToken = crypto.randomUUID();
    const { data: claimed, error: claimError } = await admin.rpc(
      "claim_paystack_payout_provider_event",
      { p_event_key: eventKey, p_lease_token: leaseToken, p_lease_seconds: 180 },
    );
    if (claimError) throw claimError;
    if (claimed !== true) return new Response("Already processing", { status: 200 });

    if (!eventType.startsWith("transfer.")) {
      await completeEvent(admin, eventKey, leaseToken, "ignored");
      return new Response("Ignored", { status: 200 });
    }
    try {
      const reconciliationLeaseToken = crypto.randomUUID();
      const { data: reconciliationClaimed, error: reconciliationClaimError } =
        await admin.rpc("claim_paystack_payout_reconciliation", {
          p_reference: reference,
          p_lease_token: reconciliationLeaseToken,
          p_lease_seconds: 180,
        });
      if (reconciliationClaimError) throw reconciliationClaimError;
      if (reconciliationClaimed !== true) {
        throw new Error("Paystack payout reconciliation lease was unavailable.");
      }
      await recordVerifiedPaystackPayout(
        admin,
        reference,
        reconciliationLeaseToken,
      );
      await completeEvent(admin, eventKey, leaseToken, "processed");
      return new Response("Processed", { status: 200 });
    } catch (error) {
      await completeEvent(admin, eventKey, leaseToken, "failed", "Provider verification deferred");
      return new Response("Deferred", { status: 200 });
    }
  } catch (error) {
    console.error("paystack_payout_webhook_unhandled", {
      eventKey,
      message: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(error);
  }
});
