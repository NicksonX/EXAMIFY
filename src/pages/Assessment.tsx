import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock3, FileText, Loader2, Upload, Video } from "lucide-react";
import {
  AssessmentError,
  finalizeAssessmentMedia,
  requestAssessmentMediaUpload,
  resumeAssessment,
  saveAssessmentResponse,
  startAssessment,
  submitAssessment,
  type AssessmentAttempt,
  type AssessmentItem,
  clearAssessmentEssayResponse,
} from "@/lib/assessments";

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
}

export function Assessment() {
  const { definitionId, attemptId } = useParams<{ definitionId?: string; attemptId?: string }>();
  const [attempt, setAttempt] = useState<AssessmentAttempt | null>(null);
  const [phase, setPhase] = useState<"loading" | "active" | "submitting" | "complete" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, { selectedOption?: number; essayText?: string; hasMedia?: boolean }>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  const deadlineRef = useRef(0);
  const pendingSavesRef = useRef(new Map<string, Promise<void>>());
  const autoSubmitStartedRef = useRef(false);
  const handleSubmitRef = useRef<(auto?: boolean) => Promise<void>>(async () => undefined);

  const items = useMemo(() => attempt?.items ?? [], [attempt?.items]);
  const requiredItems = useMemo(() => items.filter((item) => item.required), [items]);

  useEffect(() => {
    if (!definitionId && !attemptId) return;
    let active = true;
    setPhase("loading");
    setErrorMessage(null);
    const load = attemptId ? resumeAssessment(attemptId) : definitionId ? startAssessment(definitionId) : Promise.reject(new Error("ASSESSMENT_ID_MISSING"));
    void load
      .then((result) => {
        if (!active) return;
        autoSubmitStartedRef.current = false;
        setAttempt(result);
        setResponses(toResponseMap(result.items));
        const deadline = Date.parse(result.deadline_at);
        deadlineRef.current = Number.isFinite(deadline) ? deadline : 0;
        setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        setPhase(result.status === "in_progress" ? "active" : "complete");
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof AssessmentError && error.code === "ASSESSMENT_ATTEMPT_NOT_FOUND") {
          setErrorMessage("This assessment attempt is no longer available.");
        } else {
          setErrorMessage("We could not prepare this assessment. Please try again.");
        }
        setPhase("error");
      });
    return () => {
      active = false;
    };
  }, [attemptId, definitionId]);

  useEffect(() => {
    if (phase !== "active") return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  function saveItem(item: AssessmentItem, value: { selectedOption?: number | null; essayText?: string | null; mediaObjectKey?: string | null; mediaMetadata?: Record<string, unknown> }): Promise<void> {
    if (!attempt || phase !== "active") return Promise.resolve();
    setSavingItem(item.id);
    setActionMessage(null);
    const previousRequest = pendingSavesRef.current.get(item.id);
    const request = (previousRequest ? previousRequest.catch(() => undefined) : Promise.resolve())
      .then(() => saveAssessmentResponse({ attemptId: attempt.attempt_id, itemId: item.id, ...value }))
      .then(() => {
        setResponses((previous) => ({
          ...previous,
          [item.id]: {
            ...previous[item.id],
            ...(value.selectedOption !== undefined ? { selectedOption: value.selectedOption ?? undefined } : {}),
            ...(value.essayText !== undefined ? { essayText: value.essayText ?? undefined } : {}),
            ...(value.mediaObjectKey !== undefined ? { hasMedia: Boolean(value.mediaObjectKey) } : {}),
          },
        }));
      })
      .catch((error) => {
        setActionMessage(error instanceof AssessmentError && error.code === "ASSESSMENT_ATTEMPT_EXPIRED" ? "Time has expired; the assessment is being submitted." : "We could not save this response. Please try again.");
        throw error;
      })
      .finally(() => {
        if (pendingSavesRef.current.get(item.id) === request) pendingSavesRef.current.delete(item.id);
        setSavingItem((current) => current === item.id ? null : current);
      });
    pendingSavesRef.current.set(item.id, request);
    return request;
  }

  function clearEssay(item: AssessmentItem): Promise<void> {
    if (!attempt || phase !== "active") return Promise.resolve();
    setSavingItem(item.id);
    const previousRequest = pendingSavesRef.current.get(item.id);
    const request = (previousRequest ? previousRequest.catch(() => undefined) : Promise.resolve())
      .then(() => clearAssessmentEssayResponse(attempt.attempt_id, item.id))
      .then(() => {
        setResponses((previous) => ({
          ...previous,
          [item.id]: { ...previous[item.id], essayText: undefined },
        }));
      })
      .catch((error) => {
        setActionMessage(error instanceof AssessmentError && error.code === "ASSESSMENT_ATTEMPT_EXPIRED" ? "Time has expired; the assessment is being submitted." : "We could not clear this response. Please try again.");
        throw error;
      })
      .finally(() => {
        if (pendingSavesRef.current.get(item.id) === request) pendingSavesRef.current.delete(item.id);
        setSavingItem((current) => current === item.id ? null : current);
      });
    pendingSavesRef.current.set(item.id, request);
    return request;
  }

  async function uploadVideo(item: AssessmentItem, file: File) {
    if (!attempt || phase !== "active") return;
    if (file.size > 100 * 1024 * 1024) {
      setActionMessage("This video is larger than the 100 MB limit.");
      return;
    }
    setUploadingItem(item.id);
    setActionMessage(null);
    try {
      const upload = await requestAssessmentMediaUpload({
        attemptId: attempt.attempt_id,
        itemId: item.id,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      });
      const response = await fetch(upload.signedUploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("VIDEO_UPLOAD_FAILED");
      const finalized = await finalizeAssessmentMedia({
        attemptId: attempt.attempt_id,
        itemId: item.id,
        objectKey: upload.objectKey,
        metadata: { size: file.size, mimeType: file.type, filename: file.name },
      });
      setResponses((previous) => ({
        ...previous,
        [item.id]: { ...previous[item.id], hasMedia: Boolean(finalized.objectKey) },
      }));
      setActionMessage("Video response uploaded securely. It will be reviewed before a final result is published.");
    } catch {
      setActionMessage("We could not upload this video. Check the file type and connection, then try again.");
    } finally {
      setUploadingItem(null);
    }
  }

  async function handleSubmit(auto = false) {
    if (!attempt || phase === "submitting" || phase === "complete") return;
    setPhase("submitting");
    setActionMessage(null);
    try {
      await Promise.all([...pendingSavesRef.current.values()]);
      const result = await submitAssessment(attempt.attempt_id);
      setAttempt((previous) => previous ? { ...previous, status: result.status, score: result.score, max_points: result.max_points, percentage: result.percentage, grade: result.grade, submitted_at: result.submitted_at } : previous);
      setPhase("complete");
      setActionMessage(result.status === "expired" ? "Time expired. Only responses saved before the deadline could be retained." : auto ? "Time expired. Your responses were submitted." : result.status === "pending_review" ? "Submitted. Essay and video responses must be reviewed before your final result is published." : "Submitted and scored by the assessment server.");
    } catch (error) {
      setPhase("active");
      if (!auto) autoSubmitStartedRef.current = false;
      setActionMessage(error instanceof AssessmentError && error.code === "REQUIRED_RESPONSE_MISSING" ? "Complete every required objective, essay, and video response before submitting." : auto ? "Time expired, but one or more responses could not be saved. Do not close this page; retry submission when the connection returns." : "We could not submit this assessment. Please try again.");
    }
  }

  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  });

  useEffect(() => {
    if (phase === "active" && secondsLeft === 0 && !autoSubmitStartedRef.current) {
      autoSubmitStartedRef.current = true;
      void handleSubmitRef.current(true);
    }
  }, [phase, secondsLeft]);

  if (phase === "loading") return <AssessmentLoading />;
  if (phase === "error") {
    return <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center"><AlertTriangle className="text-red-700" size={28} aria-hidden /><h1 className="mt-4 font-display text-2xl font-bold">Assessment unavailable</h1><p className="mt-2 text-sm leading-6 text-ink-soft">{errorMessage}</p><Link to="/main-exams" className="btn-primary mt-6">Back to main exams</Link></div>;
  }
  if (!attempt) return null;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-4xl items-center justify-between gap-3 px-5 sm:px-8">
          <div><p className="font-display text-sm font-semibold text-ink">{attempt.assessment_type === "mixed" ? "Main mixed assessment" : "Main assessment"}</p><p className="text-xs text-ink-lighter">{items.length} items · server-timed</p></div>
          {phase === "active" ? <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums ${secondsLeft < 60 ? "bg-red-50 text-red-700" : "bg-ink/5 text-ink-soft"}`}><Clock3 size={15} aria-hidden />{formatClock(secondsLeft)}</div> : <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent">{attempt.status.replace("_", " ")}</span>}
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-5 pb-12 pt-8 sm:px-8">
        <div className="mb-6 border-y border-accent/20 bg-accent/[0.04] p-5 text-sm leading-6 text-ink-soft"><strong className="text-ink">Final grading is strict.</strong> Objective answers are scored automatically. Essay and video responses remain provisional until an authorized reviewer scores them. No browser score is trusted.</div>
        {actionMessage ? <div className="status-error mb-5" role="status">{actionMessage}</div> : null}
        <div className="space-y-5">
          {items.map((item, index) => <AssessmentItemCard key={item.id} item={item} index={index} value={responses[item.id]} disabled={phase !== "active"} saving={savingItem === item.id} uploading={uploadingItem === item.id} onObjective={(selectedOption) => { setResponses((previous) => ({ ...previous, [item.id]: { ...previous[item.id], selectedOption } })); void saveItem(item, { selectedOption }).catch(() => undefined); }} onEssay={(essayText) => setResponses((previous) => ({ ...previous, [item.id]: { ...previous[item.id], essayText } }))} onEssayBlur={() => { const text = responses[item.id]?.essayText ?? ""; void (text.trim() ? saveItem(item, { essayText: text }) : clearEssay(item)).catch(() => undefined); }} onVideo={(file) => void uploadVideo(item, file)} />)}
        </div>
        <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-ink-soft">{requiredItems.length} required {requiredItems.length === 1 ? "item" : "items"}. Review every response before submitting.</p>{phase === "active" ? <button type="button" disabled={Boolean(savingItem || uploadingItem)} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void handleSubmit()}><CheckCircle2 size={16} aria-hidden /> {savingItem || uploadingItem ? "Saving response..." : "Submit main exam"}</button> : <Link to="/results" className="btn-primary">Open Results</Link>}</div>
        {phase === "complete" && attempt.status === "pending_review" ? <div className="mt-6 border-y border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong>Pending academic review.</strong> Your final percentage, grade, and reward eligibility will appear only after all required essay/video components are reviewed and published.</div> : null}
        {phase === "complete" && attempt.status === "published" ? <div className="mt-6 border-y border-accent/20 bg-accent/[0.04] p-5 text-sm leading-6 text-ink-soft"><strong className="text-ink">Published result:</strong> {attempt.percentage}% · Grade {attempt.grade}. A result at or above 90% creates one server-side ₦1,000 learning reward event; it does not create a Wallet balance or claim an instant cash transfer.</div> : null}
      </main>
    </div>
  );
}

function AssessmentItemCard({ item, index, value, disabled, saving, uploading, onObjective, onEssay, onEssayBlur, onVideo }: { item: AssessmentItem; index: number; value?: { selectedOption?: number; essayText?: string; hasMedia?: boolean }; disabled: boolean; saving: boolean; uploading: boolean; onObjective: (option: number) => void; onEssay: (text: string) => void; onEssayBlur: () => void; onVideo: (file: File) => void }) {
  return <article className="card p-6 sm:p-8"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Item {index + 1} · {item.item_type}</p>{item.required ? <span className="text-xs font-semibold text-ink-lighter">Required · {item.max_points} points</span> : <span className="text-xs text-ink-lighter">Optional · {item.max_points} points</span>}</div><h2 className="mt-3 font-display text-lg font-semibold leading-7 text-ink">{item.prompt}</h2>{item.item_type === "objective" ? <div className="mt-6 grid gap-3">{item.options.map((option, optionIndex) => <button key={optionIndex} type="button" disabled={disabled || saving} aria-pressed={value?.selectedOption === optionIndex} onClick={() => onObjective(optionIndex)} className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${value?.selectedOption === optionIndex ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-line bg-surface hover:border-ink/20"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${value?.selectedOption === optionIndex ? "bg-accent text-white" : "bg-ink/5 text-ink-soft"}`}>{String.fromCharCode(65 + optionIndex)}</span><span className="pt-0.5 text-sm leading-6 text-ink">{option}</span></button>)}</div> : null}{item.item_type === "essay" ? <div className="mt-5"><label className="block text-sm font-semibold text-ink"><span className="inline-flex items-center gap-2"><FileText size={15} aria-hidden /> Your written response</span><textarea disabled={disabled || saving} value={value?.essayText ?? ""} onChange={(event) => onEssay(event.target.value)} onBlur={onEssayBlur} maxLength={30000} rows={8} className="field-control mt-2 min-h-40" placeholder="Write a clear, evidence-based response..." /></label><p className="mt-2 text-xs text-ink-lighter">Save by leaving the field. Essay scoring is rubric-based and reviewed.</p></div> : null}{item.item_type === "video" ? <div className="mt-5 border-y border-dashed border-line py-5"><label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-accent/40 bg-accent/[0.03] p-7 text-center ${disabled || uploading ? "cursor-not-allowed opacity-60" : ""}`}><Video size={25} className="text-accent" aria-hidden /><span className="font-semibold text-ink">{uploading ? "Uploading securely..." : value?.hasMedia ? "Replace video response" : "Choose a video response"}</span><span className="text-xs leading-5 text-ink-soft">MP4, WebM, or QuickTime · maximum 100 MB. Video is private and reviewed.</span><input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={disabled || uploading} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onVideo(file); event.currentTarget.value = ""; }} /></label>{value?.hasMedia ? <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-accent"><Upload size={15} aria-hidden /> Video response attached</p> : null}</div> : null}</article>;
}

function toResponseMap(items: AssessmentItem[]): Record<string, { selectedOption?: number; essayText?: string; hasMedia?: boolean }> {
  return Object.fromEntries(items.filter((item) => item.response).map((item) => [item.id, { selectedOption: item.response?.selected_option ?? undefined, essayText: item.response?.essay_text ?? undefined, hasMedia: item.response?.has_media ?? false }]));
}

function AssessmentLoading() {
  return <div className="flex min-h-screen items-center justify-center bg-canvas px-5"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-accent" aria-hidden /><p className="mt-4 font-display text-lg font-semibold">Preparing your assessment</p><p className="mt-2 text-sm text-ink-soft">Loading the published version and starting the server timer.</p></div></div>;
}
