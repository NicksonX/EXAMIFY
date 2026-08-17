import {
  corsHeaders,
  errorResponse,
  HttpError,
  optionsResponse,
  parseJsonBody,
  requireUser,
  serviceClient,
} from "../_shared/security.ts";

Deno.serve(async (request) => {
  let headers: HeadersInit;
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");

    const user = await requireUser(request);
    const body = await parseJsonBody(request);
    const confirmedEmail = typeof body.confirmedEmail === "string" ? body.confirmedEmail.trim() : "";
    if (!user.email || !confirmedEmail || confirmedEmail.toLocaleLowerCase() !== user.email.toLocaleLowerCase()) {
      throw new HttpError(400, "EMAIL_CONFIRMATION_MISMATCH", "Type the email address currently registered to this account.");
    }

    const admin = serviceClient();

    // Auth and Postgres cannot share a transaction. Block future Auth sessions
    // first, then tombstone the application record. If the database operation
    // fails, immediately compensate by unblocking the identity so an active
    // learner is never left with an inaccessible, half-deleted account.
    const { error: blockError } = await admin.auth.admin.updateUserById(user.id, {
      ban_duration: "876000h",
    });
    if (blockError) throw blockError;

    const { error: tombstoneError } = await admin.rpc("tombstone_account_for_deletion", {
      p_user_id: user.id,
      p_confirmed_email: user.email,
    });
    if (tombstoneError) {
      const { error: restoreError } = await admin.auth.admin.updateUserById(user.id, {
        ban_duration: "none",
      });
      if (restoreError) console.error("Failed to restore Auth access after deletion rollback", restoreError.message);

      const message = tombstoneError.message ?? "";
      if (message.includes("WALLET_BALANCE_MUST_BE_ZERO")) {
        throw new HttpError(409, "WALLET_BALANCE_MUST_BE_ZERO", "Withdraw or resolve your wallet balance before deleting the account.");
      }
      if (message.includes("ACTIVE_WALLET_HOLD") || message.includes("ACTIVE_WITHDRAWAL") || message.includes("ACTIVE_WALLET_TOPUP")) {
        throw new HttpError(409, "ACTIVE_FINANCIAL_ACTIVITY", "Wait for pending wallet activity to finish before deleting the account.");
      }
      throw tombstoneError;
    }

    return Response.json({ deleted: true }, { headers });
  } catch (error) {
    return errorResponse(error, headers ?? { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  }
});
