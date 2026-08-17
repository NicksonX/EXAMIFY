import { Link } from "react-router-dom";
import { BookOpen, CircleHelp, ClipboardCheck, ShieldCheck } from "lucide-react";

const questions = [
  {
    question: "How do I start a practice session?",
    answer: "Sign in, choose a subject from Study, then select the material or practice option that matches what you want to revise. Your completed sessions remain available for review.",
  },
  {
    question: "How do prepaid passes work?",
    answer: "Plus and Pro passes add access for the period shown when you choose a plan. They are one-off payments and do not renew automatically. You can review your current access from the Plans page after signing in.",
  },
  {
    question: "I need help with an earlier payment. What should I do?",
    answer: "Keep the safe reference shown on the earlier payment page and contact the official support channel. Do not start another payment for the same reference while it is still being checked.",
  },
  {
    question: "How do I protect my account?",
    answer: "Never share a password, one-time code, or payment details. Examify support will not ask for credentials. Sign out on shared devices and report suspected access promptly through the official support channel.",
  },
  {
    question: "How do I update my email or delete my account?",
    answer: "Open Account settings from the learning workspace. Email changes require confirmation through your inbox. Account deletion is permanent.",
  },
];

export function Help() {
  return (
    <section className="editorial-page">
      <div className="max-w-2xl">
        <p className="editorial-kicker">Help Center</p>
        <h1 className="editorial-title mt-6">A clearer way<br />to keep <em>moving.</em></h1>
        <p className="editorial-copy mt-7 max-w-xl">Find quick answers for studying, practice sessions, and your Examify account. If something still does not look right, contact our support team.</p>
      </div>

      <div className="mt-12 grid border-y border-[#14274a]/15 md:grid-cols-3">
        <article className="py-6 md:pr-7"><BookOpen size={20} className="text-[#ce4040]" aria-hidden /><h2 className="font-editorial-display mt-4 text-2xl font-semibold tracking-[-0.045em] text-[#14274a]">Study and practise</h2><p className="mt-2 text-sm leading-6 text-[#34507c]">Find a subject, work through its material, and use practice when you are ready.</p></article>
        <article className="border-t border-[#14274a]/15 py-6 md:border-l md:border-t-0 md:px-7"><ClipboardCheck size={20} className="text-[#ce4040]" aria-hidden /><h2 className="font-editorial-display mt-4 text-2xl font-semibold tracking-[-0.045em] text-[#14274a]">Review progress</h2><p className="mt-2 text-sm leading-6 text-[#34507c]">Completed results help you identify what to revisit next.</p></article>
        <article className="border-t border-[#14274a]/15 py-6 md:border-l md:border-t-0 md:pl-7"><ShieldCheck size={20} className="text-[#ce4040]" aria-hidden /><h2 className="font-editorial-display mt-4 text-2xl font-semibold tracking-[-0.045em] text-[#14274a]">Account support</h2><p className="mt-2 text-sm leading-6 text-[#34507c]">Manage your account, access, and policies with confidence.</p></article>
      </div>

      <section className="editorial-notice mt-8 max-w-3xl" aria-labelledby="payment-help-title">
        <h2 id="payment-help-title" className="font-bold text-[#14274a]">Payment safety</h2>
        <p className="mt-1 text-sm leading-6 text-[#34507c]">Keep only the safe payment reference for support. Never send a password, one-time code, or full payment details in chat or email.</p>
      </section>

      <section className="mt-12 max-w-3xl" aria-labelledby="help-faq-title">
        <p className="editorial-kicker">Common questions</p>
        <h2 id="help-faq-title" className="editorial-section-title mt-5">Answers for the next step.</h2>
        <div className="mt-7">
          {questions.map(({ question, answer }) => <details key={question} className="faq-item"><summary className="faq-summary"><span>{question}</span><span className="faq-marker" aria-hidden>+</span></summary><p className="faq-answer max-w-2xl">{answer}</p></details>)}
        </div>
      </section>

      <section className="editorial-panel mt-12 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="contact-help-title">
        <div><div className="flex items-center gap-2 text-[#ce4040]"><CircleHelp size={18} aria-hidden /><p className="text-xs font-extrabold uppercase tracking-[0.12em]">Still need help?</p></div><h2 id="contact-help-title" className="font-editorial-display mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#14274a]">Use the official support channel.</h2><p className="mt-2 text-sm leading-6 text-[#34507c]">Describe what happened, include only the safe payment reference when relevant, and follow the support contact published by your Examify operator. Never send credentials, one-time codes, or full payment details.</p></div>
      </section>

      <p className="mt-10 text-sm text-[#34507c]">Need to review our rules? <Link to="/terms" className="editorial-text-link">Read the Terms of Service</Link>.</p>
    </section>
  );
}
