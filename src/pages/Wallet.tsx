import { useEffect } from "react";
import { ArrowRight, Clock3, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export function Wallet() {
  useEffect(() => {
    document.title = "Coming soon - Examify";
  }, []);

  return (
    <div className="workspace-page">
      <section className="mx-auto max-w-3xl border-y border-[#14274a]/20 bg-[#fffdfa]/55 px-5 py-10 sm:px-9 sm:py-14">
        <p className="editorial-kicker">Coming soon</p>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <h1 className="workspace-title">This feature is being prepared.</h1>
            <p className="workspace-subtitle mt-4">
              We are focusing Examify on the study tools you can use today.
              Check back later for updates to this area.
            </p>
          </div>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-[#14274a]/20 bg-[#14274a] text-white" aria-hidden>
            <Sparkles size={21} />
          </span>
        </div>

        <div className="mt-9 grid gap-3 border-y border-[#14274a]/15 py-5 sm:grid-cols-3">
          <Link to="/study" className="group min-h-24 border border-[#14274a]/15 bg-[#fffdfa] p-4 transition hover:border-[#ce4040] hover:bg-[#fffdfa]">
            <p className="font-editorial-display text-xl font-semibold tracking-[-0.04em] text-[#14274a]">Study</p>
            <p className="mt-1 text-xs leading-5 text-[#34507c]">Open available learning materials.</p>
          </Link>
          <Link to="/dashboard" className="group min-h-24 border border-[#14274a]/15 bg-[#fffdfa] p-4 transition hover:border-[#ce4040] hover:bg-[#fffdfa]">
            <p className="font-editorial-display text-xl font-semibold tracking-[-0.04em] text-[#14274a]">Practise</p>
            <p className="mt-1 text-xs leading-5 text-[#34507c]">Choose a subject and keep working.</p>
          </Link>
          <Link to="/upgrade" className="group min-h-24 border border-[#14274a]/15 bg-[#fffdfa] p-4 transition hover:border-[#ce4040] hover:bg-[#fffdfa]">
            <p className="font-editorial-display text-xl font-semibold tracking-[-0.04em] text-[#14274a]">Plans</p>
            <p className="mt-1 text-xs leading-5 text-[#34507c]">See the prepaid access passes.</p>
          </Link>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link to="/dashboard" className="editorial-button-primary">Go to dashboard <ArrowRight size={16} aria-hidden /></Link>
          <p className="inline-flex items-center gap-2 text-xs leading-5 text-[#34507c]"><Clock3 size={15} aria-hidden />No action is needed right now.</p>
        </div>
      </section>
    </div>
  );
}
