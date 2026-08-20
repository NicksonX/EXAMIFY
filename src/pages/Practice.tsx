import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, BookOpenCheck, ChevronDown, Loader2, ListFilter, RotateCcw } from "lucide-react";
import { SubjectBrowser } from "@/components/SubjectBrowser";
import { fetchSubject, fetchTopics, listOpenExamAttempts, type OpenExamAttempt, type Subject, type Topic } from "@/lib/exams";

export function Practice() {
  const [searchParams] = useSearchParams();
  const selectedSubjectId = searchParams.get("subject_id");
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedSubjectState, setSelectedSubjectState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [openAttempts, setOpenAttempts] = useState<OpenExamAttempt[]>([]);
  const [openAttemptsState, setOpenAttemptsState] = useState<"loading" | "ready" | "error">("loading");
  const [openAttemptsReload, setOpenAttemptsReload] = useState(0);

  useEffect(() => {
    document.title = "Practice exams - Examify";
  }, []);

  useEffect(() => {
    let active = true;
    setOpenAttemptsState("loading");
    void listOpenExamAttempts()
      .then((attempts) => {
        if (!active) return;
        setOpenAttempts(attempts.filter((attempt) => !attempt.expired));
        setOpenAttemptsState("ready");
      })
      .catch(() => {
        if (active) setOpenAttemptsState("error");
      });
    return () => {
      active = false;
    };
  }, [openAttemptsReload]);

  useEffect(() => {
    if (!selectedSubjectId) {
      setSelectedSubject(null);
      setSelectedSubjectState("idle");
      return;
    }
    let active = true;
    setSelectedSubjectState("loading");
    void fetchSubject(selectedSubjectId)
      .then((subject) => {
        if (!active) return;
        setSelectedSubject(subject);
        setSelectedSubjectState(subject ? "ready" : "error");
      })
      .catch(() => {
        if (!active) return;
        setSelectedSubject(null);
        setSelectedSubjectState("error");
      });
    return () => {
      active = false;
    };
  }, [selectedSubjectId]);

  return (
    <div className="workspace-page">
      <header className="workspace-page-heading">
        <div>
          <p className="eyebrow">Practice centre</p>
          <h1 className="workspace-title mt-2">Choose what to practise</h1>
          <p className="workspace-subtitle">
            Start an objective CBT, focus on one topic, or open study materials before your exam.
          </p>
        </div>
        <Link to="/dashboard" className="btn-secondary w-full sm:w-auto">
          Back to dashboard
        </Link>
      </header>

      <OpenAttempts
        attempts={openAttempts}
        state={openAttemptsState}
        onRetry={() => setOpenAttemptsReload((value) => value + 1)}
      />

      {selectedSubjectId ? (
        <section className="mt-5 border-y border-accent/20 bg-accent/[0.04] p-5 sm:p-6" aria-live="polite">
          {selectedSubjectState === "loading" ? (
            <p className="flex items-center gap-2 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Loading selected subject...</p>
          ) : selectedSubject ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow">Selected from your dashboard</p>
                <h2 className="mt-1 font-editorial-display text-2xl font-semibold tracking-[-0.04em] text-ink">{selectedSubject.name}</h2>
                <p className="mt-1 text-sm text-ink-soft">Choose a full exam, topic practice, or the available study materials.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to={`/exam?subject_id=${encodeURIComponent(selectedSubject.id)}&mode=full&count=40`} className="btn-primary px-3 py-2.5 text-xs"><ArrowRight size={14} aria-hidden />Start full exam</Link>
                <Link to={`/study?subject_id=${encodeURIComponent(selectedSubject.id)}`} className="btn-secondary px-3 py-2.5 text-xs"><BookOpenCheck size={14} aria-hidden />Study materials</Link>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-red-700"><AlertTriangle size={16} aria-hidden />That subject is no longer available. Choose another subject below.</p>
          )}
        </section>
      ) : null}

      <section className="mt-5 border-y border-[#14274a]/15 bg-[#fffdfa]/70 p-5 sm:p-6" aria-label="Practice guidance">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] bg-[#14274a] text-white">
            <BookOpenCheck size={19} aria-hidden />
          </span>
          <div>
            <h2 className="font-editorial-display text-2xl font-semibold tracking-[-0.04em] text-[#14274a]">
              Move through your exam one question at a time
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#34507c]">
              Your answers are saved through the exam service while you work. Follow the instructions on the exam screen before moving forward.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-5 surface-panel p-4 sm:p-6">
        <SubjectBrowser
          heading="Subjects and courses"
          actions={(subject) => <PracticeActions subject={subject} />}
        />
      </section>
    </div>
  );
}

function OpenAttempts({
  attempts,
  state,
  onRetry,
}: {
  attempts: OpenExamAttempt[];
  state: "loading" | "ready" | "error";
  onRetry: () => void;
}) {
  if (state === "loading") {
    return <section className="mt-5 surface-panel p-5" aria-label="Loading unfinished exams"><p className="flex items-center gap-2 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Checking unfinished exams...</p></section>;
  }
  if (state === "error") {
    return <section className="status-error mt-5 flex items-center justify-between gap-3" role="alert"><span>We couldn't check unfinished exams.</span><button type="button" onClick={onRetry} className="font-bold underline">Try again</button></section>;
  }
  if (attempts.length === 0) return null;
  return (
    <section className="mt-5 border-y border-[#14274a]/15 bg-[#fffdfa]/70 p-5 sm:p-6" aria-labelledby="continue-practice-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Continue learning</p>
          <h2 id="continue-practice-heading" className="mt-1 font-editorial-display text-2xl font-semibold tracking-[-0.04em] text-ink">Unfinished practice</h2>
        </div>
        <span className="text-xs text-ink-lighter">{attempts.length} open {attempts.length === 1 ? "attempt" : "attempts"}</span>
      </div>
      <ul className="mt-4 divide-y divide-[#14274a]/10">
        {attempts.map((attempt) => {
          const params = new URLSearchParams({ subject_id: attempt.subject_id, mode: attempt.mode });
          if (attempt.topic_id) params.set("topic_id", attempt.topic_id);
          const question = Math.min(attempt.question_count, attempt.current_question_index + 1);
          return <li key={attempt.attempt_id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-ink">{attempt.subject_name ?? "Practice exam"}</p><p className="mt-0.5 text-xs text-ink-soft">Question {question} of {attempt.question_count}</p></div><Link to={`/exam?${params.toString()}`} className="btn-secondary shrink-0 px-3 py-2 text-xs"><ArrowRight size={14} aria-hidden />Resume</Link></li>;
        })}
      </ul>
    </section>
  );
}

function PracticeActions({ subject }: { subject: Subject }) {
  return (
    <div className="space-y-2">
      <Link
        to={`/exam?subject_id=${encodeURIComponent(subject.id)}&mode=full&count=40`}
        className="btn-primary w-full px-3 py-2.5 text-xs"
      >
        <ArrowRight size={14} aria-hidden /> Start full exam
      </Link>
      <Link
        to={`/study?subject_id=${encodeURIComponent(subject.id)}`}
        className="btn-secondary w-full px-3 py-2.5 text-xs"
      >
        <BookOpenCheck size={14} aria-hidden /> Study materials
      </Link>
      <TopicPractice subject={subject} />
    </div>
  );
}

function TopicPractice({ subject }: { subject: Subject }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(false);
    void fetchTopics(subject.id)
      .then((result) => {
        if (active) setTopics(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, reloadKey, subject.id]);

  return (
    <div className="border-t border-line pt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-1 py-2 text-xs font-extrabold text-ink-soft hover:text-accent"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5"><ListFilter size={14} aria-hidden /> Practise by topic</span>
        <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="mt-1 space-y-1" aria-live="polite">
          {loading ? <p className="flex items-center gap-2 px-1 py-2 text-xs text-ink-lighter"><Loader2 size={13} className="animate-spin" /> Loading topics...</p> : null}
          {error ? (
            <div className="flex items-center justify-between gap-2 px-1 py-2 text-xs text-red-700">
              <span>Topics are unavailable right now.</span>
              <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="inline-flex items-center gap-1 font-bold underline"><RotateCcw size={12} aria-hidden />Retry</button>
            </div>
          ) : null}
          {!loading && !error && topics.length === 0 ? <p className="px-1 py-2 text-xs text-ink-lighter">No topics published yet.</p> : null}
          {topics.map((topic) => (
            <Link
              key={topic.id}
              to={`/exam?subject_id=${encodeURIComponent(subject.id)}&mode=topic&topic_id=${encodeURIComponent(topic.id)}&count=20`}
              className="block rounded-lg px-2 py-2 text-xs font-semibold text-ink-soft hover:bg-canvas hover:text-accent"
            >
              {topic.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
