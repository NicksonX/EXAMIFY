import {
  errorResponse,
  requiredEnv,
  serviceClient,
  timingSafeEqualText,
  verifyPaystackTransaction,
} from "../_shared/security.ts";
import {
  assertWalletTopupMetadata,
  processVerifiedWalletPaystackEvent,
  recordWalletTopupNonpayment,
  settleWalletTopup,
  type WalletTopupIntent,
} from "../_shared/wallet-paystack.ts";
import { requireLegacyWalletTopupReference } from "../_shared/wallet-retirement.ts";

const PAGE_SIZE = 50;
const MAX_EVENTS_PER_QUEUE = 200;
const MAX_INTENTS_PER_QUEUE = 200;
const OPEN_INTENT_STATUSES = ["pending", "initialized", "reconciling"];
const RECOVERABLE_TERMINAL_INTENT_STATUSES = ["failed", "cancelled", "expired"];

type StoredEvent = {
  event_key: string;
  event_type: string;
  provider_reference: string | null;
  payload: unknown;
};

type StoredIntent = WalletTopupIntent & {
  provider_reference: string;
};

type EventQueue = "retryable" | "stale" | "unleased";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

async function listEventQueue(
  admin: ReturnType<typeof serviceClient>,
  queue: EventQueue,
  now: string,
): Promise<StoredEvent[]> {
  const events: StoredEvent[] = [];

  // Fetch every page before processing it. Processing changes event state, so
  // paging a stable candidate set prevents offset shifts from skipping rows.
  for (let offset = 0; offset < MAX_EVENTS_PER_QUEUE; offset += PAGE_SIZE) {
    let query = admin
      .from("wallet_provider_events")
      .select("event_key, event_type, provider_reference, payload")
      .eq("provider", "paystack")
      .lt("attempt_count", 12)
      .order("last_attempt_at", { ascending: true, nullsFirst: true })
      .order("received_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (queue === "retryable") {
      query = query.in("processing_status", ["received", "failed"]);
    } else if (queue === "stale") {
      query = query
        .eq("processing_status", "processing")
        .lte("processing_lease_expires_at", now);
    } else {
      query = query
        .eq("processing_status", "processing")
        .is("processing_lease_expires_at", null);
    }

    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as StoredEvent[];
    events.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return events;
}

async function listIntentQueue(
  admin: ReturnType<typeof serviceClient>,
  statuses: string[],
): Promise<StoredIntent[]> {
  const intents: StoredIntent[] = [];

  // Open/reconciling intents and historical terminal recovery candidates are
  // deliberately separate queues. A large terminal history must never prevent
  // an unresolved payment from receiving another provider verification.
  for (let offset = 0; offset < MAX_INTENTS_PER_QUEUE; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("wallet_topup_intents")
      .select(
        "id, user_id, amount_kobo, currency, status, expires_at, settled_at, provider_reference",
      )
      .eq("provider", "paystack")
      .in("status", statuses)
      .order("last_reconciliation_attempt_at", {
        ascending: true,
        nullsFirst: true,
      })
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as StoredIntent[];
    intents.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return intents;
}

async function reconcileEvent(
  admin: ReturnType<typeof serviceClient>,
  event: StoredEvent,
): Promise<boolean> {
  if (!event.provider_reference) return false;
  const payload = object(event.payload);
  const data = object(payload.data);
  const nestedTransaction = object(data.transaction);
  const transactionId = nestedTransaction.id ?? data.transaction_id ?? data.id;
  const leaseToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_wallet_provider_event",
    {
      p_event_key: event.event_key,
      p_lease_token: leaseToken,
      p_lease_seconds: 180,
    },
  );
  if (claimError) throw claimError;
  if (claimed !== true) return false;

  try {
    await requireLegacyWalletTopupReference(admin, event.provider_reference);
    const result = await processVerifiedWalletPaystackEvent(admin, {
      eventType: event.event_type,
      reference: event.provider_reference,
      transactionId,
      data,
    });
    await completeEvent(
      admin,
      event.event_key,
      leaseToken,
      result.processingStatus,
      result.processingError,
    );
    console.info("wallet_reconciler_event_complete", {
      eventKey: event.event_key,
      status: result.processingStatus,
    });
    return result.processingStatus === "processed";
  } catch (error) {
    await completeEvent(
      admin,
      event.event_key,
      leaseToken,
      "failed",
      "Reconciliation processing error",
    );
    console.error("wallet_reconciler_event_failed", {
      eventKey: event.event_key,
      message: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

async function reconcileIntent(
  admin: ReturnType<typeof serviceClient>,
  candidate: StoredIntent,
): Promise<
  | "settled"
  | "finalized"
  | "deferred"
  | "closed_account_exception"
  | "not_claimed"
> {
  try {
    await requireLegacyWalletTopupReference(admin, candidate.provider_reference);
  } catch {
    return "not_claimed";
  }
  const leaseToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_wallet_topup_reconciliation",
    {
      p_intent_id: candidate.id,
      p_lease_token: leaseToken,
      p_lease_seconds: 180,
    },
  );
  if (claimError) throw claimError;
  if (claimed !== true) return "not_claimed";

  let transaction;
  try {
    transaction = await verifyPaystackTransaction(candidate.provider_reference);
  } catch (error) {
    console.error("wallet_reconciler_provider_verify_failed", {
      intentId: candidate.id,
      message: error instanceof Error ? error.message : "unknown",
    });
    return "deferred";
  }

  // Reload after the provider call so settlement uses the latest lifecycle
  // state if the return verifier or webhook completed in parallel.
  const { data: currentIntent, error: currentIntentError } = await admin
    .from("wallet_topup_intents")
    .select(
      "id, user_id, amount_kobo, currency, status, expires_at, settled_at, provider_reference",
    )
    .eq("id", candidate.id)
    .maybeSingle();
  if (currentIntentError || !currentIntent) return "deferred";

  const current = currentIntent as StoredIntent;
  try {
    if (transaction.reference !== current.provider_reference)
      throw new Error("Provider reference mismatch");
    if (transaction.status === "success") {
      assertWalletTopupMetadata(
        current,
        current.provider_reference,
        transaction,
      );
      const settlement = await settleWalletTopup(admin, current, transaction);
      return settlement === "settled" ? "settled" : "closed_account_exception";
    }
    return (await recordWalletTopupNonpayment(
      admin,
      current,
      transaction.status,
      transaction,
    ))
      ? "finalized"
      : "deferred";
  } catch (error) {
    console.error("wallet_reconciler_intent_deferred", {
      intentId: current.id,
      reference: current.provider_reference,
      message: error instanceof Error ? error.message : "unknown",
    });
    return "deferred";
  }
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405 });
    const expectedSecret = requiredEnv("WALLET_RECONCILIATION_SECRET");
    const presentedSecret =
      request.headers.get("x-wallet-reconciliation-secret") ?? "";
    if (!(await timingSafeEqualText(presentedSecret, expectedSecret)))
      return new Response("Unauthorized", { status: 401 });

    const admin = serviceClient();
    const now = new Date().toISOString();
    const [
      retryableEvents,
      staleEvents,
      unleasedProcessingEvents,
      openIntents,
      terminalIntents,
      deadLetterResult,
    ] = await Promise.all([
      listEventQueue(admin, "retryable", now),
      listEventQueue(admin, "stale", now),
      listEventQueue(admin, "unleased", now),
      listIntentQueue(admin, OPEN_INTENT_STATUSES),
      listIntentQueue(admin, RECOVERABLE_TERMINAL_INTENT_STATUSES),
      admin
        .from("wallet_provider_events")
        .select("event_key", { count: "exact", head: true })
        .eq("provider", "paystack")
        .gte("attempt_count", 12),
    ]);
    if (deadLetterResult.error) throw deadLetterResult.error;

    // Retry-exhausted events are deliberately excluded from ordinary work. They
    // are a visible dead-letter condition for operations, not a queue blocker.
    const deadLetterEvents = deadLetterResult.count ?? 0;
    if (deadLetterEvents > 0)
      console.error("wallet_reconciler_dead_letter_backlog", {
        deadLetterEvents,
      });

    const seenEvents = new Set<string>();
    const events = [
      ...retryableEvents,
      ...staleEvents,
      ...unleasedProcessingEvents,
    ].filter(
      (event) =>
        !seenEvents.has(event.event_key) &&
        Boolean(seenEvents.add(event.event_key)),
    );
    let eventsProcessed = 0;
    for (const event of events) {
      if (await reconcileEvent(admin, event)) eventsProcessed += 1;
    }

    const seenIntents = new Set<string>();
    const intents = [...openIntents, ...terminalIntents].filter(
      (intent) =>
        !seenIntents.has(intent.id) && Boolean(seenIntents.add(intent.id)),
    );
    let intentsSettled = 0;
    let intentsFinalized = 0;
    let intentsDeferred = 0;
    let closedAccountExceptions = 0;
    for (const intent of intents) {
      const outcome = await reconcileIntent(admin, intent);
      if (outcome === "settled") intentsSettled += 1;
      else if (outcome === "finalized") intentsFinalized += 1;
      else if (outcome === "closed_account_exception")
        closedAccountExceptions += 1;
      else if (outcome === "deferred") intentsDeferred += 1;
    }

    console.info("wallet_reconciler_complete", {
      eventsSeen: events.length,
      eventsProcessed,
      openIntentsSeen: openIntents.length,
      terminalIntentsSeen: terminalIntents.length,
      intentsSettled,
      intentsFinalized,
      intentsDeferred,
      closedAccountExceptions,
      deadLetterEvents,
    });
    return Response.json(
      {
        eventsProcessed,
        intentsSettled,
        intentsFinalized,
        intentsDeferred,
        closedAccountExceptions,
        deadLetterEvents,
      },
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("wallet_reconciler_unhandled", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(error);
  }
});
