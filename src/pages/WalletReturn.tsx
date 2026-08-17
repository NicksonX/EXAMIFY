import { useEffect } from "react";
import { CircleAlert, LifeBuoy } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

function legacyReference(value: string | null): string | null {
  return value && /^wlt_[A-Za-z0-9]{16,160}$/u.test(value) ? value : null;
}

export function WalletReturn() {
  const [params] = useSearchParams();
  const reference = legacyReference(params.get("reference"));

  useEffect(() => {
    document.title = "Legacy payment status - Examify";
  }, []);

  return (
    <div className="editorial-page-narrow py-12 sm:py-20">
      <section className="editorial-result-sheet p-7 text-center sm:p-10" aria-live="polite">
        <CircleAlert className="mx-auto h-10 w-10 text-[#ce4040]" aria-hidden />
        <p className="editorial-kicker mt-6">Legacy status</p>
        <h1 className="font-editorial-display mt-4 text-4xl font-semibold tracking-[-0.06em] text-[#14274a]">
          This previous payment is being reconciled.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#34507c]">
          New activity in this area is unavailable. If you need help with an earlier
          payment, keep the reference below and contact support.
        </p>
        {reference ? <p className="mt-5 text-xs font-semibold tracking-wide text-[#57709a]">Support reference: {reference}</p> : <p className="mt-5 text-xs font-semibold tracking-wide text-[#57709a]">No valid legacy reference was provided.</p>}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/help" className="editorial-button-primary"><LifeBuoy size={16} aria-hidden />Get help</Link>
          <Link to="/dashboard" className="editorial-button-secondary">Open dashboard</Link>
        </div>
      </section>
    </div>
  );
}
