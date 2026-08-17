// Payout dispatch is disabled as part of Wallet retirement. Reconciliation of
// records created before the cutoff remains isolated from this endpoint.
Deno.serve(() => new Response("Wallet payout dispatch is retired.", {
  status: 410,
  headers: { "cache-control": "no-store" },
}));
