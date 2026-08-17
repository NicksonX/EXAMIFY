import {
  corsHeaders,
  errorResponse,
  HttpError,
  optionsResponse,
  requireUser,
  serviceClient,
} from "../_shared/security.ts";

function openCheckout(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");
    }

    const user = await requireUser(request);
    const admin = serviceClient();
    const { data, error } = await admin.rpc("get_open_payment_checkout_for_user", {
      p_user_id: user.id,
    });
    if (error) throw error;

    const checkout = openCheckout(data);
    if (!checkout) {
      throw new HttpError(409, "NO_OPEN_CHECKOUT", "There is no active checkout to resume.");
    }

    const authorizationUrl = checkout.authorizationUrl;
    const reference = checkout.reference;
    if (typeof authorizationUrl !== "string" || !authorizationUrl.startsWith("https://")) {
      throw new HttpError(
        409,
        "CHECKOUT_RESUME_UNAVAILABLE",
        "This checkout cannot be resumed. Check its payment status or start a new checkout after it expires.",
      );
    }
    if (typeof reference !== "string" || !/^exf_[A-Za-z0-9]{16,160}$/u.test(reference)) {
      throw new Error("Open payment checkout reference is invalid.");
    }

    return Response.json({ authorizationUrl, reference }, { headers });
  } catch (error) {
    return errorResponse(error, headers);
  }
});
