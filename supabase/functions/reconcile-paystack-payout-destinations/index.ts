// Recipient creation and destination confirmation are retired with the Wallet.
// Existing encrypted destination records remain retained in the database.
Deno.serve(() => new Response("Wallet payout destination reconciliation is retired.", {
  status: 410,
  headers: { "cache-control": "no-store" },
}));
