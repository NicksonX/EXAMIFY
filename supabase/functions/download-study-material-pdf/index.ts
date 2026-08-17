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

type Block = { type?: string; text?: string; problem?: string; solution?: string };
type MaterialContent = {
  intro?: string;
  objectives?: string[];
  sections?: { heading?: string; blocks?: Block[] }[];
  formulas?: string[];
  key_points?: string[];
  summary?: string;
  practice?: string[];
};
type StudyMaterialRow = {
  id: string;
  title: string;
  word_count: number | null;
  read_minutes: number | null;
  content: MaterialContent;
  subject: { name: string } | null;
};

const encoder = new TextEncoder();
const pageWidth = 595;
const pageHeight = 842;
const left = 56;
const right = 539;
const top = 756;
const bottom = 64;

function clean(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(value: string, characters = 86): string[] {
  const words = value.trim().replace(/\s+/g, " ").split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > characters && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function makePdf(material: StudyMaterialRow): Uint8Array {
  const pages: string[] = [];
  let commands: string[] = [];
  let y = top;
  let pageNumber = 0;
  const rgb = (r: number, g: number, b: number) => `${r} ${g} ${b} rg`;
  const draw = (text: string, x: number, yPos: number, size: number, font = "F1", color = "0.078 0.153 0.29") => {
    commands.push(`BT /${font} ${size} Tf ${color} ${x} ${yPos} Td (${clean(text)}) Tj ET`);
  };
  const startPage = () => {
    if (commands.length) pages.push(commands.join("\n"));
    pageNumber += 1;
    commands = [
      "0.969 0.949 0.914 rg 0 0 595 842 re f",
      "0.078 0.153 0.29 rg 0 811 595 31 re f",
      "0.078 0.153 0.29 rg 56 49 483 0.6 re f",
    ];
    draw("EXAMIFY  /  STUDY MATERIAL", left, 821, 8, "F1", "1 1 1");
    draw(material.subject?.name ?? "Study material", left, 31, 8, "F1", "0.204 0.314 0.486");
    draw(`Page ${pageNumber}`, right - 36, 31, 8, "F1", "0.204 0.314 0.486");
    y = top;
  };
  const room = (height: number) => { if (y - height < bottom) startPage(); };
  const heading = (value: string, level: 1 | 2 = 2) => {
    const size = level === 1 ? 26 : 17;
    const lines = wrap(value, level === 1 ? 36 : 52);
    room(lines.length * (size + 6) + 18);
    commands.push("0.808 0.251 0.251 rg", `${left} ${y + 8} 30 2 re f`);
    for (const line of lines) { draw(line, left + 0, y, size, "F3"); y -= size + 6; }
    y -= 10;
  };
  const paragraph = (value: string, style: "body" | "intro" | "bullet" = "body") => {
    const size = style === "intro" ? 13 : 10.5;
    const leading = style === "intro" ? 20 : 16;
    const width = style === "bullet" ? 76 : style === "intro" ? 65 : 88;
    const lines = wrap(value, width);
    room(lines.length * leading + 10);
    lines.forEach((line, index) => {
      if (style === "bullet" && index === 0) { draw("-", left, y, size, "F1", "0.808 0.251 0.251"); draw(line, left + 13, y, size); }
      else draw(line, style === "bullet" ? left + 13 : left, y, size, style === "intro" ? "F2" : "F1", style === "intro" ? "0.204 0.314 0.486" : "0.204 0.314 0.486");
      y -= leading;
    });
    y -= 8;
  };
  const label = (value: string) => { room(24); draw(value.toUpperCase(), left, y, 8, "F1", "0.808 0.251 0.251"); y -= 20; };

  startPage();
  label("Official learning export");
  heading(material.title, 1);
  draw(material.subject?.name ?? "Examify study material", left, y, 12, "F1", "0.204 0.314 0.486"); y -= 28;
  draw(`${material.read_minutes ?? ""} minute read${material.word_count ? `  /  ${material.word_count.toLocaleString()} words` : ""}`, left, y, 9, "F1", "0.204 0.314 0.486"); y -= 42;
  commands.push("0.078 0.153 0.29 rg", `${left} ${y - 72} 483 72 re f`);
  draw("Prepared for focused study and A4 printing.", left + 18, y - 28, 13, "F2", "1 1 1");
  draw("Content access is verified against your active Examify Pro pass.", left + 18, y - 49, 9, "F1", "0.9 0.93 0.97");
  y -= 106;
  if (material.content.intro) { label("Overview"); paragraph(material.content.intro, "intro"); }
  if (material.content.objectives?.length) { heading("Learning objectives"); material.content.objectives.forEach((item) => paragraph(item, "bullet")); }
  for (const section of material.content.sections ?? []) {
    if (!section.heading) continue;
    heading(section.heading);
    for (const block of section.blocks ?? []) {
      if (block.type === "example") {
        label("Worked example");
        if (block.problem) paragraph(block.problem, "intro");
        if (block.solution) { label("Solution"); paragraph(block.solution); }
      } else if (block.text) paragraph(block.text);
    }
  }
  if (material.content.formulas?.length) { heading("Important formulas"); material.content.formulas.forEach((formula) => paragraph(formula, "bullet")); }
  if (material.content.key_points?.length) { heading("Key points"); material.content.key_points.forEach((point) => paragraph(point, "bullet")); }
  if (material.content.summary) { heading("Summary"); paragraph(material.content.summary); }
  if (material.content.practice?.length) { heading("Practice questions"); material.content.practice.forEach((question, index) => paragraph(`${index + 1}. ${question}`, "bullet")); }
  room(40);
  commands.push("0.808 0.251 0.251 rg", `${left} ${y - 4} 483 1 re f`);
  draw("Examify study material  /  For personal study use", left, y - 24, 8, "F1", "0.204 0.314 0.486");
  pages.push(commands.join("\n"));

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>",
  ];
  const pageObjectNumbers = pages.map((_, index) => 6 + index * 2);
  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((content, index) => {
    const pageObject = pageObjectNumbers[index];
    const contentObject = pageObject + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(encoder.encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(pdf);
}

Deno.serve(async (request) => {
  let headers: HeadersInit;
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");
    const user = await requireUser(request);
    const materialId = requiredUuid((await parseJsonBody(request)).materialId, "study material");
    const admin = serviceClient();
    const now = new Date().toISOString();
    const { data: entitlement, error: entitlementError } = await admin.from("entitlements").select("id").eq("user_id", user.id).eq("plan_slug", "pro").eq("status", "active").lte("starts_at", now).gt("ends_at", now).limit(1).maybeSingle();
    if (entitlementError) throw entitlementError;
    if (!entitlement) throw new HttpError(403, "PRO_REQUIRED", "A current Pro pass is required to download study material PDFs.");
    const { data, error } = await admin.from("study_materials").select("id, title, word_count, read_minutes, content, subject:subjects(name)").eq("id", materialId).maybeSingle();
    if (error) throw error;
    const material = data as unknown as StudyMaterialRow | null;
    if (!material?.content) throw new HttpError(404, "STUDY_MATERIAL_NOT_FOUND", "That study material was not found.");
    const filename = material.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70) || material.id;
    return new Response(makePdf(material), { headers: { ...headers, "content-type": "application/pdf", "content-disposition": `attachment; filename="examify-${filename}.pdf"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    return errorResponse(error, headers ?? { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  }
});
