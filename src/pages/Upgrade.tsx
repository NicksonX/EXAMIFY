import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, Check, Crown, Download, Loader2, Lock, RotateCcw, Target } from "lucide-react";
import {
  accessDurationLabel,
  createCheckout,
  fetchPlans,
  formatNaira,
  getMyEntitlement,
  getMyOpenPaymentCheckout,
  isPaidPlanSlug,
  planLabel,
  planProductLabel,
  resumePaymentCheckout,
  type EntitlementInfo,
  type OpenPaymentCheckout,
  type PaidPlanSlug,
  type Plan,
  type PremiumError,
} from "@/lib/premium";

type LoadState = "loading" | "ready" | "error";

type CheckoutFeedback = {
  message: string;
  requestId?: string;
};

const REASON_COPY: Record<string, { title: string; body: string }> = {
  "free-limit": { title: "You've used your free exam", body: "Plus includes 20 completed exams in each active pass; Pro includes unlimited completed exams." },
  "download-result": { title: "Result PDF downloads are a Pro feature", body: "Pro members can generate downloadable PDFs for completed practice results." },
  retake: { title: "Your current exam allowance is used", body: "Choose a Plus pass for 20 completed exams or a Pro pass for unlimited completed exams." },
  study: { title: "This material needs a higher plan", body: "Plus unlocks selected lessons. Pro unlocks the full available study library." },
};

const COMPARISON = [
  ["Completed exams", "1 lifetime", "20 / active pass", "Unlimited / active pass"],
  ["Study materials", "Selected samples", "Samples + selected Plus lessons", "All available lessons"],
  ["Online result review", "Included", "Included", "Included"],
  ["Result PDF download", "—", "—", "Included"],
];

function expiryCopy(info: EntitlementInfo | null): string | null {
  if (!info?.endsAt) return null;
  const date = new Date(info.endsAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Active until ${date.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}`;
}

function trialUnlockCopy(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function Upgrade() {
  const location = useLocation();
  const reduce = useReducedMotion();
  const [state, setState] = useState<LoadState>("loading");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [info, setInfo] = useState<EntitlementInfo | null>(null);
  const [openCheckout, setOpenCheckout] = useState<OpenPaymentCheckout | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlanSlug | null>(null);
  const [resumingCheckout, setResumingCheckout] = useState(false);
  const [checkoutFeedback, setCheckoutFeedback] = useState<CheckoutFeedback | null>(null);

  const reason = (location.state as { reason?: string } | null)?.reason;
  const reasonCopy = reason ? REASON_COPY[reason] : null;
  const sortedPlans = [...plans].sort((a, b) => a.sort_order - b.sort_order);
  const checkoutLocked = info?.trial === true || Boolean(info?.checkoutLockedUntil);
  const checkoutLockedUntil = info?.checkoutLockedUntil ?? (info?.trial ? info.trialEndsAt ?? null : null);
  const checkoutCanResume = openCheckout?.status === "initialized" && !checkoutLocked;
  const trialUnlockAt = trialUnlockCopy(checkoutLockedUntil);

  useEffect(() => { document.title = "Plans - Examify"; }, []);
  const load = useCallback(async () => {
    const [availablePlans, entitlement, existingCheckout] = await Promise.all([
      fetchPlans(),
      getMyEntitlement(),
      getMyOpenPaymentCheckout(),
    ]);
    setPlans(availablePlans);
    setInfo(entitlement);
    setOpenCheckout(existingCheckout);
  }, []);

  useEffect(() => {
    let active = true;
    void load().then(() => {
      if (active) setState("ready");
    }).catch(() => active && setState("error"));
    return () => { active = false; };
  }, [load]);

  const refreshCheckout = useCallback(async () => {
    setState("loading");
    try {
      await load();
      setState("ready");
    } catch {
      setState("error");
    }
  }, [load]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshCheckout();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshCheckout]);

  useEffect(() => {
    if (!checkoutLockedUntil) return;
    const expiresAt = Date.parse(checkoutLockedUntil);
    if (!Number.isFinite(expiresAt)) return;
    const delay = Math.max(1_000, expiresAt - Date.now() + 1_000);
    const timer = window.setTimeout(() => void refreshCheckout(), delay);
    return () => window.clearTimeout(timer);
  }, [checkoutLockedUntil, refreshCheckout]);

  function feedbackFromError(error: unknown, fallback: string): CheckoutFeedback {
    const premiumError = error as PremiumError;
    return {
      message: error instanceof Error ? error.message : fallback,
      requestId: premiumError.requestId,
    };
  }

  async function beginCheckout(planSlug: PaidPlanSlug) {
    if (checkoutLocked) {
      setCheckoutFeedback({ message: "Paid plans become available after your 15-day learning trial ends." });
      return;
    }
    setCheckoutPlan(planSlug);
    setCheckoutFeedback(null);
    try {
      const authorizationUrl = await createCheckout(planSlug);
      window.location.assign(authorizationUrl);
    } catch (error) {
      setCheckoutFeedback(feedbackFromError(error, "We couldn't start checkout. Please try again."));
      setCheckoutPlan(null);
      try {
        setOpenCheckout(await getMyOpenPaymentCheckout());
      } catch {
        // The original safe checkout error is more useful than a refresh failure.
      }
    }
  }

  async function resumeCheckout() {
    if (checkoutLocked) {
      setCheckoutFeedback({ message: "Paid plans become available after your 15-day learning trial ends." });
      return;
    }
    setResumingCheckout(true);
    setCheckoutFeedback(null);
    try {
      const { authorizationUrl } = await resumePaymentCheckout();
      window.location.assign(authorizationUrl);
    } catch (error) {
      setCheckoutFeedback(feedbackFromError(error, "We couldn't resume that checkout. Please try again."));
      try {
        setOpenCheckout(await getMyOpenPaymentCheckout());
      } catch {
        // Keep the displayed recovery state until a later refresh.
      }
    } finally {
      setResumingCheckout(false);
    }
  }

  function actionFor(plan: Plan): { label: string; disabled: boolean; onClick?: () => void } {
    if (plan.slug === "free") return { label: info?.trial ? "Trial access" : info?.plan === "free" ? "Current plan" : "Free plan", disabled: true };
    if (!isPaidPlanSlug(plan.slug) || !plan.tier) return { label: "Pass unavailable", disabled: true };

    const productSlug: PaidPlanSlug = plan.slug;
    if (checkoutLocked) return { label: "Available after trial", disabled: true };
    if (openCheckout) return { label: `Checkout open for ${planProductLabel(openCheckout.product)}`, disabled: true };
    if (info?.plan === "pro" && plan.tier === "plus") return { label: "Included with Pro", disabled: true };
    if (checkoutPlan === productSlug) return { label: "Opening secure checkout…", disabled: true };
    if (info?.plan === plan.tier) {
      return {
        label: `Extend for ${accessDurationLabel(plan.access_days)}`,
        disabled: false,
        onClick: () => void beginCheckout(productSlug),
      };
    }
    return {
      label: info?.plan === "plus" && plan.tier === "pro" ? "Upgrade to Pro" : `Choose ${plan.name}`,
      disabled: false,
      onClick: () => void beginCheckout(productSlug),
    };
  }

  return (
    <div className="editorial-page max-w-5xl">
      <motion.header initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="max-w-2xl">
        <p className="editorial-kicker inline-flex items-center gap-2"><Crown size={14} aria-hidden />Examify access</p>
        <h1 className="editorial-section-title mt-5">More room to practise.</h1>
        <p className="editorial-copy mt-5">Choose a 30-day or 365-day prepaid pass when you need more study access or practice. Checkout is completed securely.</p>
      </motion.header>

      {reasonCopy ? <section className="editorial-notice mt-8 flex items-start gap-3"><Lock size={18} className="mt-0.5 shrink-0 text-[#ce4040]" /><div><h2 className="font-editorial-display text-xl font-semibold text-[#14274a]">{reasonCopy.title}</h2><p className="mt-1 text-sm leading-6">{reasonCopy.body}</p></div></section> : null}
      {checkoutFeedback ? <section className="editorial-notice mt-5 flex items-start gap-3" role="alert"><Lock size={18} className="mt-0.5 shrink-0 text-[#ce4040]" aria-hidden /><div><h2 className="font-editorial-display text-xl font-semibold text-[#14274a]">Checkout could not start</h2><p className="mt-1 text-sm leading-6">{checkoutFeedback.message}</p>{checkoutFeedback.requestId ? <p className="mt-2 text-xs font-semibold tracking-wide text-[#34507c]">Support ID: {checkoutFeedback.requestId}</p> : null}</div></section> : null}
      {info ? <section className="editorial-notice mt-5 flex flex-wrap items-center justify-between gap-3"><span><span className="font-semibold text-[#14274a]">{info.trial ? "Current access: 15-day learning trial." : `Current access: ${planLabel(info.plan)}.`}</span>{info.plan === "plus" && info.remainingExams !== null ? ` ${info.remainingExams} completed exam${info.remainingExams === 1 ? "" : "s"} remain in this pass.` : ""}</span>{expiryCopy(info) ? <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#34507c]">{expiryCopy(info)}</span> : null}</section> : null}
      {checkoutLocked ? <section className="editorial-notice mt-5 flex items-start gap-3" role="status"><Lock size={18} className="mt-0.5 shrink-0 text-[#ce4040]" aria-hidden /><div><p className="font-semibold text-[#14274a]">Paid plans are unavailable during your learning trial.</p><p className="mt-1 text-sm leading-6">You can continue using your trial access. Paid plans become available after the server-recorded trial period ends{trialUnlockAt ? ` on ${trialUnlockAt}` : ""}.</p></div></section> : null}
      {openCheckout ? <section className="editorial-notice mt-5" aria-live="polite"><p className="font-semibold text-[#14274a]">A {planProductLabel(openCheckout.product)} checkout is still open.</p><p className="mt-1 text-sm leading-6">{checkoutCanResume ? "Resume the secure payment page or check its payment status before starting another checkout. This protects you from duplicate payment attempts." : "We are safely checking this checkout before allowing another one. Check its payment status; this page cannot activate access by itself."}</p><p className="mt-2 text-xs font-semibold tracking-wide text-[#34507c]">Reference: {openCheckout.reference} · Expires {new Date(openCheckout.expiresAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</p><div className="mt-4 flex flex-col gap-3 sm:flex-row">{checkoutCanResume ? <button type="button" onClick={() => void resumeCheckout()} disabled={resumingCheckout} className="editorial-button-primary">{resumingCheckout ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} {resumingCheckout ? "Opening checkout…" : "Resume checkout"}</button> : null}<Link to={`/billing/return?reference=${encodeURIComponent(openCheckout.reference)}`} className="editorial-button-secondary">Check payment status</Link><button type="button" onClick={() => void refreshCheckout()} className="editorial-text-link">Refresh status</button></div></section> : null}

      {state === "loading" ? <div className="mt-12 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#ce4040]" /></div> : null}
      {state === "error" ? <section className="editorial-empty mt-12"><h2 className="font-editorial-display text-2xl font-semibold text-[#14274a]">We couldn't load plans</h2><p className="mt-2 text-sm text-[#34507c]">Refresh the page and try again.</p></section> : null}

      {state === "ready" && sortedPlans.length > 0 ? <section className="mt-10 grid gap-5 lg:grid-cols-3" aria-label="Plans">
        {sortedPlans.map((plan) => {
          const free = plan.slug === "free";
          const action = actionFor(plan);
          const featured = plan.highlighted;
          return <article key={plan.id} className={`relative flex flex-col border-y p-6 sm:p-7 ${featured ? "border-[#14274a] bg-[#14274a] text-white" : "border-[#14274a]/20 bg-[#fffdfa]/55"}`}>
            {featured ? <span className="absolute right-5 top-5 border border-white/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">Most complete</span> : null}
            <div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-[2px] ${featured ? "bg-white/10 text-white" : "bg-[#14274a] text-white"}`}>{free ? <BookOpen size={19} /> : <Crown size={19} />}</span><div><h2 className={`font-editorial-display text-3xl font-semibold tracking-[-0.04em] ${featured ? "text-white" : "text-[#14274a]"}`}>{plan.name}</h2>{plan.tagline ? <p className={`mt-1 text-xs leading-5 ${featured ? "text-white/65" : "text-[#34507c]"}`}>{plan.tagline}</p> : null}</div></div>
            <div className="mt-7 flex items-baseline gap-1"><span className={`font-editorial-display text-5xl font-semibold tracking-[-0.06em] ${featured ? "text-white" : "text-[#14274a]"}`}>{free ? "Free" : formatNaira(plan.price_kobo)}</span>{!free ? <span className={featured ? "text-sm text-white/60" : "text-sm text-[#34507c]"}>/{accessDurationLabel(plan.access_days)}</span> : null}</div>
            <ul className="mt-6 space-y-3 border-t border-current/20 pt-5">{plan.features.map((feature) => <li key={feature} className={`flex items-start gap-2.5 text-sm ${featured ? "text-white/75" : "text-[#34507c]"}`}><Check size={16} className={`mt-0.5 shrink-0 ${featured ? "text-white" : "text-[#ce4040]"}`} />{feature}</li>)}</ul>
            <button type="button" disabled={action.disabled} onClick={action.onClick} className={`mt-8 w-full ${featured ? "editorial-button-secondary border-white/40 bg-transparent text-white hover:bg-white/10" : "editorial-button-primary"} disabled:cursor-not-allowed disabled:opacity-55`}>{action.label}</button>
          </article>;
        })}
      </section> : null}

      <section className="mt-14"><p className="editorial-kicker">A clear comparison</p><h2 className="font-editorial-display mt-4 text-3xl font-semibold tracking-[-0.05em] text-[#14274a]">Free, Plus, and Pro.</h2><div className="mt-5 overflow-x-auto border-y border-[#14274a]/15"><div className="min-w-[38rem]"><div className="grid grid-cols-[minmax(11rem,1.5fr)_1fr_1fr_1fr] gap-3 border-b border-[#14274a]/15 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#34507c]"><span>Access</span><span>Free</span><span>Plus</span><span>Pro</span></div>{COMPARISON.map(([feature, free, plus, pro]) => <div key={feature} className="grid grid-cols-[minmax(11rem,1.5fr)_1fr_1fr_1fr] gap-3 border-b border-[#14274a]/10 py-4 text-sm last:border-0"><span className="font-semibold text-[#14274a]">{feature}</span><span className="text-[#34507c]">{free}</span><span className="text-[#34507c]">{plus}</span><span className="text-[#34507c]">{pro}</span></div>)}</div></div></section>

      <section className="mt-14 grid gap-x-8 gap-y-8 border-y border-[#14274a]/15 py-9 sm:grid-cols-2"><article><RotateCcw size={20} className="text-[#ce4040]" /><h2 className="font-editorial-display mt-4 text-2xl font-semibold tracking-[-0.04em] text-[#14274a]">Prepaid, not recurring</h2><p className="mt-2 text-sm leading-6 text-[#34507c]">Each payment grants a 30-day or 365-day pass. There is no automatic renewal.</p></article><article><Download size={20} className="text-[#ce4040]" /><h2 className="font-editorial-display mt-4 text-2xl font-semibold tracking-[-0.04em] text-[#14274a]">A proper practice record</h2><p className="mt-2 text-sm leading-6 text-[#34507c]">Pro can generate a downloadable PDF of any completed practice result.</p></article><article><Target size={20} className="text-[#ce4040]" /><h2 className="font-editorial-display mt-4 text-2xl font-semibold tracking-[-0.04em] text-[#14274a]">Use the pass well</h2><p className="mt-2 text-sm leading-6 text-[#34507c]">Plus includes 20 completed exams in each active pass; Pro has no completed-exam cap.</p></article><article><Lock size={20} className="text-[#ce4040]" /><h2 className="font-editorial-display mt-4 text-2xl font-semibold tracking-[-0.04em] text-[#14274a]">Verified before access</h2><p className="mt-2 text-sm leading-6 text-[#34507c]">Access changes only after the payment is confirmed securely.</p></article></section>
      <div className="mt-10 text-center"><Link to="/dashboard" className="editorial-text-link">Back to dashboard</Link></div>
    </div>
  );
}
