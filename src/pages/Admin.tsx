import { useEffect, useState } from "react";
import { CircleAlert, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  getAdminManualPayoutRequests,
  getAdminPayoutRequests,
  getAdminReferralTransfers,
} from "@/lib/admin";

type State = "loading" | "ready" | "error";

type ArchiveCounts = {
  legacyPayouts: number;
  legacyManualPayouts: number;
  legacyReferralTransfers: number;
};

function terminal(status: string): boolean {
  return ["paid", "failed", "rejected", "cancelled", "reversed"].includes(status);
}

export function Admin() {
  const [state, setState] = useState<State>("loading");
  const [counts, setCounts] = useState<ArchiveCounts | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    setState("loading");
    setMessage("");
    try {
      const [payouts, manualPayouts, referralTransfers] = await Promise.all([
        getAdminPayoutRequests(),
        getAdminManualPayoutRequests(),
        getAdminReferralTransfers(),
      ]);
      setCounts({
        legacyPayouts: payouts.filter((request) => !terminal(request.status)).length,
        legacyManualPayouts: manualPayouts.filter((request) => !terminal(request.status)).length,
        legacyReferralTransfers: referralTransfers.filter((request) => !terminal(request.status)).length,
      });
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "We couldn't load the reconciliation archive.");
    }
  };

  useEffect(() => {
    document.title = "Finance archive - Examify";
    void load();
  }, []);

  return (
    <div className="workspace-page">
      <header className="workspace-page-heading">
        <div>
          <p className="eyebrow">Finance archive</p>
          <h1 className="workspace-title mt-2">Legacy reconciliation only.</h1>
          <p className="workspace-subtitle">New financial activity is retired. This view is read-only while earlier records are reconciled and retained.</p>
        </div>
        <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => void load()} disabled={state === "loading"}>
          <RefreshCw size={16} className={state === "loading" ? "animate-spin" : ""} />Refresh archive
        </button>
      </header>

      {state === "loading" ? <div className="mt-10 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#ce4040]" /></div> : null}
      {state === "error" ? <section className="editorial-error mt-6 flex items-start gap-3" role="alert"><CircleAlert size={18} className="mt-0.5 shrink-0" /><div><p>{message}</p><button type="button" className="mt-2 font-bold underline" onClick={() => void load()}>Try again</button></div></section> : null}
      {state === "ready" && counts ? <>
        <section className="editorial-notice mt-6 flex items-start gap-3"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-[#ce4040]" aria-hidden /><p>Approvals, dispatch, and new requests are disabled. Resolve earlier records through the controlled reconciliation process only.</p></section>
        <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Legacy reconciliation counts">
          <ArchiveCard label="Legacy payout records" count={counts.legacyPayouts} />
          <ArchiveCard label="Manual review records" count={counts.legacyManualPayouts} />
          <ArchiveCard label="Referral transfer records" count={counts.legacyReferralTransfers} />
        </section>
      </> : null}
    </div>
  );
}

function ArchiveCard({ label, count }: { label: string; count: number }) {
  return <article className="workspace-kpi"><p className="workspace-kpi-label">{label}</p><p className="workspace-kpi-value mt-2">{count}</p><p className="mt-1 text-xs text-ink-soft">Non-terminal records</p></article>;
}
