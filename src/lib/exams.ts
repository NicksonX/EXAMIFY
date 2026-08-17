import { supabase } from "@/lib/supabase";

// ---------- Types matching supabase/migrations/0002_catalog.sql ----------

export type ExamMode = "full" | "topic" | "lesson";
export type SubjectCategory = "secondary" | "university";
export type ExamFamily = "jamb" | "waec" | "neco" | "post_utme";
export type Grade = "A" | "B" | "C" | "D" | "E" | "F";

export interface Institution {
  id: string;
  slug: string;
  name: string;
  type: "university" | "polytechnic" | "college" | null;
}

export interface Faculty {
  id: string;
  institution_id: string;
  slug: string;
  name: string;
}

export interface Department {
  id: string;
  faculty_id: string;
  slug: string;
  name: string;
}

export interface Subject {
  id: string;
  slug: string;
  name: string;
  category: SubjectCategory;
  exam_family: ExamFamily | null;
  department_id: string | null;
  level: number | null;
  code: string | null;
  blurb: string | null;
  sort_order: number;
}

export interface Topic {
  id: string;
  subject_id: string;
  slug: string;
  name: string;
  blurb: string | null;
  sort_order: number;
}

export interface ExamQuestion {
  id: string;
  stem: string;
  options: string[];
}

export interface StartExamResponse {
  attempt_id: string;
  subject_id: string;
  subject_name: string;
  mode: ExamMode;
  question_count: number;
  questions: ExamQuestion[];
}

export interface ReviewItem {
  id: string;
  stem: string;
  options: string[];
  selected: number | null;
  correct_index: number;
  is_correct: boolean;
  explanation: string;
}

export interface SubmitExamResponse {
  attempt_id: string;
  score: number;
  total: number;
  percentage: number;
  grade: Grade;
  duration_seconds: number;
  review: ReviewItem[];
}

export interface ExamAttempt {
  id: string;
  user_id: string;
  subject_id: string | null;
  mode: ExamMode;
  topic_id: string | null;
  question_count: number;
  score: number;
  total: number;
  percentage: number;
  grade: Grade | null;
  duration_seconds: number | null;
  questions_snapshot: unknown;
  answers: Record<string, number> | null;
  review: ReviewItem[] | null;
  started_at: string;
  ended_at: string | null;
  subject?: {
    name: string;
    slug: string;
    category: SubjectCategory;
    code: string | null;
  } | null;
}

export type AnswersMap = Record<string, number>;

// ---------- Study material content schema ----------

export interface ContentBlock {
  type: "p" | "example";
  text?: string;
  problem?: string;
  solution?: string;
}

export interface ContentSection {
  heading: string;
  blocks: ContentBlock[];
}

export interface StudyMaterialContent {
  intro?: string;
  objectives?: string[];
  sections?: ContentSection[];
  formulas?: string[];
  key_points?: string[];
  summary?: string;
  practice?: string[];
}

export type MaterialPlanSlug = "free" | "plus" | "pro";

export interface StudyMaterialPreview {
  id: string;
  subject_id: string;
  topic_id: string | null;
  title: string;
  slug: string;
  level: number | null;
  word_count: number;
  read_minutes: number;
  is_sample: boolean;
  minimum_plan_slug: MaterialPlanSlug;
  sort_order: number;
  subject?: {
    name: string;
    slug: string;
    category: SubjectCategory;
    code: string | null;
    level: number | null;
  } | null;
}

export interface StudyMaterial extends StudyMaterialPreview {
  /** Present only when get-study-material authorizes the current learner. */
  content?: StudyMaterialContent;
}

export interface StudyMaterialAccess {
  material: StudyMaterial;
  granted: boolean;
  requirement: MaterialPlanSlug;
}

// ---------- Error handling for the security-definer RPCs ----------

export type ExamErrorCode =
  | "FREE_LIMIT_REACHED"
  | "PLUS_LIMIT_REACHED"
  | "NO_QUESTIONS"
  | "SUBJECT_NOT_FOUND"
  | "NOT_AUTHENTICATED"
  | "ATTEMPT_NOT_FOUND"
  | "ALREADY_SUBMITTED"
  | "KEY_MISSING"
  | "UNKNOWN";

export class ExamError extends Error {
  code: ExamErrorCode;
  constructor(code: ExamErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ExamError";
  }
}

function classifyError(message: string): ExamErrorCode {
  const m = message.toUpperCase();
  if (m.includes("FREE_LIMIT_REACHED")) return "FREE_LIMIT_REACHED";
  if (m.includes("PLUS_LIMIT_REACHED")) return "PLUS_LIMIT_REACHED";
  if (m.includes("NO_QUESTIONS")) return "NO_QUESTIONS";
  if (m.includes("SUBJECT_NOT_FOUND")) return "SUBJECT_NOT_FOUND";
  if (m.includes("NOT_AUTHENTICATED")) return "NOT_AUTHENTICATED";
  if (m.includes("ATTEMPT_NOT_FOUND")) return "ATTEMPT_NOT_FOUND";
  if (m.includes("ALREADY_SUBMITTED")) return "ALREADY_SUBMITTED";
  if (m.includes("KEY_MISSING")) return "KEY_MISSING";
  return "UNKNOWN";
}

// ---------- RPC wrappers ----------

export async function startExam(params: {
  subjectId: string;
  mode?: ExamMode;
  topicId?: string | null;
  questionCount?: number;
}): Promise<StartExamResponse> {
  const { data, error } = await supabase.rpc("start_exam", {
    p_subject_id: params.subjectId,
    p_mode: params.mode ?? "full",
    p_topic_id: params.topicId ?? null,
    p_question_count: params.questionCount ?? 40,
  });
  if (error) throw new ExamError(classifyError(error.message), error.message);
  return data as unknown as StartExamResponse;
}

export async function submitExam(
  attemptId: string,
  answers: AnswersMap
): Promise<SubmitExamResponse> {
  const { data, error } = await supabase.rpc("submit_exam", {
    p_attempt_id: attemptId,
    p_answers: answers,
  });
  if (error) throw new ExamError(classifyError(error.message), error.message);
  return data as unknown as SubmitExamResponse;
}

// ---------- Catalog fetches ----------

export async function fetchSecondarySubjects(): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("category", "secondary")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Subject[];
}

export async function fetchInstitutions(): Promise<Institution[]> {
  const { data, error } = await supabase
    .from("institutions")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Institution[];
}

export async function fetchFaculties(institutionId: string): Promise<Faculty[]> {
  const { data, error } = await supabase
    .from("faculties")
    .select("*")
    .eq("institution_id", institutionId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Faculty[];
}

export async function fetchDepartments(facultyId: string): Promise<Department[]> {
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("faculty_id", facultyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Department[];
}

export async function fetchDepartmentSubjects(
  departmentId: string
): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("category", "university")
    .eq("department_id", departmentId)
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Subject[];
}

export async function fetchTopics(subjectId: string): Promise<Topic[]> {
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .eq("subject_id", subjectId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Topic[];
}

export async function fetchStudyMaterials(
  subjectId: string
): Promise<StudyMaterialPreview[]> {
  const { data, error } = await supabase.rpc("get_study_material_previews", { p_subject_id: subjectId });
  if (error) throw error;
  return (data ?? []) as unknown as StudyMaterialPreview[];
}

export async function fetchStudyMaterial(
  materialId: string
): Promise<StudyMaterialAccess | null> {
  const { data, error } = await supabase.functions.invoke("get-study-material", { body: { materialId } });
  if (error) throw error;
  const result = data as { material?: unknown; access?: { granted?: unknown; requirement?: unknown } } | null;
  if (!result?.material || !result.access) return null;
  const requirement = result.access.requirement;
  if (requirement !== "free" && requirement !== "plus" && requirement !== "pro") return null;
  return {
    material: result.material as StudyMaterial,
    granted: result.access.granted === true,
    requirement,
  };
}

export async function fetchSubject(
  subjectId: string
): Promise<Subject | null> {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("id", subjectId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Subject) ?? null;
}

export async function fetchAttempt(
  attemptId: string
): Promise<ExamAttempt | null> {
  const { data, error } = await supabase
    .from("exam_attempts")
    .select("*, subject:subjects(name, slug, category, code)")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ExamAttempt) ?? null;
}

export async function fetchRecentAttempts(limit = 8): Promise<ExamAttempt[]> {
  const { data, error } = await supabase
    .from("exam_attempts")
    .select("*, subject:subjects(name, slug, category, code)")
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ExamAttempt[];
}

export async function fetchAttemptStats(): Promise<{
  totalQuestions: number;
  bestPercentage: number;
  completedCount: number;
}> {
  const { data, error } = await supabase
    .from("exam_attempts")
    .select("total, percentage")
    .not("ended_at", "is", null);
  if (error) throw error;
  const rows = (data ?? []) as { total: number; percentage: number }[];
  const completedCount = rows.length;
  const totalQuestions = rows.reduce((sum, r) => sum + (r.total ?? 0), 0);
  const bestPercentage = rows.reduce(
    (best, r) => (r.percentage > best ? r.percentage : best),
    0
  );
  return { totalQuestions, bestPercentage, completedCount };
}
