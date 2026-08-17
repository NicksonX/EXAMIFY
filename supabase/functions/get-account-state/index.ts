import {
  corsHeaders,
  errorResponse,
  HttpError,
  optionsResponse,
  requireUser,
  serviceClient,
} from "../_shared/security.ts";

function objectKeyForUser(userId: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const pattern = new RegExp(`^${userId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "u");
  return pattern.test(value) ? value : null;
}

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });

    const user = await requireUser(request);
    const admin = serviceClient();
    const { data: account, error } = await admin.rpc("get_my_account_state_for_user", {
      p_user_id: user.id,
    });
    if (error || !account || typeof account !== "object" || Array.isArray(account)) {
      throw new HttpError(503, "ACCOUNT_STATE_UNAVAILABLE", "We couldn't check your account setup. Please try again.");
    }

    const accountRecord = account as Record<string, unknown>;
    const profile = accountRecord.profile;
    const profileRecord = profile && typeof profile === "object" && !Array.isArray(profile)
      ? profile as Record<string, unknown>
      : {};
    const objectKey = objectKeyForUser(user.id, profileRecord.profileImageObjectKey);
    let avatarUrl = typeof profileRecord.avatarUrl === "string" ? profileRecord.avatarUrl : null;
    if (objectKey) {
      const { data: signed, error: signedError } = await admin.storage
        .from("profile-avatars")
        .createSignedUrl(objectKey, 60 * 60);
      if (signedError || !signed?.signedUrl) {
        throw new HttpError(503, "PROFILE_IMAGE_UNAVAILABLE", "We couldn't load your profile image. Please try again.");
      }
      avatarUrl = signed.signedUrl;
    }

    return Response.json({
      account: {
        termsAvailable: accountRecord.termsAvailable === true,
        termsRequired: accountRecord.termsRequired === true,
        profileComplete: accountRecord.profileComplete === true,
        profile: {
          username: typeof profileRecord.username === "string" ? profileRecord.username : null,
          displayName: typeof profileRecord.fullName === "string" ? profileRecord.fullName : null,
          avatarUrl,
        },
      },
    }, { headers });
  } catch (error) {
    return errorResponse(error, headers);
  }
});
