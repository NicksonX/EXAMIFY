import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { accessDurationLabel, fetchPlans, formatNaira, type Plan } from "@/lib/premium";

const pathways = ["JAMB preparation", "WAEC and NECO", "Post-UTME practice", "University courses"];

const reviewSteps = [
  ["Read the question", "Keep the lesson context beside the practice."],
  ["See the result", "Return to completed answers without losing your place."],
  ["Choose the next topic", "Use the record to decide what deserves another look."],
];

export function Landing() {
  const reduce = useReducedMotion();
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    let active = true;
    void fetchPlans().then((catalog) => {
      if (active) setPlans(catalog.filter((plan) => plan.slug !== "free"));
    }).catch(() => {
      if (active) setPlans([]);
    });
    return () => { active = false; };
  }, []);

  return (
    <>
      <section className="editorial-container grid gap-10 pb-12 pt-16 sm:gap-12 sm:pb-16 sm:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-8 lg:pt-20">
        <motion.div initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }} className="max-w-xl">
          <p className="editorial-kicker">JAMB · WAEC · NECO · POST-UTME</p>
          <h1 className="editorial-title mt-7">Practise like it&apos;s<br />the <em>real thing.</em></h1>
          <p className="editorial-copy mt-7 max-w-md">Timed CBT practice, structured study material, and clear completed results to help you decide what to revise next.</p>
          <div className="mt-8 flex flex-col items-stretch gap-5 sm:flex-row sm:items-center">
            <Link to="/login" className="editorial-button-primary">Start free practice <ArrowRight size={16} aria-hidden /></Link>
            <a href="#features" className="editorial-text-link text-center sm:text-left">See how studying works</a>
          </div>
        </motion.div>

        <motion.aside initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.48, delay: reduce ? 0 : 0.12 }} className="editorial-hero-sheet-wrap" aria-label="Illustrative Examify practice result">
          <div className="editorial-hero-sheet">
            <div className="editorial-hero-sheet-content">
              <div className="flex items-start justify-between gap-4"><p className="editorial-hero-sheet-title">Practice result — Physics</p><span className="editorial-badge shrink-0">Example</span></div>
              <div className="mt-5 border-b border-dashed border-[#14274a]/20" />
              <div className="mt-1">
                {[["1.", "Motion", "Reviewed"], ["2.", "Forces", "Reviewed"], ["3.", "Waves", "Ready"], ["4.", "Electricity", "Ready"]].map(([number, topic, status]) => (
                  <div key={topic} className="editorial-hero-sheet-row"><span>{number}</span><span>{topic}</span><Check size={13} className="ml-auto text-[#ce4040]" aria-hidden /><span className="editorial-hero-sheet-status">{status}</span></div>
                ))}
              </div>
              <p className="mt-5 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[#14274a]/45">Timed practice · Review available</p>
            </div>
            <span className="editorial-hero-sheet-seal" aria-hidden>CBT</span>
          </div>
        </motion.aside>
      </section>

      <section className="editorial-container pb-16 sm:pb-20" aria-label="Examify capabilities">
        <dl className="border-y border-[#14274a]/15 sm:grid sm:grid-cols-3">
          {["Study", "Practise", "Review"].map((name, index) => <div key={name} className={`py-4 sm:px-6 sm:py-5 ${index ? "border-t border-[#14274a]/15 sm:border-l sm:border-t-0" : ""}`}><dd className="font-editorial-display text-3xl font-semibold tracking-[-0.06em] text-[#14274a]">{name}</dd><dt className="mt-1 text-[0.66rem] font-semibold text-[#34507c]">{index === 0 ? "Structured notes" : index === 1 ? "Timed sessions" : "Completed results"}</dt></div>)}
        </dl>
      </section>

      <section id="features" className="border-y border-[#14274a]/15 bg-[#fffdfa]/45 py-14 sm:py-16">
        <div className="editorial-container grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div><p className="editorial-kicker">Built for focused revision</p><h2 className="editorial-section-title mt-5 max-w-xl">Pick a subject. Work through it. Know what to do next.</h2></div>
          <div className="max-w-lg lg:justify-self-end"><p className="editorial-copy">Choose available secondary-school subjects or university courses, study with context, and use timed practice whenever you are ready.</p><Link to="/login" className="editorial-button-primary mt-7">Start with Examify <ArrowRight size={16} aria-hidden /></Link></div>
        </div>
      </section>

      <section id="subjects" className="editorial-container py-12 sm:py-16">
        <p className="editorial-kicker">Available pathways</p>
        <div className="mt-6 grid gap-y-5 border-y border-[#14274a]/15 py-5 sm:grid-cols-2 sm:gap-x-10 lg:grid-cols-4">
          {pathways.map((item) => <p key={item} className="font-editorial-display text-2xl font-semibold tracking-[-0.045em] text-[#14274a]">{item}</p>)}
        </div>
      </section>

      <section id="pricing" className="border-y border-[#14274a]/15 bg-[#fffdfa]/45 py-14 sm:py-20">
        <div className="editorial-container">
          <div className="max-w-2xl">
            <p className="editorial-kicker">Simple access</p>
            <h2 className="editorial-section-title mt-5">Pick the room you need to revise well.</h2>
            <p className="editorial-copy mt-5">Start free, then choose a 30-day or 365-day Plus or Pro pass when you want more access. Every pass is prepaid; there is no automatic renewal.</p>
          </div>

          <div className="mt-10 grid border-y border-[#14274a]/15 sm:grid-cols-2">
            {plans.map((plan, index) => (
              <article key={plan.id} className={`flex flex-col px-0 py-7 sm:px-8 sm:py-9 ${index ? "border-t border-[#14274a]/15 sm:border-l sm:border-t-0" : ""} ${plan.highlighted ? "bg-[#14274a] text-white sm:-my-px sm:border-y sm:border-[#14274a]" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`font-editorial-display text-4xl font-semibold tracking-[-0.06em] ${plan.highlighted ? "text-white" : "text-[#14274a]"}`}>{plan.name}</p>
                    {plan.tagline ? <p className={`mt-2 text-sm leading-6 ${plan.highlighted ? "text-white/70" : "text-[#34507c]"}`}>{plan.tagline}</p> : null}
                  </div>
                  {plan.highlighted ? <span className="border border-white/35 px-2 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em]">Most complete</span> : null}
                </div>
                <p className={`font-editorial-display mt-8 text-5xl font-semibold tracking-[-0.07em] ${plan.highlighted ? "text-white" : "text-[#14274a]"}`}>{formatNaira(plan.price_kobo)}</p>
                <p className={`mt-1 text-xs font-semibold uppercase tracking-[0.1em] ${plan.highlighted ? "text-white/60" : "text-[#34507c]"}`}>{accessDurationLabel(plan.access_days)} · one payment</p>
                <ul className="mt-7 space-y-3 border-t border-current/20 pt-5">
                  {plan.features.map((feature) => <li key={feature} className={`flex items-start gap-2 text-sm ${plan.highlighted ? "text-white/80" : "text-[#34507c]"}`}><Check size={15} className={`mt-0.5 shrink-0 ${plan.highlighted ? "text-white" : "text-[#ce4040]"}`} aria-hidden />{feature}</li>)}
                </ul>
                <Link to="/upgrade" className={`mt-8 ${plan.highlighted ? "editorial-button-secondary border-white/40 bg-transparent text-white hover:bg-white/10" : "editorial-button-primary"}`}>See plan details <ArrowRight size={16} aria-hidden /></Link>
              </article>
            ))}
            {plans.length === 0 ? <p className="py-8 text-sm text-[#34507c]">Plans are being prepared. View plan details to check current access.</p> : null}
          </div>
        </div>
      </section>

      <section id="review" className="editorial-container py-14 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="editorial-kicker">The review matters</p>
            <h2 className="editorial-section-title mt-5">A practice paper should leave you with a next step.</h2>
            <p className="editorial-copy mt-5 max-w-md">Examify is built around the useful part after a session: returning to what happened, seeing the context, and deciding what to revise next.</p>
            <Link to="/login" className="editorial-text-link mt-7 inline-flex">Start your first review <ArrowRight size={15} className="ml-1" aria-hidden /></Link>
          </div>
          <ol className="border-y border-[#14274a]/15">
            {reviewSteps.map(([title, body], index) => <li key={title} className={`grid grid-cols-[2.8rem_1fr] gap-4 py-5 sm:grid-cols-[4rem_1fr] ${index ? "border-t border-[#14274a]/15" : ""}`}><span className="font-editorial-display text-4xl font-semibold tracking-[-0.07em] text-[#ce4040]">0{index + 1}</span><div><h3 className="font-editorial-display text-2xl font-semibold tracking-[-0.04em] text-[#14274a]">{title}</h3><p className="mt-1 text-sm leading-6 text-[#34507c]">{body}</p></div></li>)}
          </ol>
        </div>
      </section>

      <section className="border-y border-[#14274a]/15 bg-[#14274a] py-14 text-white sm:py-20" aria-labelledby="learning-record-title">
        <div className="editorial-container grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-[0.66rem] font-extrabold uppercase tracking-[0.15em] text-[#f5b1aa]">Made for steady progress</p>
            <h2 id="learning-record-title" className="font-editorial-display mt-5 max-w-xl text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Keep the next revision decision visible.</h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-white/70">A calm workspace for subjects, timed practice, and completed results—so your next study session starts with context instead of guesswork.</p>
            <p className="mt-7 text-xs leading-5 text-white/55">This is an illustrative product view, not a learner result or endorsement.</p>
          </div>
          <div className="editorial-learning-record" aria-label="Illustrative study record">
            <div className="editorial-learning-record-head"><span>Practice record</span><span>Example workspace</span></div>
            <div className="editorial-learning-record-grid">
              <div><span className="editorial-learning-record-number">01</span><h3>Choose a focus</h3><p>Open a subject or topic that deserves your attention.</p></div>
              <div><span className="editorial-learning-record-number">02</span><h3>Complete a session</h3><p>Work through a timed practice paper when ready.</p></div>
              <div><span className="editorial-learning-record-number">03</span><h3>Review the record</h3><p>Return to completed work before choosing what comes next.</p></div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
