import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock3, FileCheck2, Loader2, RefreshCw } from "lucide-react";
import { fetchAssessmentCatalog, fetchOpenAssessmentAttempts, type AssessmentDefinition, type OpenAssessmentAttempt } from "@/lib/assessments";

export function MainExams() {
  const [assessments, setAssessments] = useState<AssessmentDefinition[]>([]);
  const [openAttempts, setOpenAttempts] = useState<OpenAssessmentAttempt[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    document.title = "Main exams - Examify";
    let active = true;
    setState("loading");
    void Promise.all([fetchAssessmentCatalog("main"), fetchOpenAssessmentAttempts("main")])
      .then(([rows, attempts]) => {
        if (!active) return;
        setAssessments(rows);
        setOpenAttempts(attempts);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  return (
    <div className="workspace-page">
      <header className="workspace-page-heading">
        <div>
          <p className="eyebrow">Assessment centre</p>
          <h1 className="workspace-title mt-2">Main exams</h1>
          <p className="workspace-subtitle">
            Published main assessments may combine objective questions, written responses, and secure video submissions. A final result is published only after every required component is scored.
          </p>
        </div>
        <Link to="/practice" className="btn-secondary w-full sm:w-auto">Practice instead</Link>
      </header>

      {state === "ready" && openAttempts.length > 0 ? (
        <section className="surface-panel mt-6 border-accent/30 p-6" aria-labelledby="continue-main-exams">
          <p className="eyebrow">In progress</p>
          <h2 id="continue-main-exams" className="mt-2 font-display text-xl font-bold text-ink">Continue a main exam</h2>
          <div className="mt-4 space-y-3">
            {openAttempts.map((attempt) => (
              <div key={attempt.id} className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold text-ink">{attempt.title}</p><p className="mt-1 text-xs text-ink-soft">{attempt.assessment_type} · deadline {new Date(attempt.deadline_at).toLocaleString("en-GB")}</p></div>
                <Link to={`/assessment/attempt/${attempt.id}`} className="btn-secondary w-full sm:w-auto">Continue</Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {state === "loading" ? (
        <div className="surface-panel mt-6 flex items-center gap-2 p-6 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Checking published main exams...</div>
      ) : state === "error" ? (
        <div className="status-error mt-6 flex items-center justify-between gap-3" role="alert">
          <span>We could not load main exams right now.</span>
          <button type="button" className="inline-flex items-center gap-1 font-bold underline" onClick={() => setReload((value) => value + 1)}><RefreshCw size={14} /> Retry</button>
        </div>
      ) : assessments.length === 0 ? (
        <div className="surface-panel mt-6 p-7">
          <FileCheck2 size={24} className="text-accent" aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold text-ink">No main exam is published yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
            Main exams will appear after their questions, essay rubrics, video limits, grading policy, and review process have been approved. Practice exams remain available now.
          </p>
          <Link to="/practice" className="btn-primary mt-5 inline-flex">Open Practice <ArrowRight size={16} aria-hidden /></Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {assessments.map((assessment) => (
            <article key={assessment.id} className="surface-panel flex flex-col p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Main assessment · v{assessment.version}</p>
                  <h2 className="mt-2 font-display text-xl font-bold text-ink">{assessment.title}</h2>
                </div>
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent">{assessment.assessment_type}</span>
              </div>
              {assessment.description ? <p className="mt-3 text-sm leading-6 text-ink-soft">{assessment.description}</p> : null}
              <div className="mt-5 flex flex-wrap gap-4 text-xs font-semibold text-ink-soft">
                <span className="inline-flex items-center gap-1.5"><Clock3 size={14} /> {Math.ceil(assessment.duration_seconds / 60)} minutes</span>
                <span>{assessment.item_count} available items</span>
              </div>
              <Link to={`/assessment/${assessment.id}`} className="btn-primary mt-6 inline-flex w-full sm:w-auto">Start main exam <ArrowRight size={16} aria-hidden /></Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
