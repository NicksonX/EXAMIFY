import {
  errorResponse,
  requiredEnv,
  serviceClient,
  timingSafeEqualText,
} from "../_shared/security.ts";
import { recordVerifiedPaystackPayout } from "../_shared/paystack-payout-processing.ts";
import { requireLegacyPaystackPayoutReference } from "../_shared/wallet-retirement.ts";

const PAGE_SIZE = 100;

type Attempt = { provider_reference: string };
type Event = { event_key: string; provider_reference: string };

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
  try {
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405 });
    if (!(await timingSafeEqualText(
      request.headers.get("x-paystack-payout-reconciliation-secret") ?? "",
      requiredEnv("PAYSTACK_PAYOUT_RECONCILIATION_SECRET"),
    ))) return new Response("Unauthorized", { status: 401 });

    const admin = serviceClient();
    const now = new Date().toISOString();
    const [attemptResult, eventResult, deadLetterResult] = await Promise.all([
      admin
        .from("paystack_payout_attempts")
        .select("provider_reference")
        .in("state", ["submitting", "processing", "reconciliation_required", "successful"])
        .order("last_reconciliation_attempt_at", { ascending: true, nullsFirst: true })
        .limit(PAGE_SIZE),
      admin
        .from("paystack_payout_provider_events")
        .select("event_key, provider_reference")
        .lt("attempt_count", 12)
        .in("processing_status", ["received", "failed", "processing"])
        .order("last_attempt_at", { ascending: true, nullsFirst: true })
        .limit(PAGE_SIZE),
      admin
        .from("paystack_payout_provider_events")
        .select("event_key", { count: "exact", head: true })
        .gte("attempt_count", 12),
    ]);
    if (attemptResult.error) throw attemptResult.error;
    if (eventResult.error) throw eventResult.error;
    if (deadLetterResult.error) throw deadLetterResult.error;
    const deadLetterEvents = deadLetterResult.count ?? 0;
    if (deadLetterEvents)
      console.error("paystack_payout_reconciler_dead_letter_backlog", { deadLetterEvents });

    const references = new Set<string>();
    for (const attempt of (attemptResult.data ?? []) as Attempt[])
      references.add(attempt.provider_reference);
    let settled = 0;
    let deferred = 0;
    for (const reference of references) {
      try {
        await requireLegacyPaystackPayoutReference(admin, reference);
      } catch {
        continue;
      }
      const { error: dispatchRecoveryError } = await admin.rpc(
        "mark_expired_paystack_payout_dispatch_reconciliation",
        { p_reference: reference },
      );
      if (dispatchRecoveryError) throw dispatchRecoveryError;
      const leaseToken = crypto.randomUUID();
      const { data: claimed, error: claimError } = await admin.rpc(
        "claim_paystack_payout_reconciliation",
        { p_reference: reference, p_lease_token: leaseToken, p_lease_seconds: 180 },
      );
      if (claimError) throw claimError;
      if (claimed !== true) continue;
      try {
        const outcome = await recordVerifiedPaystackPayout(
          admin,
          reference,
          leaseToken,
        );
        if (outcome !== "processing") settled += 1;
      } catch (error) {
        deferred += 1;
        console.error("paystack_payout_reconciler_deferred", {
          reference,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    let eventsProcessed = 0;
    for (const event of (eventResult.data ?? []) as Event[]) {
      const leaseToken = crypto.randomUUID();
      const { data: claimed, error: claimError } = await admin.rpc(
        "claim_paystack_payout_provider_event",
        { p_event_key: event.event_key, p_lease_token: leaseToken, p_lease_seconds: 180 },
      );
      if (claimError) throw claimError;
      if (claimed !== true) continue;
      try {
        await requireLegacyPaystackPayoutReference(admin, event.provider_reference);
        const reconciliationLeaseToken = crypto.randomUUID();
        const { data: reconciliationClaimed, error: reconciliationClaimError } =
          await admin.rpc("claim_paystack_payout_reconciliation", {
            p_reference: event.provider_reference,
            p_lease_token: reconciliationLeaseToken,
            p_lease_seconds: 180,
          });
        if (reconciliationClaimError) throw reconciliationClaimError;
        if (reconciliationClaimed !== true) {
          throw new Error("Paystack payout reconciliation lease was unavailable.");
        }
        await recordVerifiedPaystackPayout(
          admin,
          event.provider_reference,
          reconciliationLeaseToken,
        );
        await completeEvent(admin, event.event_key, leaseToken, "processed");
        eventsProcessed += 1;
      } catch (error) {
        await completeEvent(admin, event.event_key, leaseToken, "failed", "Provider retrieval deferred");
      }
    }

    return Response.json(
      { referencesSeen: references.size, settled, deferred, eventsProcessed, deadLetterEvents, now },
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
});
