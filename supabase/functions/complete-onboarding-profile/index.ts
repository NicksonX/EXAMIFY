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
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { extension: "jpg", mime: "image/jpeg" };
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return { extension: "png", mime: "image/png" };
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) return { extension: "webp", mime: "image/webp" };
  throw new HttpError(400, "INVALID_PROFILE_IMAGE", "Choose a valid JPEG, PNG, or WebP image.");
}

function requiredUsername(value: FormDataEntryValue | null): string {
  const username = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9_]{3,20}$/u.test(username)) {
    throw new HttpError(400, "INVALID_USERNAME", "Use 3–20 lowercase letters, numbers, or underscores for your username.");
  }
  return username;
}

function savedAvatarObjectKey(account: unknown, userId: string): string | null {
  if (!account || typeof account !== "object" || Array.isArray(account)) return null;
  const profile = (account as Record<string, unknown>).profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  const key = (profile as Record<string, unknown>).profileImageObjectKey;
  return typeof key === "string" && new RegExp(`^${userId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "u").test(key)
    ? key
    : null;
}

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  let objectKey: string | null = null;
  let profileSaved = false;
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });
    const user = await requireUser(request);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new HttpError(400, "INVALID_PROFILE_UPLOAD", "We couldn't read that picture. Choose the image again and retry.");
    }
    const username = requiredUsername(form.get("username"));
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
    objectKey = `${user.id}/${crypto.randomUUID()}.${image.extension}`;
    const admin = serviceClient();
    try {
      const { error: uploadError } = await admin.storage.from("profile-avatars").upload(
        objectKey,
        new Blob([blobBytes(bytes)], { type: image.mime }),
        { contentType: image.mime, upsert: false, cacheControl: "3600" },
      );
      if (uploadError) {
        console.error("Profile avatar upload failed", {
          bucket: "profile-avatars",
          error: uploadError.message,
          statusCode: uploadError.statusCode,
        });
        throw new HttpError(503, "PROFILE_IMAGE_UPLOAD_UNAVAILABLE", "We couldn't save your profile picture. Please try again.");
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error("Profile avatar upload request failed", {
        bucket: "profile-avatars",
        error: error instanceof Error ? error.message : "unknown error",
      });
      throw new HttpError(503, "PROFILE_IMAGE_UPLOAD_UNAVAILABLE", "We couldn't save your profile picture. Please try again.");
    }

    const { data, error } = await admin.rpc("complete_my_onboarding_profile", {
      p_user_id: user.id,
      p_username: username,
      p_profile_image_object_key: objectKey,
    });
    if (error) {
      console.error("Profile completion database update failed", {
        code: error.code,
        message: error.message,
      });
      if (error.message.includes("USERNAME_UNAVAILABLE")) {
        throw new HttpError(409, "USERNAME_UNAVAILABLE", "That username is unavailable. Choose another one.");
      }
      if (error.message.includes("INVALID_USERNAME")) {
        throw new HttpError(400, "INVALID_USERNAME", "Choose a different valid username.");
      }
      if (error.message.includes("TERMS_ACCEPTANCE_REQUIRED")) {
        throw new HttpError(409, "TERMS_ACCEPTANCE_REQUIRED", "Accept the current Terms before completing your profile.");
      }
      if (error.message.includes("PROFILE_ALREADY_COMPLETED")) {
        throw new HttpError(409, "PROFILE_ALREADY_COMPLETED", "Your profile is already complete.");
      }
      throw new HttpError(503, "PROFILE_UPDATE_UNAVAILABLE", "We couldn't finish saving your profile. Please try again.");
    }
    profileSaved = true;
    const storedObjectKey = savedAvatarObjectKey(data, user.id);
    if (!storedObjectKey) throw new Error("Completed profile is missing its private avatar.");
    if (storedObjectKey !== objectKey) {
      // The original completion succeeded but its response was lost. This retry
      // uploaded a replacement that is not referenced by the completed profile.
      // Remove only that transient object and sign the authoritative stored image.
      const { error: cleanupError } = await admin.storage.from("profile-avatars").remove([objectKey]);
      if (cleanupError) {
        console.error("Completed-profile retry image cleanup failed", { bucket: "profile-avatars" });
      }
    }
    const { data: signed, error: signedError } = await admin.storage.from("profile-avatars").createSignedUrl(storedObjectKey, 60 * 60);
    if (signedError || !signed?.signedUrl) {
      console.error("Profile avatar signing failed", {
        bucket: "profile-avatars",
        error: signedError?.message ?? "missing signed URL",
      });
      return Response.json({ account: data, avatarUrl: null }, { headers });
    }
    return Response.json({ account: data, avatarUrl: signed.signedUrl }, { headers });
  } catch (error) {
    if (objectKey && !profileSaved) {
      try {
        await serviceClient().storage.from("profile-avatars").remove([objectKey]);
      } catch {
        // A failed cleanup is operationally recoverable; never hide the original error.
      }
    }
    return errorResponse(error, headers);
  }
});
