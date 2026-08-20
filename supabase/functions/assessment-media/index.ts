import {
  authenticatedClient,
  corsHeaders,
  errorResponse,
  HttpError,
  optionsResponse,
  parseJsonBody,
  requireUser,
  serviceClient,
} from "../_shared/security.ts";

const BUCKET = "assessment-submissions";
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const EXTENSIONS = new Map([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
]);

type AssessmentMediaUpload = {
  id: string;
  attempt_id: string;
  attempt_item_id: string;
  user_id: string;
  object_key: string;
  original_filename: string;
  content_type: string;
  expected_size: number;
  observed_size: number | null;
  observed_content_type: string | null;
  status: "issued" | "finalized" | "void";
};

function stringValue(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "INVALID_REQUEST", `Missing ${key}.`);
  return value.trim();
}

function uuidValue(body: Record<string, unknown>, key: string): string {
  const value = stringValue(body, key);
  if (!/^[0-9a-f-]{36}$/iu.test(value)) throw new HttpError(400, "INVALID_REQUEST", `Invalid ${key}.`);
  return value;
}

function objectKey(userId: string, attemptId: string, itemId: string, extension: string): string {
  return `${userId}/${attemptId}/${itemId}/${crypto.randomUUID()}.${extension}`;
}

function expectedPrefix(userId: string, attemptId: string, itemId: string): string {
  return `${userId}/${attemptId}/${itemId}/`;
}

function responseMetadata(upload: AssessmentMediaUpload): Record<string, unknown> {
  return {
    originalFilename: upload.original_filename,
    expectedSize: upload.expected_size,
    uploadedSize: upload.observed_size,
    contentType: upload.content_type,
    uploadedMimeType: upload.observed_content_type,
  };
}

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");
    const user = await requireUser(request);
    const body = await parseJsonBody(request);
    const action = stringValue(body, "action");
    const attemptId = uuidValue(body, "attemptId");
    const itemId = uuidValue(body, "itemId");
    const admin = serviceClient();

    const { data: item, error: itemError } = await admin
      .from("assessment_attempt_items")
      .select("id, attempt_id, item_type")
      .eq("id", itemId)
      .eq("attempt_id", attemptId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item || item.item_type !== "video") throw new HttpError(404, "ASSESSMENT_ITEM_NOT_FOUND", "That video assessment item is unavailable.");

    const { data: attempt, error: attemptError } = await admin
      .from("assessment_attempts")
      .select("id, user_id, status, deadline_at")
      .eq("id", attemptId)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt || attempt.user_id !== user.id) throw new HttpError(404, "ASSESSMENT_ATTEMPT_NOT_FOUND", "That assessment attempt is unavailable.");
    if (attempt.status !== "in_progress") throw new HttpError(409, "ASSESSMENT_NOT_IN_PROGRESS", "This assessment is no longer accepting responses.");
    if (Date.parse(attempt.deadline_at) <= Date.now()) throw new HttpError(409, "ASSESSMENT_ATTEMPT_EXPIRED", "The assessment timer has expired.");

    if (action === "create-upload") {
      const filename = stringValue(body, "filename").split(/[\\/]/u).pop() ?? "video";
      const contentType = stringValue(body, "contentType").toLowerCase();
      const size = body.size;
      if (!ALLOWED_TYPES.has(contentType) || !EXTENSIONS.has(contentType)) throw new HttpError(415, "INVALID_ASSESSMENT_MEDIA", "Choose an MP4, WebM, or QuickTime video.");
      if (typeof size !== "number" || !Number.isFinite(size) || size < 1 || size > MAX_BYTES) throw new HttpError(413, "INVALID_ASSESSMENT_MEDIA", "Choose a video smaller than 100 MB.");
      const extension = EXTENSIONS.get(contentType) ?? "mp4";
      const key = objectKey(user.id, attemptId, itemId, extension);
      const { data: issued, error: issueError } = await admin
        .from("assessment_media_uploads")
        .insert({
          attempt_id: attemptId,
          attempt_item_id: itemId,
          user_id: user.id,
          object_key: key,
          original_filename: filename.slice(0, 255),
          content_type: contentType,
          expected_size: size,
        })
        .select("id")
        .single();
      if (issueError || !issued) throw issueError ?? new Error("Assessment media issuance failed.");

      const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUploadUrl(key);
      if (signedError || !signed?.signedUrl) {
        await admin.from("assessment_media_uploads").update({ status: "void" }).eq("id", issued.id);
        console.error("Assessment media signed upload creation failed", { error: signedError?.message ?? "missing URL" });
        throw new HttpError(503, "ASSESSMENT_MEDIA_UNAVAILABLE", "Video upload is temporarily unavailable.");
      }
      return Response.json({ objectKey: key, signedUploadUrl: signed.signedUrl, contentType, size }, { headers });
    }

    if (action === "finalize-upload") {
      const key = stringValue(body, "objectKey");
      const prefix = expectedPrefix(user.id, attemptId, itemId);
      if (!key.startsWith(prefix) || !/^[^/]+\.(mp4|webm|mov)$/iu.test(key.slice(prefix.length))) throw new HttpError(400, "INVALID_ASSESSMENT_MEDIA", "That video object is not valid for this assessment item.");

      const { data: upload, error: uploadError } = await admin
        .from("assessment_media_uploads")
        .select("id, attempt_id, attempt_item_id, user_id, object_key, original_filename, content_type, expected_size, observed_size, observed_content_type, status")
        .eq("attempt_id", attemptId)
        .eq("attempt_item_id", itemId)
        .eq("user_id", user.id)
        .eq("object_key", key)
        .maybeSingle<AssessmentMediaUpload>();
      if (uploadError) throw uploadError;
      if (!upload || upload.status === "void") throw new HttpError(400, "INVALID_ASSESSMENT_MEDIA", "That video upload is no longer valid.");
      if (upload.status === "finalized") {
        return Response.json({ objectKey: key, metadata: responseMetadata(upload) }, { headers });
      }

      const relative = key;
      const lastSlash = relative.lastIndexOf("/");
      const parent = relative.slice(0, lastSlash);
      const filename = relative.slice(lastSlash + 1);
      const { data: objects, error: listError } = await admin.storage.from(BUCKET).list(parent, { search: filename, limit: 10 });
      if (listError) throw listError;
      const uploaded = objects?.find((entry) => entry.name === filename);
      if (!uploaded) throw new HttpError(400, "ASSESSMENT_MEDIA_NOT_FOUND", "The video upload could not be found. Please upload it again.");

      const observedSize = Number(uploaded.metadata?.size ?? 0);
      const observedMime = typeof uploaded.metadata?.mimetype === "string" ? uploaded.metadata.mimetype.toLowerCase() : null;
      if (!Number.isSafeInteger(observedSize) || observedSize < 1 || observedSize !== upload.expected_size || (observedMime && observedMime !== upload.content_type)) {
        await admin.from("assessment_media_uploads").update({ status: "void" }).eq("id", upload.id).eq("status", "issued");
        throw new HttpError(400, "INVALID_ASSESSMENT_MEDIA", "The uploaded video metadata does not match the declared file.");
      }

      const { data: finalized, error: finalizeError } = await admin
        .from("assessment_media_uploads")
        .update({
          status: "finalized",
          observed_size: observedSize,
          observed_content_type: observedMime ?? upload.content_type,
          finalized_at: new Date().toISOString(),
        })
        .eq("id", upload.id)
        .eq("status", "issued")
        .select("id, attempt_id, attempt_item_id, user_id, object_key, original_filename, content_type, expected_size, observed_size, observed_content_type, status")
        .single<AssessmentMediaUpload>();
      if (finalizeError || !finalized) throw finalizeError ?? new Error("Assessment media finalization failed.");

      const authenticated = authenticatedClient(request);
      const { error: saveError } = await authenticated.rpc("save_assessment_response", {
        p_attempt_id: attemptId,
        p_attempt_item_id: itemId,
        p_selected_option: null,
        p_essay_text: null,
        p_media_object_key: key,
        p_media_metadata: {},
      });
      if (saveError) throw saveError;
      return Response.json({ objectKey: key, metadata: responseMetadata(finalized) }, { headers });
    }

    throw new HttpError(400, "INVALID_REQUEST", "Unsupported media action.");
  } catch (error) {
    return errorResponse(error, headers);
  }
});
