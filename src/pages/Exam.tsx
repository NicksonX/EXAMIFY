import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  startExam,
  submitExam,
  ExamError,
  type StartExamResponse,
  type ExamQuestion,
  type ExamMode,
  type AnswersMap,
} from "@/lib/exams";

type Phase = "loading" | "active" | "submitting" | "error";

interface StoredExam {
  attemptId: string;
  subjectId: string;
  mode: ExamMode;
  subjectName: string;
  questionCount: number;
  questions: ExamQuestion[];
  answers: AnswersMap;
  endsAt: number; // epoch ms
}

// One slot per subject + mode so a student can resume after a refresh,
// and starting a different subject does not wipe this one's progress.
function storageKey(subjectId: string, mode: ExamMode): string {
  return `examify:exam:${subjectId}:${mode}`;
}

function durationMinutesFor(count: number): number {
  // About one minute per question, with a sensible floor.
  return Math.max(10, count);
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

function loadStored(key: string): StoredExam | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredExam;
    if (
      !parsed ||
      !Array.isArray(parsed.questions) ||
      parsed.questions.length === 0 ||
      typeof parsed.endsAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(key: string, s: StoredExam): void {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    // Private mode or quota: answers still live in memory for this session.
  }
}

function clearStored(key: string | null): void {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

interface ConfirmModalProps {
  mode: "submit" | "exit";
  total: number;
  answeredCount: number;
  reduce: boolean | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmModal({
  mode,
  total,
  answeredCount,
  reduce,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const unanswered = Math.max(0, total - answeredCount);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-modal-title"
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-card sm:p-7"
      >
        {mode === "submit" ? (
          <>
            <h2
              id="exam-modal-title"
              className="font-display text-xl font-bold tracking-tight"
            >
              Submit your exam?
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              You have answered {answeredCount} of {total} questions.
              {unanswered > 0
                ? ` ${unanswered} ${unanswered === 1 ? "is" : "are"} still unanswered and will be marked wrong.`
                : " You have answered every question."}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="btn-secondary flex-1"
              >
                Keep going
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="btn-primary flex-1"
              >
                <CheckCircle2 size={16} aria-hidden /> Submit now
              </button>
            </div>
          </>
        ) : (
          <>
            <h2
              id="exam-modal-title"
              className="font-display text-xl font-bold tracking-tight"
            >
              Leave this exam?
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              You can return to finish before the timer runs out. If you start a
              different exam, this progress may be replaced.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="btn-secondary flex-1"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="btn-primary flex-1"
              >
                Leave
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

export function Exam() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reduce = useReducedMotion();

  const subjectId = searchParams.get("subject_id");
  const mode = (searchParams.get("mode") as ExamMode) || "full";
  const topicId = searchParams.get("topic_id");
  const countParam = searchParams.get("count");

  const [phase, setPhase] = useState<Phase>("loading");
  const [exam, setExam] = useState<StartExamResponse | null>(null);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [current, setCurrent] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "submit" | "exit">(null);

  const submittedRef = useRef(false);
  const answersRef = useRef<AnswersMap>({});
  const attemptIdRef = useRef<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const endsAtRef = useRef<number>(0);

  const questions = exam?.questions ?? [];
  const total = exam?.question_count ?? questions.length ?? 0;
  const q = questions[current];
  const answeredCount = questions.filter(
    (qq) => answers[qq.id] !== undefined
  ).length;

  // Keep refs in sync so the submit callback always reads fresh data.
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    attemptIdRef.current = exam?.attempt_id ?? null;
  }, [exam]);

  // Start (or resume) the exam on mount.
  useEffect(() => {
    if (!subjectId) {
      setErrorMsg(
        "This exam link is missing a subject. Pick one from your dashboard to start."
      );
      setPhase("error");
      return;
    }

    const key = storageKey(subjectId, mode);
    keyRef.current = key;

    const stored = loadStored(key);
    if (stored) {
      setExam({
        attempt_id: stored.attemptId,
        subject_id: stored.subjectId,
        subject_name: stored.subjectName,
        mode: stored.mode,
        question_count: stored.questionCount,
        questions: stored.questions,
      });
      setAnswers(stored.answers ?? {});
      setCurrent(0);
      endsAtRef.current = stored.endsAt;
      setSecondsLeft(Math.max(0, Math.round((stored.endsAt - Date.now()) / 1000)));
      setPhase("active");
      return;
    }

    const qCount = countParam ? Number(countParam) : undefined;
    const questionCount =
      qCount && Number.isFinite(qCount) && qCount > 0 ? qCount : undefined;

    let active = true;
    void (async () => {
      try {
        const resp = await startExam({
          subjectId,
          mode,
          topicId: topicId || null,
          questionCount,
        });
        if (!active) return;

        const endsAt = Date.now() + durationMinutesFor(resp.question_count) * 60_000;
        endsAtRef.current = endsAt;
        const storedExam: StoredExam = {
          attemptId: resp.attempt_id,
          subjectId,
          mode,
          subjectName: resp.subject_name,
          questionCount: resp.question_count,
          questions: resp.questions,
          answers: {},
          endsAt,
        };
        saveStored(key, storedExam);

        setExam(resp);
        setAnswers({});
        setCurrent(0);
        setSecondsLeft(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
        setPhase("active");
      } catch (e) {
        if (!active) return;
        if (e instanceof ExamError && (e.code === "FREE_LIMIT_REACHED" || e.code === "PLUS_LIMIT_REACHED")) {
          navigate("/upgrade", {
            replace: true,
            state: { reason: e.code === "PLUS_LIMIT_REACHED" ? "retake" : "free-limit" },
          });
          return;
        }
        if (e instanceof ExamError && e.code === "NO_QUESTIONS") {
          setErrorMsg(
            "There are no questions for this subject yet. We are adding more soon."
          );
        } else if (e instanceof ExamError && e.code === "SUBJECT_NOT_FOUND") {
          setErrorMsg("We could not find that subject. Pick another from your dashboard.");
        } else {
          setErrorMsg("We could not start your exam right now. Please try again.");
        }
        setPhase("error");
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, mode]);

  // Countdown ticker (runs only while the exam is active).
  useEffect(() => {
    if (phase !== "active") return;
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Latest submit handler, kept in a ref so effects read a fresh closure.
  const doSubmitRef = useRef<(auto: boolean) => Promise<void>>(async () => {});
  useEffect(() => {
    doSubmitRef.current = async (_auto: boolean) => {
      if (submittedRef.current) return;
      const attemptId = attemptIdRef.current;
      if (!attemptId) return;
      submittedRef.current = true;
      setSubmitError(null);
      setModal(null);
      setPhase("submitting");
      try {
        await submitExam(attemptId, answersRef.current);
        clearStored(keyRef.current);
        navigate(`/result/${attemptId}`, { replace: true });
      } catch (e) {
        submittedRef.current = false;
        if (e instanceof ExamError && e.code === "ALREADY_SUBMITTED") {
          clearStored(keyRef.current);
          navigate(`/result/${attemptId}`, { replace: true });
          return;
        }
        setPhase("active");
        setSubmitError(
          "We could not submit your exam. Please check your connection and try again."
        );
      }
    };
  });

  // Auto-submit when time runs out.
  useEffect(() => {
    if (phase === "active" && secondsLeft === 0) {
      void doSubmitRef.current(true);
    }
  }, [phase, secondsLeft]);

  // Document title for the exam environment.
  useEffect(() => {
    if (exam?.subject_name) {
      document.title = `${exam.subject_name} practice exam, Examify`;
    }
    return () => {
      document.title = "Examify";
    };
  }, [exam?.subject_name]);

  function selectAnswer(qid: string, optionIndex: number) {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: optionIndex };
      if (keyRef.current) {
        saveStored(keyRef.current, {
          attemptId: attemptIdRef.current ?? "",
          subjectId: subjectId ?? "",
          mode,
          subjectName: exam?.subject_name ?? "",
          questionCount: total,
          questions,
          answers: next,
          endsAt: endsAtRef.current,
        });
      }
      return next;
    });
  }

  function goPrev() {
    setCurrent((i) => Math.max(0, i - 1));
  }

  function goNext() {
    setCurrent((i) => Math.min(total - 1, i + 1));
  }

  // ----- Loading -----
  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-5">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden />
          <p className="font-display text-lg font-semibold">Preparing your exam</p>
          <p className="text-sm text-ink-soft">Loading questions and starting the timer.</p>
        </div>
      </div>
    );
  }

  // ----- Error -----
  if (phase === "error") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-700">
          <AlertTriangle size={26} aria-hidden />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
          We can't start this exam
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-soft">{errorMsg}</p>
        <Link to="/dashboard" className="btn-primary mt-6">
          Back to dashboard
        </Link>
      </div>
    );
  }

  // ----- Active / Submitting -----
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-5 sm:px-8">
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-ink">
              {exam?.subject_name ?? "Exam"}
            </p>
            <p className="text-xs text-ink-lighter">
              Question {current + 1} of {total}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums ${
                secondsLeft < 60 ? "bg-red-50 text-red-700" : "bg-ink/5 text-ink-soft"
              }`}
              aria-label={`Time remaining ${formatClock(secondsLeft)}`}
            >
              <Clock size={15} aria-hidden />
              {formatClock(secondsLeft)}
            </div>
            <button
              type="button"
              onClick={() => setModal("exit")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition hover:bg-ink/5"
              aria-label="Leave exam"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 pb-[10rem] pt-8 sm:px-8 sm:pb-8">
        {/* Progress */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs text-ink-soft">
            <span>
              {answeredCount} of {total} answered
            </span>
            <span>{total ? Math.round((answeredCount / total) * 100) : 0}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{
                width: `${total ? (answeredCount / total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {submitError && (
          <div
            className="status-error mb-4 flex items-start gap-2"
            role="alert"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{submitError}</span>
          </div>
        )}

        {/* Question card */}
        {q && (
          <motion.div
            key={q.id}
            initial={reduce ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="card p-6 sm:p-8"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Question {current + 1}
            </p>
            <h2 className="mt-3 font-display text-lg font-semibold leading-7 text-ink sm:text-xl">
              {q.stem}
            </h2>
            <div className="mt-6 grid gap-3">
              {q.options.map((opt, i) => {
                const selected = answers[q.id] === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectAnswer(q.id, i)}
                    aria-pressed={selected}
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                      selected
                        ? "border-accent bg-accent/5 ring-1 ring-accent"
                        : "border-line bg-surface hover:border-ink/20 hover:bg-ink/[0.02]"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        selected ? "bg-accent text-white" : "bg-ink/5 text-ink-soft"
                      }`}
                      aria-hidden
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="pt-0.5 text-sm leading-6 text-ink sm:text-base">
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Desktop actions */}
        <div className="mt-6 hidden items-center justify-between gap-3 sm:flex">
          <button type="button" onClick={goPrev} disabled={current === 0} className="btn-secondary"><ChevronLeft size={16} aria-hidden /> Previous</button>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setModal("submit")} className="btn-primary"><CheckCircle2 size={16} aria-hidden /> Submit</button>
            <button type="button" onClick={goNext} disabled={current >= total - 1} className="btn-secondary">Next <ChevronRight size={16} aria-hidden /></button>
          </div>
        </div>

        {/* Navigator */}
        <div className="mt-8 card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Question navigator</p>
            <p className="text-xs text-ink-lighter">{answeredCount} answered</p>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {questions.map((qq, i) => {
              const isCurrent = i === current;
              const isAnswered = answers[qq.id] !== undefined;
              return (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => setCurrent(i)}
                  aria-label={`Go to question ${i + 1}${isAnswered ? ", answered" : ", not answered"}`}
                  aria-current={isCurrent ? "true" : undefined}
                  className={`flex h-9 items-center justify-center rounded-lg text-sm font-semibold transition ${
                    isCurrent
                      ? "bg-accent text-white ring-2 ring-accent ring-offset-1 ring-offset-surface"
                      : isAnswered
                      ? "bg-accent/10 text-accent hover:bg-accent/20"
                      : "bg-ink/5 text-ink-soft hover:bg-ink/10"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-[auto_1fr_auto] items-center gap-2">
          <button type="button" onClick={goPrev} disabled={current === 0} className="btn-secondary h-11 w-11 px-0" aria-label="Previous question"><ChevronLeft size={19} aria-hidden /></button>
          <button type="button" onClick={() => setModal("submit")} className="btn-primary min-w-0"><CheckCircle2 size={16} aria-hidden /> Submit exam</button>
          <button type="button" onClick={goNext} disabled={current >= total - 1} className="btn-secondary h-11 w-11 px-0" aria-label="Next question"><ChevronRight size={19} aria-hidden /></button>
        </div>
      </div>

      {modal && (
        <ConfirmModal
          mode={modal}
          total={total}
          answeredCount={answeredCount}
          reduce={reduce}
          onCancel={() => setModal(null)}
          onConfirm={() => {
            if (modal === "exit") {
              setModal(null);
              navigate("/dashboard");
            } else {
              void doSubmitRef.current(false);
            }
          }}
        />
      )}

      {phase === "submitting" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface p-8 text-center shadow-card">
            <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden />
            <p className="font-display text-lg font-semibold">Submitting your exam</p>
            <p className="text-sm text-ink-soft">
              Calculating your score, grade and review.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
