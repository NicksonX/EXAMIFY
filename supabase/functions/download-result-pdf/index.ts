import {
  corsHeaders,
  errorResponse,
  HttpError,
  optionsResponse,
  parseJsonBody,
  requiredUuid,
  requireUser,
  serviceClient,
} from "../_shared/security.ts";

type ResultAttempt = {
  id: string;
  score: number;
  total: number;
  percentage: number;
  grade: string | null;
  duration_seconds: number | null;
  ended_at: string | null;
  question_count: number | null;
  mode: string | null;
  subject: { name: string; code?: string | null } | null;
};

const encoder = new TextEncoder();
const pageWidth = 595;
const pageHeight = 842;
const navy = "0.078 0.153 0.29";
const mutedNavy = "0.204 0.314 0.486";
const red = "0.808 0.251 0.251";
const cream = "0.969 0.949 0.914";
const white = "1 1 1";
const RESULT_PDF_TEMPLATE_REVISION = "result-pdf-v2";

function pdfText(value: string, maxLength = 120): string {
  return value
    .normalize("NFKD")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function abbreviated(value: string, max = 42): string {
  const safe = pdfText(value, max + 1);
  return safe.length > max ? `${safe.slice(0, Math.max(1, max - 3))}...` : safe;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 1) return "Not recorded";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMode(mode: string | null): string {
  if (mode === "full") return "Full practice exam";
  if (mode === "topic") return "Topic practice";
  if (mode === "lesson") return "Lesson practice";
  return "Practice exam";
}

function makePdf(attempt: ResultAttempt, studentName: string): Uint8Array {
  const percentage = Math.max(0, Math.min(100, Math.round(Number(attempt.percentage) || 0)));
  const total = Math.max(0, Number(attempt.total) || 0);
  const score = Math.max(0, Number(attempt.score) || 0);
  const wrong = Math.max(0, total - score);
  const subject = abbreviated(attempt.subject?.name ?? "Examify Practice Exam", 56);
  const student = abbreviated(studentName || "Examify student", 44);
  const date = formatDate(attempt.ended_at ?? "");
  const shortId = attempt.id.replace(/-/g, "").slice(0, 8).toUpperCase();
  const commands: string[] = [];
  const rect = (x: number, y: number, width: number, height: number, color: string) => commands.push(`${color} rg ${x} ${y} ${width} ${height} re f`);
  const strokeRect = (x: number, y: number, width: number, height: number, color: string, line = 0.8) => commands.push(`${color} RG ${line} w ${x} ${y} ${width} ${height} re S`);
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, width = 1) => commands.push(`${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const text = (value: string, x: number, y: number, size: number, font = "F1", color = navy) => commands.push(`BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${pdfText(value)}) Tj ET`);
  const centred = (value: string, y: number, size: number, font = "F1", color = navy) => {
    const safe = pdfText(value);
    const factor = font === "F2" || font === "F3" ? 0.49 : 0.52;
    text(safe, Math.max(42, (pageWidth - safe.length * size * factor) / 2), y, size, font, color);
  };

  rect(0, 0, pageWidth, pageHeight, cream);
  rect(0, 806, pageWidth, 36, navy);
  text("EXAMIFY", 48, 819, 11, "F1", white);
  text("COMPUTER-BASED TESTING & LEARNING", 124, 820, 7.2, "F1", "0.87 0.91 0.96");
  rect(48, 789, 54, 2.5, red);

  centred("PRACTICE COMPLETION RECORD", 748, 9, "F1", red);
  centred("Your Examify Result", 710, 30, "F3", navy);
  centred("A personal record of your completed practice session", 685, 10, "F1", mutedNavy);
  line(205, 667, 390, 667, mutedNavy, 0.5);

  centred("THIS CERTIFIES THAT", 638, 8, "F1", mutedNavy);
  centred(student, 609, 21, "F3", navy);
  centred("has completed", 586, 10, "F1", mutedNavy);
  centred(subject, 560, 15, "F2", navy);
  centred(formatMode(attempt.mode), 541, 9, "F1", mutedNavy);

  const tileY = 478;
  const tiles = [
    ["DATE", date],
    ["TIME TAKEN", formatDuration(attempt.duration_seconds)],
    ["QUESTIONS", String(attempt.question_count ?? total)],
  ];
  tiles.forEach(([label, value], index) => {
    const x = 48 + index * 166;
    rect(x, tileY, 151, 46, white);
    strokeRect(x, tileY, 151, 46, "0.78 0.81 0.85", 0.6);
    text(label, x + 12, tileY + 31, 7.5, "F1", mutedNavy);
    text(abbreviated(value, 24), x + 12, tileY + 14, 10, "F2", navy);
  });

  rect(48, 291, 499, 162, white);
  strokeRect(48, 291, 499, 162, "0.78 0.81 0.85", 0.8);
  rect(48, 449, 499, 4, red);
  centred(`${percentage}%`, 378, 43, "F2", navy);
  centred("OVERALL SCORE", 361, 8, "F1", mutedNavy);
  line(297, 345, 297, 321, "0.78 0.81 0.85", 0.7);
  text("GRADE", 198, 336, 8, "F1", mutedNavy);
  text(abbreviated(attempt.grade ?? "Recorded", 12), 205, 312, 21, "F3", red);
  text("RESULT", 361, 336, 8, "F1", mutedNavy);
  text(`${score} correct / ${wrong} wrong`, 340, 316, 11, "F2", navy);

  const statY = 236;
  [["TOTAL", String(total)], ["CORRECT", String(score)], ["WRONG", String(wrong)]].forEach(([label, value], index) => {
    const x = 48 + index * 166;
    rect(x, statY, 151, 38, index === 1 ? "0.91 0.95 0.92" : white);
    strokeRect(x, statY, 151, 38, "0.78 0.81 0.85", 0.6);
    text(label, x + 11, statY + 24, 7.5, "F1", mutedNavy);
    text(value, x + 11, statY + 9, 14, "F2", index === 2 ? red : navy);
  });

  text("EXAMIFY", 48, 159, 14, "F3", navy);
  line(48, 151, 184, 151, mutedNavy, 0.5);
  text("Automated scoring system", 48, 137, 8, "F1", mutedNavy);
  text(date, 414, 159, 11, "F2", navy);
  line(370, 151, 547, 151, mutedNavy, 0.5);
  text("Date issued", 485, 137, 8, "F1", mutedNavy);

  line(48, 97, 547, 97, red, 0.8);
  text("Examify practice result  /  For personal learning use", 48, 77, 8, "F1", mutedNavy);
  text(`Result ID: ${shortId}`, 443, 77, 8, "F1", mutedNavy);
  text("This is a practice record, not an official examination result.", 48, 57, 7.5, "F1", mutedNavy);
  text(`Template: ${RESULT_PDF_TEMPLATE_REVISION}`, 430, 57, 7.5, "F1", mutedNavy);

  const content = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>",
  ];
  let document = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(document).length);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(document).length;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { document += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(document);
}

Deno.serve(async (request) => {
  let headers: HeadersInit;
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");

    const user = await requireUser(request);
    const { attemptId } = await parseJsonBody(request);
    const id = requiredUuid(attemptId, "result");
    const admin = serviceClient();
    const now = new Date().toISOString();
    const { data: entitlement, error: entitlementError } = await admin
      .from("entitlements")
      .select("id")
      .eq("user_id", user.id)
      .eq("plan_slug", "pro")
      .eq("status", "active")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .limit(1)
      .maybeSingle();
    if (entitlementError) throw entitlementError;
    if (!entitlement) throw new HttpError(403, "PRO_REQUIRED", "A current Pro pass is required to download a result PDF.");

    const { data, error } = await admin
      .from("exam_attempts")
      .select("id, score, total, percentage, grade, duration_seconds, ended_at, question_count, mode, subject:subjects(name, code)")
      .eq("id", id)
      .eq("user_id", user.id)
      .not("ended_at", "is", null)
      .maybeSingle();
    if (error) throw error;
    const attempt = data as unknown as ResultAttempt | null;
    if (!attempt) throw new HttpError(404, "RESULT_NOT_FOUND", "That completed result was not found.");

    const profileName = typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata.name === "string"
        ? user.user_metadata.name
        : "Examify student";
    const pdf = makePdf(attempt, profileName);
    return new Response(pdf, {
      status: 200,
      headers: {
        ...headers,
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="examify-practice-result-${attempt.id}.pdf"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-examify-pdf-template-revision": RESULT_PDF_TEMPLATE_REVISION,
      },
    });
  } catch (error) {
    return errorResponse(error, headers ?? { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  }
});
