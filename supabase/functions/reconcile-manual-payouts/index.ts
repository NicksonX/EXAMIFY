import {
  errorResponse,
  requiredEnv,
  serviceClient,
  timingSafeEqualText,
} from "../_shared/security.ts";
import {
  sanitizedPaystackTransfer,
  verifyPaystackTransfer,
} from "../_shared/paystack-payouts.ts";
import { requireLegacyManualPayoutReference } from "../_shared/wallet-retirement.ts";

const PAGE_SIZE = 50;
type PendingRequest = { provider_reference: string };

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (!(await timingSafeEqualText(
      request.headers.get("x-manual-payout-reconciliation-secret") ?? "",
      requiredEnv("MANUAL_PAYOUT_RECONCILIATION_SECRET"),
    ))) return new Response("Unauthorized", { status: 401 });

    const admin = serviceClient();
    const { data, error } = await admin
      .from("manual_payout_requests")
      .select("provider_reference")
      .in("status", ["submitting", "processing", "reconciliation_required", "paid"])
      .not("provider_reference", "is", null)
      .order("updated_at", { ascending: true })
      .limit(PAGE_SIZE);
    if (error) throw error;

    let reconciled = 0;
    let deferred = 0;
    for (const requestRow of (data ?? []) as PendingRequest[]) {
      if (!requestRow.provider_reference) continue;
      try {
        await requireLegacyManualPayoutReference(admin, requestRow.provider_reference);
        const transfer = await verifyPaystackTransfer(requestRow.provider_reference);
        const { error: outcomeError } = await admin.rpc("record_manual_payout_outcome", {
          p_reference: requestRow.provider_reference,
          p_provider_transfer_id: String(transfer.id),
          p_provider_transfer_code: transfer.transfer_code,
          p_provider_status: transfer.status,
          p_provider_data: sanitizedPaystackTransfer(transfer),
        });
        if (outcomeError) throw outcomeError;
        reconciled += 1;
      } catch (error) {
        deferred += 1;
        console.error("manual_payout_reconciliation_deferred", {
          reference: requestRow.provider_reference,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }
    return Response.json({ considered: (data ?? []).length, reconciled, deferred }, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
});
