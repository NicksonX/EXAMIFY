import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useAccountState } from "@/context/AccountStateContext";
import { consumeAccountGateDestination } from "@/lib/authNavigation";
import { termsFrom, type CurrentTerms } from "@/lib/accountState";
import { supabase } from "@/lib/supabase";

function effectiveDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-NG", { dateStyle: "long" }).format(date);
}

export function Terms({ acceptanceRequired = false }: { acceptanceRequired?: boolean }) {
  const navigate = useNavigate();
  const { accountState, acceptCurrentTerms } = useAccountState();
  const termsUnavailable = accountState?.termsAvailable === false;
  const [terms, setTerms] = useState<CurrentTerms | null>(accountState?.terms ?? null);
  const [loading, setLoading] = useState(!accountState?.terms && !termsUnavailable);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [confirmedRead, setConfirmedRead] = useState(false);

  const loadTerms = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("get_current_terms");
    const currentTerms = termsFrom(data);
    if (rpcError || !currentTerms) {
      setError("We couldn't load the current Terms of Service. Please try again.");
      setLoading(false);
      return;
    }
    setTerms(currentTerms);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!terms && !termsUnavailable) void loadTerms();
  }, [loadTerms, terms, termsUnavailable]);

  const acceptTerms = async () => {
    if (!confirmedRead) return;
    setAccepting(true);
    setError(null);
    try {
      await acceptCurrentTerms();
      navigate(consumeAccountGateDestination(), { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't record your acceptance. Please try again.");
      setAccepting(false);
    }
  };

  const date = effectiveDate(terms?.effectiveAt ?? null);

  return (
    <section className="editorial-page-narrow">
      <p className="editorial-kicker">Examify policies</p>
      <h1 className="editorial-section-title mt-5">Terms of Service</h1>
      <p className="editorial-copy mt-5 max-w-2xl">These terms explain the rules for using Examify and the responsibilities that keep our learning space fair and secure.</p>

      {acceptanceRequired ? (
        <section className="editorial-notice mt-8 flex items-start gap-3" aria-labelledby="terms-acceptance-heading">
          <ShieldCheck size={19} className="mt-0.5 shrink-0 text-[#ce4040]" aria-hidden />
          <div>
            <h2 id="terms-acceptance-heading" className="font-bold text-[#14274a]">Review and accept the current terms</h2>
            <p className="mt-1">You need to accept this version before continuing to your learning space.</p>
          </div>
        </section>
      ) : null}

      <article className="editorial-panel mt-8 p-5 sm:p-8" aria-busy={loading}>
        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-[#34507c]" aria-live="polite"><Loader2 size={19} className="animate-spin text-[#ce4040]" aria-hidden />Loading current terms...</div>
        ) : null}
        {!loading && termsUnavailable ? (
          <div className="editorial-error" role="alert">
            <p>Terms are not currently published. Account setup is unavailable until the current Terms are published.</p>
          </div>
        ) : null}
        {!loading && !termsUnavailable && error ? (
          <div className="editorial-error" role="alert"><p>{error}</p><button type="button" className="editorial-text-link mt-3" onClick={() => void loadTerms()}><RefreshCw size={14} className="mr-1 inline" aria-hidden />Try again</button></div>
        ) : null}
        {!loading && !termsUnavailable && !error && terms ? (
          <>
            <header className="border-b border-[#14274a]/15 pb-5">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#ce4040]">Version {terms.version}</p>
              {date ? <p className="mt-2 text-sm text-[#34507c]">Effective {date}</p> : null}
            </header>
            <div className="whitespace-pre-wrap py-6 text-sm leading-7 text-[#34507c]">{terms.content}</div>
          </>
        ) : null}
      </article>

      {acceptanceRequired ? (
        <div className="mt-8 flex flex-col items-start gap-4 border-t border-[#14274a]/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex max-w-md items-start gap-3 text-xs leading-5 text-[#34507c]">
            <input type="checkbox" checked={confirmedRead} onChange={(event) => setConfirmedRead(event.target.checked)} disabled={!terms || loading || accepting} className="mt-0.5 h-4 w-4 accent-[#ce4040]" />
            <span>I have read and agree to this version of the Terms of Service.</span>
          </label>
          <button type="button" onClick={() => void acceptTerms()} disabled={!terms || loading || accepting || !confirmedRead} className="editorial-button-primary shrink-0">{accepting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}{accepting ? "Saving acceptance..." : "Accept and continue"}</button>
        </div>
      ) : (
        <div className="mt-8 border-t border-[#14274a]/15 pt-6"><Link to="/login" className="editorial-button-primary">Sign in to continue learning</Link></div>
      )}
    </section>
  );
}
