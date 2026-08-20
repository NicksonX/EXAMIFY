import {
  corsHeaders,
  errorResponse,
  HttpError,
  optionsResponse,
  requireUser,
  serviceClient,
} from "../_shared/security.ts";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function blobBytes(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function avatarExtension(bytes: Uint8Array): { extension: "jpg" | "png" | "webp"; mime: string } {
  if (bytes.length < 12) throw new HttpError(400, "INVALID_PROFILE_IMAGE", "Choose a valid JPEG, PNG, or WebP image.");
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: "jpg", mime: "image/jpeg" };
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return { extension: "png", mime: "image/png" };
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF"
    && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) return { extension: "webp", mime: "image/webp" };
  throw new HttpError(400, "INVALID_PROFILE_IMAGE", "Choose a valid JPEG, PNG, or WebP image.");
}

function privateAvatarKey(value: unknown, userId: string): string | null {
  return typeof value === "string"
    && new RegExp(`^${userId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "u").test(value)
    ? value
    : null;
}

function safeAccount(value: unknown, avatarUrl: string): Record<string, unknown> {
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const source = root.account && typeof root.account === "object" && !Array.isArray(root.account)
    ? root.account as Record<string, unknown>
    : root;
  const profile = source.profile && typeof source.profile === "object" && !Array.isArray(source.profile)
    ? source.profile as Record<string, unknown>
    : {};
  return {
    termsAvailable: source.termsAvailable === true,
    termsRequired: source.termsRequired === true,
    profileComplete: source.profileComplete === true,
    profile: {
      username: typeof profile.username === "string" ? profile.username : null,
      displayName: typeof profile.displayName === "string" ? profile.displayName : null,
      avatarUrl,
    },
    terms: source.terms && typeof source.terms === "object" && !Array.isArray(source.terms)
      ? source.terms
      : null,
  };
}

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  let objectKey: string | null = null;
  let profileSaved = false;
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");

    const user = await requireUser(request);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new HttpError(400, "INVALID_PROFILE_UPLOAD", "We couldn't read that picture. Choose the image again and retry.");
    }
    const avatar = form.get("avatar");
    if (!(avatar instanceof File)) {
      throw new HttpError(400, "PROFILE_IMAGE_REQUIRED", "Choose a profile picture to continue.");
    }
    if (avatar.size < 1 || avatar.size > MAX_AVATAR_BYTES) {
      throw new HttpError(400, "INVALID_PROFILE_IMAGE", "Choose an image smaller than 2 MB.");
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await avatar.arrayBuffer());
    } catch {
      throw new HttpError(400, "INVALID_PROFILE_IMAGE", "We couldn't read that picture. Choose the image again and retry.");
    }
    const image = avatarExtension(bytes);
    const admin = serviceClient();
    const { data: priorProfile, error: priorProfileError } = await admin
      .from("profiles")
      .select("profile_image_object_key")
      .eq("id", user.id)
      .maybeSingle();
    if (priorProfileError) throw priorProfileError;
    const priorObjectKey = privateAvatarKey(
      (priorProfile as { profile_image_object_key?: unknown } | null)?.profile_image_object_key,
      user.id,
    );

    objectKey = `${user.id}/${crypto.randomUUID()}.${image.extension}`;
    const { error: uploadError } = await admin.storage.from("profile-avatars").upload(
      objectKey,
      new Blob([blobBytes(bytes)], { type: image.mime }),
      { contentType: image.mime, upsert: false, cacheControl: "3600" },
    );
    if (uploadError) {
      console.error("Profile avatar replacement upload failed", { bucket: "profile-avatars", error: uploadError.message });
      throw new HttpError(503, "PROFILE_IMAGE_UPLOAD_UNAVAILABLE", "We couldn't save your profile picture. Please try again.");
    }

    const { data, error } = await admin.rpc("update_my_profile_avatar", {
      p_user_id: user.id,
      p_profile_image_object_key: objectKey,
    });
    if (error) {
      console.error("Profile avatar replacement database update failed", { code: error.code, message: error.message });
      if (error.message.includes("PROFILE_INCOMPLETE")) {
        throw new HttpError(409, "PROFILE_INCOMPLETE", "Finish setting up your profile before replacing its picture.");
      }
      throw new HttpError(503, "PROFILE_UPDATE_UNAVAILABLE", "We couldn't update your profile picture. Please try again.");
    }
    profileSaved = true;

    const { data: signed, error: signedError } = await admin.storage
      .from("profile-avatars")
      .createSignedUrl(objectKey, 60 * 60);
    if (signedError || !signed?.signedUrl) {
      console.error("Profile avatar replacement signing failed", { bucket: "profile-avatars", error: signedError?.message ?? "missing signed URL" });
      throw new HttpError(503, "PROFILE_IMAGE_SIGNING_UNAVAILABLE", "Your new picture was saved but could not be displayed yet. Refresh and try again.");
    }

    if (priorObjectKey && priorObjectKey !== objectKey) {
      const { error: cleanupError } = await admin.storage.from("profile-avatars").remove([priorObjectKey]);
      if (cleanupError) console.error("Previous profile avatar cleanup failed", { bucket: "profile-avatars" });
    }
    return Response.json({ account: safeAccount(data, signed.signedUrl), avatarUrl: signed.signedUrl }, { headers });
  } catch (error) {
    if (objectKey && !profileSaved) {
      try {
        await serviceClient().storage.from("profile-avatars").remove([objectKey]);
      } catch {
        // A failed cleanup is recoverable; retain the original request error.
      }
    }
    return errorResponse(error, headers);
  }
});
