import {
  corsHeaders,
  errorResponse,
  HttpError,
  optionsResponse,
  walletRetired,
} from "../_shared/security.ts";

Deno.serve((request) => {
  let headers: HeadersInit = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");
    }
    walletRetired();
  } catch (error) {
    return errorResponse(error, headers);
  }
});
