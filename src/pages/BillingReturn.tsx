import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, CircleAlert, Clock3, Loader2, RefreshCw } from "lucide-react";
import { accessDurationLabel, planLabel, planProductLabel, type PaymentReturn, verifyPaymentReturn } from "@/lib/premium";

type State = "loading" | "ready" | "error";
const MAX_AUTOMATIC_CHECKS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const POLL_DELAYS_MS = [2_000, 3_500, 6_000, 10_000, 15_000];

function isReference(value: string | null): value is string {
  return !!value && /^exf_[A-Za-z0-9]{16,160}$/u.test(value);
}

function formatEndDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

function returnedPassLabel(result: PaymentReturn | null): string {
  return result?.product ? planProductLabel(result.product) : planLabel(result?.plan ?? "free");
}

export function BillingReturn() {
  const [params] = useSearchParams();
  const reference = params.get("reference");
  const [state, setState] = useState<State>("loading");
  const [result, setResult] = useState<PaymentReturn | null>(null);
  const [message, setMessage] = useState("");
  const [verificationRequestId, setVerificationRequestId] = useState<string | null>(null);
  const [automaticChecks, setAutomaticChecks] = useState(0);
  const [checking, setChecking] = useState(false);
  const verificationSequence = useRef(0);

  const verify = useCallback(async (manual = false) => {
    const sequence = ++verificationSequence.current;
    if (!isReference(reference)) {
      setState("error");
      setMessage("This payment return link is invalid. Start a new checkout from the plans page.");
      return;
    }
    if (manual) setAutomaticChecks(0);
    setState("loading");
    setChecking(true);
    setMessage("");
    setVerificationRequestId(null);
    let timeout: number | undefined;
    try {
      const payment = await Promise.race<PaymentReturn>([
        verifyPaymentReturn(reference),
        new Promise<never>((_, reject) => {
          timeout = window.setTimeout(
            () => reject(new Error("Payment verification is taking longer than expected. The server will continue checking safely.")),
            REQUEST_TIMEOUT_MS,
          );
        }),
      ]);
      if (sequence !== verificationSequence.current) return;
      setResult(payment);
      setState("ready");
    } catch (error) {
      if (sequence !== verificationSequence.current) return;
      setState("error");
      setMessage(error instanceof Error ? error.message : "We couldn't verify this payment yet.");
      const requestId = error && typeof error === "object" && "requestId" in error && typeof error.requestId === "string"
        ? error.requestId
        : null;
      setVerificationRequestId(requestId);
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (sequence === verificationSequence.current) setChecking(false);
    }
  }, [reference]);

  useEffect(() => {
    document.title = "Payment status - Examify";
    void verify();
    return () => { verificationSequence.current += 1; };
  }, [verify]);

  const pending = result?.status === "pending";
  useEffect(() => {
    if (state !== "ready" || !pending || automaticChecks >= MAX_AUTOMATIC_CHECKS) return;
    const delay = POLL_DELAYS_MS[Math.min(automaticChecks, POLL_DELAYS_MS.length - 1)];
    const timer = window.setTimeout(() => {
      setAutomaticChecks((checks) => checks + 1);
      void verify();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [automaticChecks, pending, state, verify]);

  const referenceDetail = isReference(reference)
    ? <p className="mt-4 text-xs font-semibold tracking-wide text-[#57709a]">Payment reference: {reference}</p>
    : null;
  const paid = result?.status === "paid";
  const failed = result?.status === "failed" || result?.status === "verification_failed";
  const pendingChecksExhausted = automaticChecks >= MAX_AUTOMATIC_CHECKS;

  return <div className="editorial-page-narrow py-12 sm:py-20">
    <section className="editorial-result-sheet p-7 text-center sm:p-10" aria-live="polite">
      {state === "loading" ? <><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#ce4040]" /><p className="editorial-kicker mt-6">Confirming payment</p><h1 className="font-editorial-display mt-4 text-4xl font-semibold tracking-[-0.06em] text-[#14274a]">Checking your payment.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#34507c]">Your access updates only after the payment is verified securely.</p>{referenceDetail}</> : null}
      {state === "error" ? <><CircleAlert className="mx-auto h-9 w-9 text-[#ce4040]" /><p className="editorial-kicker mt-6">Payment status unavailable</p><h1 className="font-editorial-display mt-4 text-4xl font-semibold tracking-[-0.06em] text-[#14274a]">We couldn't confirm this payment yet.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#34507c]">{message}</p><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#34507c]">Do not make another payment until you have checked this reference.</p>{referenceDetail}{verificationRequestId ? <p className="mt-2 text-xs font-semibold tracking-wide text-[#57709a]">Support ID: {verificationRequestId}</p> : null}<div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={() => void verify(true)} disabled={checking} className="editorial-button-primary"><RefreshCw size={16} className={checking ? "animate-spin" : ""} />Check again</button><Link to="/upgrade" className="editorial-button-secondary">View plans</Link></div></> : null}
      {state === "ready" && paid ? <><CheckCircle2 className="mx-auto h-10 w-10 text-[#ce4040]" /><p className="editorial-kicker mt-6">Payment verified</p><h1 className="font-editorial-display mt-4 text-4xl font-semibold tracking-[-0.06em] text-[#14274a]">Your {returnedPassLabel(result)} pass is active.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#34507c]">You can now use this {accessDurationLabel(result?.accessDays)}{formatEndDate(result?.endsAt) ? ` until ${formatEndDate(result?.endsAt)}` : ""}.</p>{referenceDetail}<div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link to="/study" className="editorial-button-primary">Go to study</Link><Link to="/dashboard" className="editorial-button-secondary">Open dashboard</Link></div></> : null}
      {state === "ready" && pending ? <><Clock3 className="mx-auto h-10 w-10 text-[#ce4040]" /><p className="editorial-kicker mt-6">Payment still pending</p><h1 className="font-editorial-display mt-4 text-4xl font-semibold tracking-[-0.06em] text-[#14274a]">We're waiting for confirmation.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#34507c]">{pendingChecksExhausted ? "Confirmation is taking longer than usual. The server will continue reconciling this payment safely." : "We're securely checking this payment again. This page cannot activate access by itself."}</p><p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-[#742726]">Do not make another payment while this reference is being confirmed.</p>{referenceDetail}<div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={() => void verify(true)} disabled={checking} className="editorial-button-primary"><RefreshCw size={16} className={checking ? "animate-spin" : ""} />{checking ? "Checking" : "Check again"}</button><Link to="/upgrade" className="editorial-button-secondary">Back to plans</Link></div></> : null}
      {state === "ready" && failed ? <><CircleAlert className="mx-auto h-10 w-10 text-[#ce4040]" /><p className="editorial-kicker mt-6">Payment not confirmed</p><h1 className="font-editorial-display mt-4 text-4xl font-semibold tracking-[-0.06em] text-[#14274a]">No access was changed.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#34507c]">The payment was not completed or could not be verified against the selected plan. You can start a new secure checkout when ready.</p>{referenceDetail}<Link to="/upgrade" className="editorial-button-primary mt-8">Return to plans</Link></> : null}
      {state === "ready" && !paid && !pending && !failed ? <><CircleAlert className="mx-auto h-10 w-10 text-[#ce4040]" /><p className="editorial-kicker mt-6">Payment status unavailable</p><h1 className="font-editorial-display mt-4 text-4xl font-semibold tracking-[-0.06em] text-[#14274a]">We couldn't display this payment status.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#34507c]">The payment has not been assumed successful. Check again or return to plans.</p>{referenceDetail}<div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={() => void verify(true)} className="editorial-button-primary">Check again</button><Link to="/upgrade" className="editorial-button-secondary">View plans</Link></div></> : null}
    </section>
  </div>;
}
