import { supabase } from "@/lib/supabase";

export type AssessmentPurpose = "practice" | "main";
export type AssessmentType = "objective" | "essay" | "video" | "mixed";
export type AssessmentItemType = "objective" | "essay" | "video";
export type AssessmentStatus = "in_progress" | "submitted" | "pending_review" | "published" | "expired" | "void";

export interface AssessmentDefinition {
  id: string;
  slug: string;
  version: number;
  title: string;
  description: string | null;
  subject_id: string | null;
  purpose: AssessmentPurpose;
  assessment_type: AssessmentType;
  duration_seconds: number;
  total_points: number;
  item_count: number;
  available_from: string | null;
  available_until: string | null;
}

export interface AssessmentResponse {
  selected_option: number | null;
  essay_text: string | null;
  has_media: boolean;
  submitted_at: string | null;
}

export interface AssessmentItem {
  id: string;
  position: number;
  item_type: AssessmentItemType;
  prompt: string;
  options: string[];
  max_points: number;
  required: boolean;
  rubric?: Record<string, unknown>;
  response: AssessmentResponse | null;
}

export interface AssessmentAttempt {
  attempt_id: string;
  definition_id: string;
  purpose: AssessmentPurpose;
  assessment_type: AssessmentType;
  status: AssessmentStatus;
  started_at: string;
  deadline_at: string;
  submitted_at: string | null;
  progress_version: number;
  score: number | null;
  max_points: number;
  percentage: number | null;
  grade: "A" | "B" | "C" | "D" | "E" | "F" | null;
  items: AssessmentItem[];
}

export interface AssessmentResponseSave {
  response_id: string;
  attempt_id: string;
  attempt_item_id: string;
  response_version: number;
  progress_version: number;
  saved_at: string;
}

export interface AssessmentSubmission {
  attempt_id: string;
  status: AssessmentStatus;
  score: number | null;
  max_points: number;
  percentage: number | null;
  grade: AssessmentAttempt["grade"];
  submitted_at: string;
}

export interface AssessmentResult {
  id: string;
  title: string;
  purpose: AssessmentPurpose;
  assessment_type: AssessmentType;
  status: "pending_review" | "published";
  score: number | null;
  max_points: number;
  percentage: number | null;
  grade: AssessmentAttempt["grade"];
  submitted_at: string | null;
  published_at: string | null;
}

export class AssessmentError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AssessmentError";
  }
}

function wrapError(error: { message?: string } | null): AssessmentError {
  const message = error?.message ?? "Assessment request failed.";
  const code = message.toUpperCase().match(/[A-Z][A-Z0-9_]{3,}/)?.[0] ?? "UNKNOWN";
  return new AssessmentError(code, message);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isAssessmentPurpose(value: unknown): value is AssessmentPurpose {
  return value === "practice" || value === "main";
}

function isAssessmentType(value: unknown): value is AssessmentType {
  return value === "objective" || value === "essay" || value === "video" || value === "mixed";
}

function isAssessmentStatus(value: unknown): value is AssessmentStatus {
  return value === "in_progress" || value === "submitted" || value === "pending_review" || value === "published" || value === "expired" || value === "void";
}

function isAssessmentResult(value: unknown): value is AssessmentResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return isString(row.id) && isString(row.title) && isAssessmentPurpose(row.purpose)
    && isAssessmentType(row.assessment_type)
    && (row.status === "pending_review" || row.status === "published")
    && (row.percentage === null || typeof row.percentage === "number")
    && (row.grade === null || ["A", "B", "C", "D", "E", "F"].includes(row.grade as string));
}

function isOpenAssessmentAttempt(value: unknown): value is OpenAssessmentAttempt {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return isString(row.id) && isString(row.definition_id) && isString(row.title)
    && isAssessmentPurpose(row.purpose) && isAssessmentType(row.assessment_type)
    && row.status === "in_progress" && isString(row.started_at) && isString(row.deadline_at);
}

function asDefinition(value: unknown): AssessmentDefinition {
  if (!value || typeof value !== "object") throw new AssessmentError("INVALID_ASSESSMENT", "The assessment catalogue returned invalid data.");
  const row = value as Record<string, unknown>;
  if (!isString(row.id) || !isString(row.slug) || typeof row.version !== "number" || !isString(row.title)
    || !isAssessmentPurpose(row.purpose) || !isAssessmentType(row.assessment_type)
    || typeof row.duration_seconds !== "number" || typeof row.total_points !== "number") {
    throw new AssessmentError("INVALID_ASSESSMENT", "The assessment catalogue returned invalid data.");
  }
  return row as unknown as AssessmentDefinition;
}

function asAttempt(value: unknown): AssessmentAttempt {
  if (!value || typeof value !== "object") throw new AssessmentError("INVALID_ASSESSMENT", "The assessment server returned invalid attempt data.");
  const row = value as Record<string, unknown>;
  if (!isString(row.attempt_id) || !isString(row.definition_id) || !isAssessmentPurpose(row.purpose)
    || !isAssessmentType(row.assessment_type) || !isAssessmentStatus(row.status)
    || !isString(row.started_at) || !isString(row.deadline_at) || !Array.isArray(row.items)) {
    throw new AssessmentError("INVALID_ASSESSMENT", "The assessment server returned invalid attempt data.");
  }
  return row as unknown as AssessmentAttempt;
}

export async function fetchAssessmentResults(): Promise<AssessmentResult[]> {
  const { data, error } = await supabase.rpc("get_my_assessment_results");
  if (error) throw wrapError(error);
  return Array.isArray(data) ? data.filter(isAssessmentResult) : [];
}

export interface OpenAssessmentAttempt {
  id: string;
  definition_id: string;
  title: string;
  purpose: AssessmentPurpose;
  assessment_type: AssessmentType;
  status: "in_progress";
  started_at: string;
  deadline_at: string;
}

export async function fetchOpenAssessmentAttempts(
  purpose: AssessmentPurpose | null = null,
): Promise<OpenAssessmentAttempt[]> {
  const { data, error } = await supabase.rpc("get_my_open_assessment_attempts", {
    p_purpose: purpose,
  });
  if (error) throw wrapError(error);
  return Array.isArray(data) ? data.filter(isOpenAssessmentAttempt) : [];
}

export async function fetchLearningRewards(): Promise<Array<{
  id: string;
  assessment_attempt_id: string;
  amount_kobo: number;
  reason: string;
  status: "eligible" | "fulfilled" | "cancelled";
  created_at: string;
  fulfilled_at: string | null;
}>> {
  const { data, error } = await supabase.rpc("get_my_learning_reward_events");
  if (error) throw wrapError(error);
  return Array.isArray(data) ? data : [];
}

export async function fetchAssessmentCatalog(
  purpose: AssessmentPurpose | null = null,
): Promise<AssessmentDefinition[]> {
  const { data, error } = await supabase.rpc("get_published_assessment_catalog", {
    p_purpose: purpose,
  });
  if (error) throw wrapError(error);
  return Array.isArray(data) ? data.map(asDefinition) : [];
}

export async function startAssessment(definitionId: string): Promise<AssessmentAttempt> {
  const { data, error } = await supabase.rpc("start_assessment", {
    p_definition_id: definitionId,
  });
  if (error) throw wrapError(error);
  return asAttempt(data);
}

export async function resumeAssessment(attemptId: string): Promise<AssessmentAttempt> {
  const { data, error } = await supabase.rpc("resume_assessment", {
    p_attempt_id: attemptId,
  });
  if (error) throw wrapError(error);
  return asAttempt(data);
}

export async function clearAssessmentEssayResponse(attemptId: string, itemId: string): Promise<void> {
  const { error } = await supabase.rpc("clear_assessment_essay_response", {
    p_attempt_id: attemptId,
    p_attempt_item_id: itemId,
  });
  if (error) throw wrapError(error);
}

export async function saveAssessmentResponse(params: {
  attemptId: string;
  itemId: string;
  selectedOption?: number | null;
  essayText?: string | null;
  mediaObjectKey?: string | null;
  mediaMetadata?: Record<string, unknown>;
}): Promise<AssessmentResponseSave> {
  const { data, error } = await supabase.rpc("save_assessment_response", {
    p_attempt_id: params.attemptId,
    p_attempt_item_id: params.itemId,
    p_selected_option: params.selectedOption ?? null,
    p_essay_text: params.essayText ?? null,
    p_media_object_key: params.mediaObjectKey ?? null,
    p_media_metadata: params.mediaMetadata ?? {},
  });
  if (error) throw wrapError(error);
  return data as AssessmentResponseSave;
}

export async function submitAssessment(attemptId: string): Promise<AssessmentSubmission> {
  const { data, error } = await supabase.rpc("submit_assessment", {
    p_attempt_id: attemptId,
  });
  if (error) throw wrapError(error);
  return data as AssessmentSubmission;
}

export async function requestAssessmentMediaUpload(params: {
  attemptId: string;
  itemId: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<{ objectKey: string; signedUploadUrl: string }> {
  const { data, error } = await supabase.functions.invoke("assessment-media", {
    body: { action: "create-upload", ...params },
  });
  if (error) throw wrapError(error);
  if (!data || typeof data.objectKey !== "string" || typeof data.signedUploadUrl !== "string") {
    throw new AssessmentError("INVALID_MEDIA_UPLOAD", "The video upload service returned an invalid response.");
  }
  return data as { objectKey: string; signedUploadUrl: string };
}

export async function finalizeAssessmentMedia(params: {
  attemptId: string;
  itemId: string;
  objectKey: string;
  metadata: Record<string, unknown>;
}): Promise<{ objectKey: string; metadata: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke("assessment-media", {
    body: { action: "finalize-upload", ...params },
  });
  if (error) throw wrapError(error);
  if (!data || typeof data.objectKey !== "string") {
    throw new AssessmentError("INVALID_MEDIA_FINALIZATION", "The video upload service returned an invalid response.");
  }
  return data as { objectKey: string; metadata: Record<string, unknown> };
}
