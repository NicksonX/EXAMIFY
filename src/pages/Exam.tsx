import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Clock,
  ChevronRight,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  startExam,
  resumeExam,
  saveExamAnswer,
  advanceExamAttempt,
  submitExam,
  ExamError,
  type StartExamResponse,
  type ExamMode,
  type AnswersMap,
} from "@/lib/exams";

type Phase = "loading" | "active" | "submitting" | "error";

interface StoredExam {
  attemptId: string;
  subjectId: string;
  mode: ExamMode;
  topicId: string | null;
  protocolVersion: 2;
  questionIndex: number;
  questionId: string;
  selectedOption: number;
  progressVersion: number;
}

function storageKey(userId: string, subjectId: string, mode: ExamMode, topicId: string | null): string {
  return `examify:exam:${userId}:${subjectId}:${mode}:${topicId ?? "all"}`;
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
      typeof parsed.attemptId !== "string" ||
      typeof parsed.subjectId !== "string" ||
      parsed.protocolVersion !== 2 ||
      typeof parsed.questionIndex !== "number" ||
      typeof parsed.questionId !== "string" ||
      !Number.isInteger(parsed.selectedOption) ||
      parsed.selectedOption < 0 ||
      parsed.selectedOption > 3 ||
      !Number.isInteger(parsed.progressVersion) ||
      parsed.progressVersion < 0
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
  const { user } = useAuth();

  const subjectId = searchParams.get("subject_id");
  const modeParam = searchParams.get("mode") ?? "full";
  const mode: ExamMode | null = modeParam === "full" || modeParam === "topic" || modeParam === "lesson"
    ? modeParam
    : null;
  const topicId = searchParams.get("topic_id");
  const countParam = searchParams.get("count");

  const [phase, setPhase] = useState<Phase>("loading");
  const [exam, setExam] = useState<StartExamResponse | null>(null);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [current, setCurrent] = useState(0);
  const [progressVersion, setProgressVersion] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "submit" | "exit">(null);
  const [audioMuted, setAudioMuted] = useState(false);

  const submittedRef = useRef(false);
  const answersRef = useRef<AnswersMap>({});
  const progressVersionRef = useRef(0);
  const attemptIdRef = useRef<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const deadlineRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const questions = useMemo(() => exam?.questions ?? [], [exam?.questions]);
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
    progressVersionRef.current = progressVersion;
  }, [progressVersion]);

  useEffect(() => {
    attemptIdRef.current = exam?.attempt_id ?? null;
  }, [exam]);

  // Start or resume the server-owned attempt on mount.
  useEffect(() => {
    if (!user) return;
    if (!subjectId || !mode) {
      setErrorMsg("This exam link is invalid. Pick an exam from Practice to continue.");
      setPhase("error");
      return;
    }

    const key = storageKey(user.id, subjectId, mode, topicId);
    keyRef.current = key;
    const stored = loadStored(key);
    const qCount = countParam ? Number(countParam) : undefined;
    const questionCount = qCount && Number.isFinite(qCount) && qCount > 0 ? qCount : undefined;

    let active = true;
    void (async () => {
      try {
        let resp: StartExamResponse;
        if (stored) {
          try {
            resp = await resumeExam(stored.attemptId);
          } catch (resumeError) {
            if (!(resumeError instanceof ExamError && resumeError.code === "ATTEMPT_NOT_FOUND")) {
              throw resumeError;
            }
            clearStored(key);
            resp = await startExam({ subjectId, mode, topicId: topicId || null, questionCount });
          }
        } else {
          resp = await startExam({ subjectId, mode, topicId: topicId || null, questionCount });
        }
        if (!active) return;

        // A completed protocol-v2 attempt can be returned after the final
        // advance but before the client navigated away. Finalize it instead
        // of rendering the last question a second time.
        if (resp.current_question_index >= resp.question_count) {
          try {
            await submitExam(resp.attempt_id);
            if (active) navigate(`/result/${resp.attempt_id}`, { replace: true });
          } catch (submitError) {
            if (active) {
              setErrorMsg(
                submitError instanceof ExamError && submitError.code === "ALREADY_SUBMITTED"
                  ? "This exam is already complete. Open Results to review it."
                  : "We could not finish this exam. Please open Results and try again.",
              );
              setPhase("error");
            }
          }
          return;
        }

        const serverAnswers = resp.answers && typeof resp.answers === "object" ? resp.answers : {};
        const serverCurrent = Math.min(
          Math.max(0, resp.current_question_index),
          Math.max(0, resp.questions.length - 1),
        );
        const currentQuestion = resp.questions[serverCurrent];
        const pendingMatches = Boolean(
          stored
          && stored.attemptId === resp.attempt_id
          && stored.protocolVersion === resp.progress_protocol_version
          && stored.questionIndex === resp.current_question_index
          && stored.questionId === currentQuestion?.id
          && stored.progressVersion === resp.progress_version,
        );
        const nextAnswers = pendingMatches && currentQuestion && stored
          ? { ...serverAnswers, [currentQuestion.id]: stored.selectedOption }
          : serverAnswers;
        if (stored && !pendingMatches) clearStored(key);
        const deadline = Date.parse(resp.deadline_at);
        if (!Number.isFinite(deadline)) throw new Error("Invalid server deadline");

        deadlineRef.current = deadline;
        progressVersionRef.current = resp.progress_version;
        setExam(resp);
        setAnswers(nextAnswers);
        setProgressVersion(resp.progress_version);
        setCurrent(serverCurrent);
        setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
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
          setErrorMsg("There are no questions for this subject yet. We are adding more soon.");
        } else if (e instanceof ExamError && e.code === "SUBJECT_NOT_FOUND") {
          setErrorMsg("We could not find that subject. Pick another from Practice.");
        } else if (e instanceof ExamError && e.code === "TOPIC_NOT_FOUND") {
          setErrorMsg("That topic is not available for the selected subject.");
        } else if (e instanceof ExamError && e.code === "LEGACY_ATTEMPT") {
          setErrorMsg("This earlier attempt uses an older exam format and cannot be resumed securely. Start a new practice exam instead.");
        } else if (e instanceof ExamError && e.code === "ATTEMPT_EXPIRED") {
          setErrorMsg("This attempt has expired. Start a new practice exam to continue.");
        } else {
          setErrorMsg("We could not prepare this exam right now. Please try again.");
        }
        setPhase("error");
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, subjectId, mode, topicId]);

  // The server deadline is authoritative; this clock is presentation only.
  useEffect(() => {
    if (phase !== "active") return;
    const updateClock = () => {
      setSecondsLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Prevent browser back navigation while an attempt is active.
  useEffect(() => {
    if (phase !== "active") return;
    const state = { examifyExam: true };
    window.history.pushState(state, "", window.location.href);
    const preventBack = () => window.history.pushState(state, "", window.location.href);
    window.addEventListener("popstate", preventBack);
    return () => window.removeEventListener("popstate", preventBack);
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
        const currentQuestion = questions[current];
        if (currentQuestion && exam?.progress_protocol_version === 2 && current < total) {
          const selectedOption = answersRef.current[currentQuestion.id] ?? null;
          try {
            const saved = await saveExamAnswer({
              attemptId,
              questionIndex: current,
              questionId: currentQuestion.id,
              selectedOption,
              progressVersion: progressVersionRef.current,
            });
            progressVersionRef.current = saved.progress_version;
            setProgressVersion(saved.progress_version);
          } catch (saveError) {
            if (!(saveError instanceof ExamError && saveError.code === "ATTEMPT_EXPIRED")) throw saveError;
          }
        }
        await submitExam(attemptId);
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

  // Keep only a bounded recovery item locally. The server-owned save happens
  // immediately before advancing, so a debounced save cannot race the
  // optimistic-concurrency boundary used by advance_exam_attempt.
  useEffect(() => {
    if (phase !== "active" || !exam || exam.progress_protocol_version !== 2 || !mode || !subjectId || !keyRef.current) return;
    const question = questions[current];
    const selectedOption = question ? answers[question.id] : undefined;
    if (!question || selectedOption === undefined) {
      clearStored(keyRef.current);
      return;
    }

    saveStored(keyRef.current, {
      attemptId: exam.attempt_id,
      subjectId,
      mode,
      topicId,
      protocolVersion: exam.progress_protocol_version,
      questionIndex: current,
      questionId: question.id,
      selectedOption,
      progressVersion,
    });
  }, [answers, current, exam, mode, phase, progressVersion, questions, subjectId, topicId]);

  function selectAnswer(qid: string, optionIndex: number) {
    if (qid !== q?.id || transitioning || optionIndex < 0 || optionIndex > 3) return;
    setAnswers((prev) => ({ ...prev, [qid]: optionIndex }));
  }

  async function playNextBeep() {
    if (audioMuted || typeof window === "undefined" || !window.AudioContext) return;
    const context = audioContextRef.current ?? new window.AudioContext();
    audioContextRef.current = context;
    try {
      if (context.state === "suspended") await context.resume();
    } catch {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.11);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
  }

  function actionErrorMessage(error: unknown): string {
    if (!(error instanceof ExamError)) {
      return "We could not save this answer. Check your connection and try again.";
    }
    if (error.code === "ATTEMPT_EXPIRED") {
      return "Time has expired. Your exam will be submitted automatically.";
    }
    if (error.code === "PROGRESS_STALE") {
      return "This exam changed in another tab. Refresh the page to continue safely.";
    }
    if (error.code === "LEGACY_ATTEMPT") {
      return "This attempt uses the retired exam protocol. Start a new exam from Practice.";
    }
    if (error.code === "UNKNOWN") {
      return "The exam server is missing the current answer-save update. Ask the administrator to apply the latest objective-exam database migration.";
    }
    return "We could not save this answer. Check your connection and try again.";
  }

  async function goNext() {
    if (!exam || !q || current >= total || transitioning) return;
    setTransitioning(true);
    setSubmitError(null);
    try {
      // Save and advance sequentially. Both calls use the same server version;
      // this avoids a background save racing the optimistic-concurrency check.
      const saved = await saveExamAnswer({
        attemptId: exam.attempt_id,
        questionIndex: current,
        questionId: q.id,
        selectedOption: answers[q.id] ?? null,
        progressVersion: progressVersionRef.current,
      });
      progressVersionRef.current = saved.progress_version;
      setProgressVersion(saved.progress_version);
      const advanced = await advanceExamAttempt({
        attemptId: exam.attempt_id,
        questionIndex: current,
        questionId: q.id,
        selectedOption: answers[q.id] ?? null,
        progressVersion: saved.progress_version,
      });
      progressVersionRef.current = advanced.progress_version;
      setProgressVersion(advanced.progress_version);
      clearStored(keyRef.current);
      void playNextBeep();
      if (advanced.current_question_index >= total) {
        void doSubmitRef.current(false);
      } else {
        setCurrent(advanced.current_question_index);
      }
    } catch (error) {
      if (error instanceof ExamError && error.code === "ATTEMPT_EXPIRED") {
        setSecondsLeft(0);
      } else {
        setSubmitError(actionErrorMessage(error));
      }
    } finally {
      setTransitioning(false);
    }
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
              onClick={() => setAudioMuted((muted) => !muted)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition hover:bg-ink/5"
              aria-label={audioMuted ? "Unmute next-question sound" : "Mute next-question sound"}
              aria-pressed={audioMuted}
            >
              {audioMuted ? <VolumeX size={17} aria-hidden /> : <Volume2 size={17} aria-hidden />}
            </button>
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
                    disabled={transitioning}
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
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setModal("submit")} disabled={transitioning} className="btn-primary"><CheckCircle2 size={16} aria-hidden /> Submit</button>
            <button type="button" onClick={() => void goNext()} disabled={transitioning || current >= total} className="btn-secondary">{current >= total - 1 ? "Finish" : "Next"} <ChevronRight size={16} aria-hidden /></button>
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
                <span
                  key={qq.id}
                  aria-label={`Question ${i + 1}${isCurrent ? ", current" : isAnswered ? ", answered" : ", remaining"}`}
                  aria-current={isCurrent ? "true" : undefined}
                  className={`flex h-9 items-center justify-center rounded-lg text-sm font-semibold ${
                    isCurrent
                      ? "bg-accent text-white ring-2 ring-accent ring-offset-1 ring-offset-surface"
                      : i < current
                      ? "bg-ink/10 text-ink-lighter"
                      : isAnswered
                      ? "bg-accent/10 text-accent"
                      : "bg-ink/5 text-ink-soft"
                  }`}
                >
                  {i + 1}
                </span>
              );
            })}
          </div>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-[1fr_auto] items-center gap-2">
          <button type="button" onClick={() => setModal("submit")} disabled={transitioning} className="btn-primary min-w-0"><CheckCircle2 size={16} aria-hidden /> Submit exam</button>
          <button type="button" onClick={() => void goNext()} disabled={transitioning || current >= total} className="btn-secondary h-11 w-11 px-0" aria-label={current >= total - 1 ? "Finish exam" : "Next question"}><ChevronRight size={19} aria-hidden /></button>
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
