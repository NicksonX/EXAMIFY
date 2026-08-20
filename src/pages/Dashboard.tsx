import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  ChevronRight,
  CircleAlert,
  Crown,
  RefreshCw,
  Target,
  Trophy,
} from "lucide-react";
import { SubjectBrowser } from "@/components/SubjectBrowser";
import { useAuth } from "@/context/AuthContext";
import { useAccountState } from "@/context/AccountStateContext";
import { displayIdentity } from "@/lib/accountState";
import { fetchAttemptStats, fetchRecentAttempts, type ExamAttempt } from "@/lib/exams";
import { getPlanInfo, gradeStyle, planLabel, remarkForGrade, type PlanInfo } from "@/lib/premium";

type LoadStatus = "loading" | "ready" | "error";

interface Stats {
  totalQuestions: number;
  bestPercentage: number;
  completedCount: number;
}

export function Dashboard() {
  const { user } = useAuth();
  const { accountState } = useAccountState();
  const reduce = useReducedMotion();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<ExamAttempt[]>([]);
  const [info, setInfo] = useState<PlanInfo | null>(null);
  const [statsStatus, setStatsStatus] = useState<LoadStatus>("loading");
  const [recentStatus, setRecentStatus] = useState<LoadStatus>("loading");
  const [planStatus, setPlanStatus] = useState<LoadStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const name = displayIdentity(
    accountState?.profile,
    (user?.user_metadata?.full_name as string | undefined)
      ?? (user?.user_metadata?.name as string | undefined)
      ?? "there",
  );
  const firstName = name.split(" ")[0];

  useEffect(() => { document.title = "Dashboard - Examify"; }, []);

  useEffect(() => {
    let active = true;
    setStatsStatus("loading");
    setRecentStatus("loading");
    setPlanStatus("loading");

    void (async () => {
      const [statsResult, recentResult, planResult] = await Promise.allSettled([
        fetchAttemptStats(),
        fetchRecentAttempts(5),
        getPlanInfo(),
      ]);
      if (!active) return;

      if (statsResult.status === "fulfilled") {
        setStats(statsResult.value);
        setStatsStatus("ready");
      } else {
        setStats(null);
        setStatsStatus("error");
      }

      if (recentResult.status === "fulfilled") {
        setRecent(recentResult.value);
        setRecentStatus("ready");
      } else {
        setRecent([]);
        setRecentStatus("error");
      }

      if (planResult.status === "fulfilled") {
        setInfo(planResult.value);
        setPlanStatus("ready");
      } else {
        setInfo(null);
        setPlanStatus("error");
      }
    })();

    return () => { active = false; };
  }, [reloadKey]);

  const premium = info ? info.plan !== "free" && info.trial !== true : false;
  const retry = () => setReloadKey((value) => value + 1);
  const statCards = [
    { icon: BookOpenCheck, label: "Questions practised", value: stats ? String(stats.totalQuestions) : null },
    { icon: Trophy, label: "Best score", value: stats ? `${Math.round(stats.bestPercentage)}%` : null },
    { icon: Target, label: "Exams completed", value: stats ? String(stats.completedCount) : null },
  ];

  return (
    <div className="workspace-page">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
        className="workspace-page-heading"
      >
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="workspace-title mt-2">Welcome back, {firstName}</h1>
          <p className="workspace-subtitle">Choose a subject, return to your materials, and keep completed practice records in one place.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link to="/practice" className="btn-primary w-full sm:w-auto"><BookOpenCheck size={16} aria-hidden />Practice exam</Link>
          <Link to="/study" className="btn-secondary w-full sm:w-auto"><BookOpen size={16} aria-hidden />Study materials</Link>
        </div>
      </motion.header>

      <section className="mt-5 grid gap-3 sm:grid-cols-3 sm:gap-4" aria-label="Practice summary" aria-busy={statsStatus === "loading"}>
        {statCards.map((stat) => <StatTile key={stat.label} {...stat} status={statsStatus} />)}
      </section>
      {statsStatus === "error" ? <ModuleError message="We couldn't load your practice summary." onRetry={retry} /> : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section id="practice-library" className="surface-panel p-4 sm:p-6">
          <div className="flex flex-col gap-2 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="editorial-kicker">Study library</p>
              <h2 className="workspace-module-title mt-3">Choose a subject to study</h2>
              <p className="mt-1 text-sm leading-6 text-ink-soft">Open available notes for any secondary subject or university course.</p>
            </div>
            <Link to="/study" className="btn-quiet shrink-0">View all study <ChevronRight size={16} aria-hidden /></Link>
          </div>
          <div className="subject-browser-workspace mt-5">
            <SubjectBrowser
              actions={(subject) => (
                <div className="grid gap-2">
                  <Link to={`/practice?subject_id=${subject.id}`} className="btn-primary w-full px-3 py-2.5 text-xs" aria-label={`Practice ${subject.name}`}><BookOpenCheck size={14} aria-hidden />Practice exam</Link>
                  <Link to={`/study?subject_id=${subject.id}`} className="btn-secondary w-full px-3 py-2.5 text-xs" aria-label={`Study materials for ${subject.name}`}><BookOpen size={14} aria-hidden />Study materials</Link>
                </div>
              )}
            />
          </div>
        </section>

        <aside className="grid content-start gap-5">
          <PlanModule status={planStatus} premium={premium} info={info} onRetry={retry} />
          <RecentModule status={recentStatus} recent={recent} onRetry={retry} />
        </aside>
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, status }: { icon: typeof BookOpenCheck; label: string; value: string | null; status: LoadStatus }) {
  return (
    <article className="workspace-kpi">
      <span className="flex h-9 w-9 items-center justify-center rounded-[2px] bg-[#14274a] text-white"><Icon size={17} aria-hidden /></span>
      <p className="workspace-kpi-label">{label}</p>
      {status === "loading" ? <span className="workspace-skeleton mt-2 block h-8 w-20" aria-label={`Loading ${label}`} /> : status === "error" ? <p className="mt-2 text-sm font-bold text-ink-soft">Unavailable</p> : <p className="workspace-kpi-value">{value}</p>}
      {status === "ready" ? <p className="mt-1 text-[11px] text-ink-lighter">Completed exams only</p> : null}
    </article>
  );
}

function PlanModule({ status, premium, info, onRetry }: { status: LoadStatus; premium: boolean; info: PlanInfo | null; onRetry: () => void }) {
  if (status === "loading") return <section className="workspace-skeleton min-h-60" aria-label="Loading plan" />;
  if (status === "error" || !info) {
    return <section className="surface-panel p-5"><p className="eyebrow">Plan</p><h2 className="workspace-module-title mt-2">Plan unavailable</h2><p className="mt-2 text-sm leading-6 text-ink-soft">We couldn't check your current plan.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={onRetry} className="text-sm font-extrabold text-accent hover:text-accent-hover">Try again</button><Link to="/upgrade" className="text-sm font-extrabold text-ink hover:text-accent">View Premium</Link></div></section>;
  }

  const trial = info.trial === true;
  const title = trial ? "15-day learning trial" : info.plan === "pro" ? "Examify Pro" : info.plan === "plus" ? "Examify Plus" : info.canTakeExam ? "Free plan" : "Free exam used";
  const trialDate = info.trialEndsAt ? new Date(info.trialEndsAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : null;
  const body = trial
    ? `Full available study and practice access is active${trialDate ? ` until ${trialDate}` : " during your trial"}.`
    : info.plan === "pro"
      ? "Your full available study library and unlimited practice access are available."
      : info.plan === "plus"
        ? `${info.remainingExams ?? 0} completed exam${info.remainingExams === 1 ? "" : "s"} remain in your current pass.`
        : info.canTakeExam
          ? "Your current learning access is ready when you are."
          : "Upgrade to expand your available learning access.";

  return (
    <section className={`border-y p-5 ${premium ? "border-[#14274a] bg-[#14274a] text-white" : "border-[#14274a]/20 bg-[#fffdfa]/60 text-ink"}`}>
      <div className="flex items-start justify-between gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-[2px] ${premium ? "bg-white/10 text-white" : "bg-[#14274a] text-white"}`}><Crown size={18} aria-hidden /></span><span className={`border px-2.5 py-1 text-[11px] font-extrabold ${premium ? "border-white/30 text-white" : "border-[#14274a]/20 text-[#ce4040]"}`}>{trial ? "Trial access" : planLabel(info.plan)}</span></div>
      <p className={`mt-6 text-[0.68rem] font-extrabold uppercase tracking-[0.14em] ${premium ? "text-white/65" : "text-ink-lighter"}`}>{trial ? "Current access" : "Current plan"}</p>
      <h2 className={`font-editorial-display mt-2 text-3xl font-semibold tracking-[-0.05em] ${premium ? "text-white" : "text-ink"}`}>{title}</h2>
      <p className={`mt-2 text-sm leading-6 ${premium ? "text-white/75" : "text-ink-soft"}`}>{body}</p>
      <Link to="/upgrade" state={info.plan === "free" && !info.canTakeExam ? { reason: "free-limit" } : undefined} className={`mt-5 inline-flex items-center gap-1 text-sm font-extrabold ${premium ? "text-white" : "text-[#ce4040]"}`}>{trial ? "View trial details" : premium ? "Manage plan" : "Explore plans"}<ArrowRight size={15} aria-hidden /></Link>
    </section>
  );
}

function RecentModule({ status, recent, onRetry }: { status: LoadStatus; recent: ExamAttempt[]; onRetry: () => void }) {
  return (
    <section id="recent-results" className="surface-panel p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Recent results</p><h2 className="workspace-module-title mt-2">Completed exams</h2></div><Link to="/results" className="btn-quiet h-9 w-9 px-0" aria-label="View all results"><ChevronRight size={17} aria-hidden /></Link></div>
      {status === "loading" ? <div className="mt-5 space-y-3" aria-label="Loading recent results"><span className="workspace-skeleton block h-12 w-full" /><span className="workspace-skeleton block h-12 w-full" /><span className="workspace-skeleton block h-12 w-full" /></div> : status === "error" ? <ModuleError message="We couldn't load recent results." onRetry={onRetry} /> : recent.length === 0 ? <div className="status-empty mt-5 px-4 py-7"><p className="font-bold text-ink">No results yet</p><p className="mt-1 text-xs">Completed exams will appear here.</p><Link to="/practice" className="mt-3 inline-flex text-xs font-extrabold text-accent">Choose a subject</Link></div> : <ul className="mt-4 divide-y divide-line">{recent.map((attempt) => { const style = gradeStyle(attempt.grade); const date = attempt.ended_at ? new Date(attempt.ended_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Completed"; return <li key={attempt.id}><Link to={`/result/${attempt.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-canvas"><span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold ring-2 ${style.text} ${style.bg} ${style.ring}`}>{attempt.grade ?? "—"}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-ink">{attempt.subject?.name ?? "Exam"}</span><span className="mt-0.5 block text-xs text-ink-lighter">{date} · {remarkForGrade(attempt.grade)}</span></span><span className="font-display text-sm font-extrabold text-ink">{Math.round(attempt.percentage)}%</span></Link></li>; })}</ul>}
    </section>
  );
}

function ModuleError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="workspace-module-error" role="alert"><CircleAlert size={16} className="shrink-0" aria-hidden /><span>{message}</span><button type="button" onClick={onRetry} className="inline-flex items-center gap-1"><RefreshCw size={13} aria-hidden />Try again</button></div>;
}
