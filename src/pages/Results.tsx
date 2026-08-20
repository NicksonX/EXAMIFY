import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchAllSubjects, fetchAttemptHistory, type ExamAttempt, type ExamMode, type Subject } from "@/lib/exams";
import { fetchAssessmentResults, type AssessmentResult } from "@/lib/assessments";
import { gradeStyle as premiumGradeStyle, remarkForGrade } from "@/lib/premium";

type LoadStatus = "loading" | "ready" | "error";

export function Results() {
  const [rows, setRows] = useState<ExamAttempt[]>([]);
  const [assessmentRows, setAssessmentRows] = useState<AssessmentResult[]>([]);
  const [assessmentStatus, setAssessmentStatus] = useState<LoadStatus>("loading");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [mode, setMode] = useState<"" | ExamMode>("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [assessmentReloadKey, setAssessmentReloadKey] = useState(0);
  const requestId = useRef(0);
  const pageSize = 20;

  useEffect(() => {
    document.title = "Results - Examify";
    void fetchAllSubjects().then(setSubjects).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    setAssessmentStatus("loading");
    void fetchAssessmentResults()
      .then((result) => {
        if (!active) return;
        setAssessmentRows(result);
        setAssessmentStatus("ready");
      })
      .catch(() => {
        if (active) setAssessmentStatus("error");
      });
    return () => {
      active = false;
    };
  }, [assessmentReloadKey]);

  useEffect(() => {
    const request = ++requestId.current;
    let active = true;
    setStatus("loading");
    void fetchAttemptHistory({ page, pageSize, subjectId: subjectId || undefined, mode: mode || undefined })
      .then((result) => {
        if (!active || request !== requestId.current) return;
        setRows(result.rows);
        setTotal(result.total);
        setStatus("ready");
      })
      .catch(() => {
        if (active && request === requestId.current) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [mode, page, reloadKey, subjectId]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const retry = () => setReloadKey((value) => value + 1);
  const retryAssessments = () => setAssessmentReloadKey((value) => value + 1);

  function changeFilter(setter: (value: string) => void, value: string) {
    setPage(0);
    setter(value);
  }

  return (
    <div className="workspace-page">
      <header className="workspace-page-heading">
        <div>
          <p className="eyebrow">Your records</p>
          <h1 className="workspace-title mt-2">Results history</h1>
          <p className="workspace-subtitle">Review completed practice and examination attempts in one place.</p>
        </div>
        <Link to="/dashboard" className="btn-secondary w-full sm:w-auto"><ArrowLeft size={16} aria-hidden /> Dashboard</Link>
      </header>

      <section className="mt-5 surface-panel p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Subject</span>
            <select value={subjectId} onChange={(event) => changeFilter(setSubjectId, event.target.value)} className="field-control mt-1.5">
              <option value="">All subjects</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Assessment type</span>
            <select value={mode} onChange={(event) => { setPage(0); setMode(event.target.value as "" | ExamMode); }} className="field-control mt-1.5">
              <option value="">All types</option>
              <option value="full">Full exam</option>
              <option value="topic">Topic practice</option>
              <option value="lesson">Lesson practice</option>
            </select>
          </label>
        </div>

        {assessmentStatus === "loading" ? <div className="mt-5 text-sm text-ink-soft">Loading main assessment records...</div> : null}
        {assessmentStatus === "error" ? <div className="status-error mt-5 flex items-center gap-2" role="alert"><span>We couldn't load your main assessment records.</span><button type="button" onClick={retryAssessments} className="font-bold underline">Try again</button></div> : null}
        {assessmentStatus === "ready" && assessmentRows.length > 0 ? <AssessmentResults rows={assessmentRows} /> : null}

        <p className="mt-5 text-xs text-ink-lighter">The filters and pagination below apply to objective practice history.</p>
        {status === "loading" ? <ResultSkeleton /> : null}
        {status === "error" ? (
          <div className="status-error mt-5 flex items-center gap-2" role="alert">
            <AlertTriangle size={16} aria-hidden />
            <span>We couldn't load your results.</span>
            <button type="button" onClick={retry} className="font-bold underline">Try again</button>
          </div>
        ) : null}
        {status === "ready" && rows.length === 0 ? <div className="status-empty mt-5">No completed results match these filters.</div> : null}
        {status === "ready" && rows.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-lighter"><tr><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Score</th><th className="px-3 py-3">Date</th><th className="px-3 py-3" /></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((attempt) => <ResultRow key={attempt.id} attempt={attempt} />)}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm">
          <span className="text-ink-soft">{total === 0 ? "No results" : `Page ${page + 1} of ${pageCount}`}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 0 || status === "loading"} onClick={() => setPage((value) => Math.max(0, value - 1))} className="btn-secondary h-10 w-10 px-0" aria-label="Previous results"><ChevronLeft size={17} aria-hidden /></button>
            <button type="button" disabled={page + 1 >= pageCount || status === "loading"} onClick={() => setPage((value) => value + 1)} className="btn-secondary h-10 w-10 px-0" aria-label="Next results"><ChevronRight size={17} aria-hidden /></button>
          </div>
        </div>
      </section>
    </div>
  );
}

function AssessmentResults({ rows }: { rows: AssessmentResult[] }) {
  return (
    <section className="mb-6 border-y border-accent/20 bg-accent/[0.04] p-5" aria-labelledby="main-results-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Published assessment records</p>
          <h2 id="main-results-heading" className="mt-1 font-display text-xl font-bold text-ink">Assessment results</h2>
        </div>
        <span className="text-xs font-semibold text-ink-lighter">{rows.length} record{rows.length === 1 ? "" : "s"}</span>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((result) => {
          const pending = result.status === "pending_review";
          return <div key={result.id} className="flex flex-col gap-3 border-t border-accent/15 pt-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-ink">{result.title}</p><p className="mt-1 text-xs text-ink-soft">{result.purpose === "main" ? "Main" : "Practice"} · {result.assessment_type} · {pending ? "Pending academic review" : "Published"}</p></div><div className="text-left sm:text-right">{pending ? <span className="text-sm font-semibold text-amber-700">Final grade pending</span> : <span className="text-sm font-extrabold text-accent">{result.percentage}% · Grade {result.grade ?? "—"}</span>}<p className="mt-1 text-xs text-ink-lighter">{result.published_at ? new Date(result.published_at).toLocaleDateString("en-GB") : "Submitted"}</p></div></div>;
        })}
      </div>
    </section>
  );
}

function ResultRow({ attempt }: { attempt: ExamAttempt }) {
  const style = premiumGradeStyle(attempt.grade);
  const date = attempt.ended_at ? new Date(attempt.ended_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Completed";
  const type = attempt.mode === "topic" ? "Topic" : attempt.mode === "lesson" ? "Lesson" : "Full exam";
  return (
    <tr>
      <td className="px-3 py-4"><span className="block font-bold text-ink">{attempt.subject?.name ?? "Exam"}</span>{attempt.score_origin === "legacy_unverified" ? <span className="mt-1 block text-xs text-amber-700">Legacy record</span> : null}</td>
      <td className="px-3 py-4 text-ink-soft">{type}{attempt.submission_reason === "timeout" ? <span className="mt-1 block text-xs text-amber-700">Timed out</span> : null}</td>
      <td className="px-3 py-4"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${style.text} ${style.bg}`}>{Math.round(attempt.percentage)}% · {attempt.grade ?? "—"}</span><span className="mt-1 block text-xs text-ink-lighter">{remarkForGrade(attempt.grade)}</span></td>
      <td className="px-3 py-4 text-ink-soft">{date}</td>
      <td className="px-3 py-4 text-right"><Link to={`/result/${attempt.id}`} className="font-bold text-accent hover:text-accent-hover">Review</Link></td>
    </tr>
  );
}

function ResultSkeleton() {
  return <div className="mt-5 space-y-3" aria-label="Loading results"><span className="workspace-skeleton block h-12 w-full" /><span className="workspace-skeleton block h-12 w-full" /><span className="workspace-skeleton block h-12 w-full" /></div>;
}
