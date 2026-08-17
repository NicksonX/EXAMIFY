import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  GraduationCap,
  Download,
  Loader2,
  AlertTriangle,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { fetchAttempt, type ExamAttempt, type ReviewItem } from "@/lib/exams";
import {
  downloadResultPdf,
  formatDuration,
  getMyEntitlement,
  gradeStyle,
  remarkForGrade,
  type EntitlementInfo,
} from "@/lib/premium";

type LoadState = "loading" | "ready" | "error";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function formatDate(iso: string | null): string {
  if (!iso) return "Not recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not recorded";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Result() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const reduce = useReducedMotion();

  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [entitlement, setEntitlement] = useState<EntitlementInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const requestId = useRef(0);

  const studentName: string =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    "Student";

  const loadAttempt = useCallback(async () => {
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      setAttempt(null);
      setErrorMsg("This result link is invalid.");
      setState("error");
      return;
    }
    const currentRequest = ++requestId.current;
    setState("loading");
    setErrorMsg("");
    try {
      const nextAttempt = await fetchAttempt(id);
      if (currentRequest !== requestId.current) return;
      if (!nextAttempt) {
        setAttempt(null);
        setErrorMsg("We couldn't find this result. It may have been removed or you may not have access to it.");
        setState("error");
        return;
      }
      setAttempt(nextAttempt);
      setState("ready");
    } catch {
      if (currentRequest !== requestId.current) return;
      setErrorMsg("We couldn't load this result right now. Check your connection and try again.");
      setState("error");
    }
  }, [id]);

  // The attempt is always re-read under the current authenticated user's RLS scope.
  useEffect(() => {
    void loadAttempt();
    return () => { requestId.current += 1; };
  }, [loadAttempt]);

  // Presentation uses the live server-issued entitlement. The exam and PDF
  // functions enforce the same capability again at their trusted boundary.
  useEffect(() => {
    let active = true;
    void getMyEntitlement().then((current) => {
      if (active) setEntitlement(current);
    }).catch(() => {
      if (active) setEntitlement(null);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.title = attempt
      ? `Result - ${attempt.subject?.name ?? "Exam"} - Examify`
      : "Result - Examify";
  }, [attempt]);

  async function handleDownload() {
    if (!entitlement?.canDownloadResults) {
      navigate("/upgrade", { state: { reason: "download-result" } });
      return;
    }
    if (!attempt) return;
    setDownloading(true);
    try {
      const pdf = await downloadResultPdf(attempt.id);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = `examify-practice-result-${attempt.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      navigate("/upgrade", { state: { reason: "download-result" } });
    } finally {
      setDownloading(false);
    }
  }

  function handleRetake() {
    if (!entitlement?.canTakeExam) {
      navigate("/upgrade", { state: { reason: "retake" } });
      return;
    }
    if (!attempt?.subject_id) return;
    const params = new URLSearchParams({
      subject_id: attempt.subject_id,
      mode: attempt.mode,
    });
    if (attempt.topic_id) params.set("topic_id", attempt.topic_id);
    navigate(`/exam?${params.toString()}`);
  }

  // ---- Loading ----
  if (state === "loading") {
    return (
        <div className="flex min-h-[60vh] items-center justify-center px-5">
          <div className="flex flex-col items-center gap-3 text-ink-soft">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="text-sm">Loading your result sheet...</p>
          </div>
        </div>
    );
  }

  // ---- Error ----
  if (state === "error" || !attempt) {
    return (
        <div className="editorial-page-narrow">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
              <AlertTriangle size={26} />
            </div>
            <h1 className="font-display text-2xl font-bold text-ink">
              We can't show this result
            </h1>
            <p className="text-sm leading-6 text-ink-soft" role="alert">{errorMsg}</p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => void loadAttempt()} className="editorial-button-primary">
                <RotateCcw size={16} /> Try again
              </button>
              <Link to="/dashboard" className="editorial-button-secondary">
                <ArrowLeft size={16} /> Back to dashboard
              </Link>
            </div>
          </div>
        </div>
    );
  }

  // ---- Not yet submitted ----
  if (!attempt.ended_at) {
    return (
        <div className="editorial-page-narrow">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold">
              <Clock size={26} />
            </div>
            <h1 className="font-display text-2xl font-bold text-ink">
              This exam hasn't been submitted
            </h1>
            <p className="text-sm leading-6 text-ink-soft">
              Your result sheet appears once the exam is submitted and scored. If
              you closed the exam by accident, you can resume it from your
              dashboard.
            </p>
            <Link to="/dashboard" className="editorial-button-primary mt-2">
              <ArrowLeft size={16} /> Back to dashboard
            </Link>
          </div>
        </div>
    );
  }

  const subjectName = attempt.subject?.name ?? "Examify Practice Exam";
  const subjectCode = attempt.subject?.code ?? null;
  const grade = attempt.grade;
  const style = gradeStyle(grade);
  const remark = remarkForGrade(grade);
  const correct = attempt.score;
  const wrong = Math.max(0, attempt.total - attempt.score);
  const pct = Math.round(attempt.percentage);
  const timeTaken = formatDuration(attempt.duration_seconds ?? 0);
  const endedDate = formatDate(attempt.ended_at);
  const endedTime = formatTime(attempt.ended_at);
  const shortId = attempt.id.replace(/-/g, "").slice(0, 8).toUpperCase();

  return (
      <div className="editorial-page max-w-3xl">
        {/* Action toolbar (never printed) */}
        <div className="no-print mb-8 flex flex-col gap-3 border-b border-[#14274a]/15 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/dashboard" className="editorial-text-link inline-flex items-center gap-2"><ArrowLeft size={16} /> Back to dashboard</Link>
          <div className="grid w-full gap-3 sm:flex sm:w-auto">
            <button type="button" onClick={handleRetake} className="editorial-button-secondary w-full sm:w-auto"><RotateCcw size={16} /> Retake exam</button>
            <button type="button" onClick={() => void handleDownload()} disabled={downloading} className="editorial-button-primary w-full disabled:cursor-wait disabled:opacity-60 sm:w-auto"><Download size={16} /> {downloading ? "Preparing PDF…" : "Download PDF"}</button>
          </div>
        </div>

        {/* Certificate sheet */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="print-area"
        >
          <div className="editorial-result-sheet overflow-hidden">
            {/* Top accent band */}
            <div className="h-1.5 w-full bg-[#ce4040]" />

            <div className="px-6 py-8 sm:px-10 sm:py-10">
              {/* Wordmark */}
              <div className="flex flex-col items-center text-center">
                <div className="flex items-center gap-2 text-ink">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[2px] bg-[#14274a] text-white"><GraduationCap size={22} /></span>
                  <span className="editorial-wordmark text-3xl">Exam<span>i</span>fy</span>
                </div>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#34507c]">Computer-Based Testing &amp; Learning</p>
              </div>

              <div className="mx-auto mt-6 h-px w-40 bg-line" />

              {/* Title */}
              <div className="mt-6 text-center">
                <p className="editorial-kicker">Practice Result Sheet</p>
                <h1 className="font-editorial-display mt-5 text-4xl font-semibold tracking-[-0.06em] text-[#14274a] sm:text-5xl">Practice Completion Record</h1>
              </div>

              {/* Student + exam */}
              <div className="mt-8 text-center">
                <p className="text-sm text-ink-soft">This certifies that</p>
                <p className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
                  {studentName}
                </p>
                <p className="mt-3 text-sm text-ink-soft">has completed</p>
                <p className="mt-1 font-display text-lg font-semibold text-ink">
                  {subjectName}
                  {subjectCode ? (
                    <span className="ml-2 text-sm font-medium text-ink-lighter">
                      ({subjectCode})
                    </span>
                  ) : null}
                </p>
              </div>

              {/* Meta grid */}
              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MetaTile icon={Calendar} label="Date" value={endedDate} sub={endedTime || undefined} />
                <MetaTile icon={Clock} label="Time taken" value={timeTaken} />
                <MetaTile
                  icon={Award}
                  label="Questions"
                  value={`${attempt.question_count}`}
                  sub={`${attempt.mode === "full" ? "Full exam" : attempt.mode === "topic" ? "Topic set" : "Lesson set"}`}
                />
              </div>

              {/* Score hero */}
              <div className="mt-8 rounded-2xl border border-line bg-canvas px-6 py-7 text-center">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-8">
                  <div>
                    <p className="font-display text-5xl font-extrabold leading-none text-ink">
                      {pct}
                      <span className="text-2xl font-bold text-ink-soft">%</span>
                    </p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wider text-ink-lighter">
                      Score
                    </p>
                  </div>
                  <div className="hidden h-12 w-px bg-line sm:block" />
                  <div className="flex flex-col items-center">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-5 py-2 font-display text-2xl font-extrabold ring-2 ${style.text} ${style.bg} ${style.ring}`}
                    >
                      {grade ?? "Pending"}
                    </span>
                    <p className="mt-2 text-sm font-semibold text-ink">{remark}</p>
                  </div>
                </div>

                <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3">
                  <StatBox label="Total" value={`${attempt.total}`} />
                  <StatBox label="Correct" value={`${correct}`} tone="success" />
                  <StatBox label="Wrong" value={`${wrong}`} tone="accent" />
                </div>
              </div>

              {/* Signature */}
              <div className="mt-10 flex flex-col items-center justify-between gap-6 sm:flex-row">
                <div className="text-center sm:text-left">
                  <p className="font-display text-base font-semibold italic text-ink">
                    Examify
                  </p>
                  <div className="mt-1 h-px w-40 bg-ink/20" />
                  <p className="mt-1 text-xs text-ink-lighter">
                    Automated scoring system
                  </p>
                </div>
                <div className="text-center">
                  <p className="font-display text-base font-semibold text-ink">
                    {endedDate}
                  </p>
                  <div className="mt-1 h-px w-40 bg-ink/20" />
                  <p className="mt-1 text-xs text-ink-lighter">Date issued</p>
                </div>
              </div>

              {/* Verification footnote */}
              <p className="mt-8 text-center text-[11px] text-ink-lighter">
                Result ID: <span className="font-mono">{shortId}</span>
                &nbsp;|&nbsp; Generated by Examify
              </p>
            </div>
          </div>
        </motion.div>

        {/* Review answers (never printed) */}
        {attempt.review && attempt.review.length > 0 ? (
          <div className="no-print mt-8">
            <details className="card group">
              <summary className="faq-summary">
                <span className="flex items-center gap-2">
                  <ChevronDown
                    size={18}
                    className="text-ink-soft transition-transform duration-200 group-open:rotate-180"
                  />
                  Review answers ({attempt.review.length})
                </span>
                <span className="text-xs font-normal text-ink-lighter">
                  {correct} of {attempt.total} correct
                </span>
              </summary>
              <div className="border-t border-line px-5 py-5 sm:px-6">
                <ol className="space-y-6">
                  {attempt.review.map((item, i) => (
                    <ReviewCard key={item.id} index={i + 1} item={item} />
                  ))}
                </ol>
              </div>
            </details>
          </div>
        ) : null}
      </div>
  );
}

function MetaTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-canvas px-4 py-3 text-center sm:text-left">
      <div className="flex items-center justify-center gap-2 text-ink-lighter sm:justify-start">
        <Icon size={14} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="mt-1 font-display text-base font-semibold text-ink">{value}</p>
      {sub ? <p className="text-xs text-ink-lighter">{sub}</p> : null}
    </div>
  );
}

function StatBox({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "accent";
}) {
  const tones: Record<string, string> = {
    neutral: "text-ink",
    success: "text-success",
    accent: "text-accent",
  };
  return (
    <div className="rounded-xl bg-surface px-3 py-3 ring-1 ring-line">
      <p className={`font-display text-xl font-bold ${tones[tone]}`}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-lighter">
        {label}
      </p>
    </div>
  );
}

function ReviewCard({ index, item }: { index: number; item: ReviewItem }) {
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            item.is_correct
              ? "bg-success-soft text-success"
              : "bg-accent-soft text-accent"
          }`}
        >
          {item.is_correct ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-lighter">
            Question {index}
          </p>
          <p className="mt-1 text-sm font-medium leading-6 text-ink">{item.stem}</p>

          <ul className="mt-3 space-y-2">
            {item.options.map((opt, oi) => {
              const isCorrect = oi === item.correct_index;
              const isSelected = oi === item.selected;
              let cls = "border-line bg-canvas text-ink-soft";
              if (isCorrect) {
                cls = "border-success/40 bg-success-soft text-ink";
              } else if (isSelected && !isCorrect) {
                cls = "border-accent/40 bg-accent-soft text-ink";
              }
              return (
                <li
                  key={oi}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`}
                >
                  <span className="font-semibold">{LETTERS[oi] ?? oi + 1}.</span>
                  <span className="flex-1">{opt}</span>
                  {isCorrect ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />
                  ) : null}
                  {isSelected && !isCorrect ? (
                    <XCircle size={15} className="mt-0.5 shrink-0 text-accent" />
                  ) : null}
                </li>
              );
            })}
          </ul>

          {item.explanation ? (
            <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs leading-5 text-ink-soft">
              <span className="font-semibold text-ink">Explanation: </span>
              {item.explanation}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
