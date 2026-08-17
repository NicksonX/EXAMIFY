import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpFromLine, Eye, EyeOff, Loader2 } from "lucide-react";
import { formatNaira } from "@/lib/premium";
import { formatWholeNairaInput, wholeNairaInputToKobo } from "@/lib/wholeNairaInput";
import {
  cancelManualPayoutRequest,
  filterPayoutBanks,
  getManualPayoutBanks,
  getMyManualPayoutRequestByClientRequestId,
  getMyManualPayoutRequests,
  getWithdrawalPinStatus,
  isManualPayoutSubmissionUnconfirmed,
  requestManualPayout,
  setWithdrawalPin,
  type ManualPayoutBank,
  type ManualPayoutRequest,
  type WalletBalance,
  type WalletSettings,
} from "@/lib/wallet";

export interface ConfirmedManualPayoutSubmission {
  requestId: string;
  amountKobo: number;
  bankName: string;
  accountNumberMasked: string;
  recovered: boolean;
}

function withdrawalStatusLabel(status: string): string {
  switch (status) {
    case "requested":
    case "under_review":
      return "Under review";
    case "approved_for_payment":
    case "submitting":
    case "processing":
    case "reconciliation_required":
      return "Processing";
    case "paid":
      return "Processed";
    case "failed":
    case "rejected":
      return "Unable to process";
    case "cancelled":
      return "Cancelled";
    case "reversed":
      return "Reversed";
    default:
      return "Processing";
  }
}

function PinField({
  id,
  label,
  value,
  onChange,
  visible,
  onVisibilityChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onVisibilityChange: () => void;
  disabled: boolean;
}) {
  return <label className="wallet-action-label" htmlFor={id}>{label}<span className="relative mt-2 block"><input id={id} className="editorial-field w-full pr-24" type={visible ? "text" : "password"} inputMode="numeric" autoComplete="off" maxLength={6} value={value} onChange={(event) => onChange(event.target.value.replace(/\D/gu, ""))} disabled={disabled} /><button type="button" className="absolute inset-y-0 right-0 px-3 text-xs font-bold text-[#34507c] hover:text-[#14274a]" onClick={onVisibilityChange} aria-pressed={visible} disabled={disabled}>{visible ? <EyeOff className="mr-1 inline" size={14} aria-hidden /> : <Eye className="mr-1 inline" size={14} aria-hidden />}{visible ? "Hide PIN" : "Show PIN"}</button></span></label>;
}

export function ManualPayoutCard({
  settings,
  wallet,
  onChanged,
  onSubmissionConfirmed,
}: {
  settings: WalletSettings | null;
  wallet: WalletBalance | null;
  onChanged: () => void | Promise<void>;
  onSubmissionConfirmed?: (submission: ConfirmedManualPayoutSubmission) => void;
}) {
  const enabled = Boolean(settings?.withdrawalsEnabled && settings?.manualPayoutRequestsEnabled);
  const [banks, setBanks] = useState<ManualPayoutBank[]>([]);
  const [requests, setRequests] = useState<ManualPayoutRequest[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [newPinVisible, setNewPinVisible] = useState(false);
  const [confirmPinVisible, setConfirmPinVisible] = useState(false);
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const [step, setStep] = useState<"details" | "amount" | "review" | "pin">("details");
  const [loading, setLoading] = useState(false);
  const [banksLoading, setBanksLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [submissionUnconfirmed, setSubmissionUnconfirmed] = useState(false);
  const normalizedAccountNumber = accountNumber.replace(/\D/gu, "");
  const filteredBanks = useMemo(() => filterPayoutBanks(banks, bankSearch), [banks, bankSearch]);
  const selectedBank = banks.find((bank) => bank.code === bankCode);
  const amountKobo = wholeNairaInputToKobo(amount);
  const amountIsValid = amountKobo !== null && amountKobo >= (settings?.minimumWithdrawalKobo ?? 50_000) && (!wallet || amountKobo <= wallet.availableBalanceKobo);

  const load = useCallback(async () => {
    if (!enabled) return;
    setBanksLoading(true);
    const [bankResult, requestResult] = await Promise.allSettled([
      getManualPayoutBanks(),
      getMyManualPayoutRequests(),
    ]);
    if (bankResult.status === "fulfilled") setBanks(bankResult.value);
    if (requestResult.status === "fulfilled") setRequests(requestResult.value);
    if (bankResult.status === "rejected" || requestResult.status === "rejected") {
      setMessage("We couldn't refresh every withdrawal detail yet.");
    }
    setBanksLoading(false);
  }, [enabled]);

  useEffect(() => { void load(); }, [load]);

  const resetAfterConfirmedSubmission = async (
    submission: ConfirmedManualPayoutSubmission,
  ) => {
    setMessage("");
    setAmount(""); setPin(""); setAccountNumber(""); setAccountHolderName(""); setAcknowledged(false);
    setClientRequestId(crypto.randomUUID()); setSubmissionUnconfirmed(false); setStep("details");
    await load();
    await onChanged();
    onSubmissionConfirmed?.(submission);
  };

  const recoverSubmission = async () => {
    setLoading(true);
    setMessage("");
    try {
      const existing = await getMyManualPayoutRequestByClientRequestId(clientRequestId);
      if (existing) {
        await resetAfterConfirmedSubmission({
          requestId: existing.id,
          amountKobo: existing.amountKobo,
          bankName: existing.bankName,
          accountNumberMasked: existing.accountNumberMasked,
          recovered: true,
        });
        return;
      }
      setSubmissionUnconfirmed(true);
      setMessage("We could not confirm whether this withdrawal request was received. Do not start another withdrawal. Enter your transaction PIN again to check using the same details.");
    } catch {
      setSubmissionUnconfirmed(true);
      setMessage("We could not confirm this withdrawal request yet. Keep these details and check again before starting another withdrawal.");
    } finally {
      setLoading(false);
    }
  };

  const submitDetails = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBank || !/^\d{10}$/u.test(normalizedAccountNumber)) {
      setMessage("Choose your bank and enter its 10-digit account number.");
      return;
    }
    if (accountHolderName.trim().length < 2) {
      setMessage("Enter the account holder's name exactly as it appears on the bank account.");
      return;
    }
    setMessage("");
    setStep("amount");
  };

  const submitAmount = (event: FormEvent) => {
    event.preventDefault();
    if (!amountIsValid) {
      setMessage(wallet && amountKobo !== null && amountKobo > wallet.availableBalanceKobo
        ? "That amount is greater than your confirmed available Wallet balance."
        : `Enter a whole-naira amount of at least ${formatNaira(settings?.minimumWithdrawalKobo ?? 50_000)}.`);
      return;
    }
    if (!submissionUnconfirmed) setClientRequestId(crypto.randomUUID());
    setMessage("");
    setStep("review");
  };

  const continueToPin = async () => {
    setLoading(true);
    setMessage("");
    try {
      setPinConfigured(await getWithdrawalPinStatus());
      setPin(""); setNewPin(""); setConfirmPin("");
      setStep("pin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't check your transaction PIN status.");
    } finally { setLoading(false); }
  };

  const submitPin = async (event: FormEvent) => {
    event.preventDefault();
    const enrollmentPin = newPin;
    if (!pinConfigured) {
      if (!/^\d{6}$/u.test(enrollmentPin) || !/^\d{6}$/u.test(confirmPin)) {
        setMessage("Create and confirm a six-digit transaction PIN.");
        return;
      }
      if (enrollmentPin !== confirmPin) {
        setMessage("The transaction PIN entries do not match.");
        return;
      }
    } else if (!/^\d{6}$/u.test(pin)) {
      setMessage("Enter your six-digit transaction PIN.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      if (!pinConfigured) {
        await setWithdrawalPin(enrollmentPin);
        setPinConfigured(true);
        setNewPin(""); setConfirmPin("");
        setMessage("Transaction PIN saved. Enter it again to submit this request.");
        return;
      }
      const result = await requestManualPayout({
        bankCode,
        accountNumber: normalizedAccountNumber,
        accountHolderName: accountHolderName.trim(),
        amountKobo: amountKobo ?? 0,
        pin,
        clientRequestId,
      });
      await resetAfterConfirmedSubmission({
        requestId: result.requestId,
        amountKobo: amountKobo ?? 0,
        bankName: selectedBank?.name ?? "Your selected bank",
        accountNumberMasked: `******${normalizedAccountNumber.slice(-4)}`,
        recovered: false,
      });
    } catch (error) {
      setPin("");
      if (isManualPayoutSubmissionUnconfirmed(error)) {
        await recoverSubmission();
        return;
      }
      setMessage(error instanceof Error ? error.message : "We couldn't place this withdrawal request.");
    } finally { setLoading(false); }
  };

  const cancel = async (requestId: string) => {
    setLoading(true); setMessage("");
    try {
      await cancelManualPayoutRequest(requestId);
      setMessage("Withdrawal request cancelled.");
      await load(); onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This withdrawal request can no longer be cancelled.");
    } finally { setLoading(false); }
  };

  return (
    <article className="wallet-action-card" aria-busy={loading}>
      <div className="wallet-action-heading"><span className="wallet-action-icon"><ArrowUpFromLine size={21} aria-hidden /></span><div><p className="wallet-overline">Bank withdrawal</p><h2>Submit bank details</h2></div></div>
      {!enabled ? <p>Bank withdrawals are temporarily unavailable. Your confirmed Wallet balance remains unchanged.</p> : <>
        <p>Enter your bank details exactly as they appear. Withdrawals are typically processed within 30 minutes to 48 hours. You will be notified once your withdrawal has been processed.</p>
        {message ? <p className="editorial-notice mt-4" role="status">{message}</p> : null}
        {step === "details" ? <form className="mt-4 space-y-3" onSubmit={submitDetails}>
          <p className="wallet-action-help"><b>1. Bank details</b> — account-name verification is not used. Double-check every detail before submitting.</p>
          <label className="wallet-action-label" htmlFor="manual-bank-search">Search bank<input id="manual-bank-search" type="search" className="editorial-field mt-2" value={bankSearch} onChange={(event) => setBankSearch(event.target.value)} placeholder="Search Nigerian banks" autoComplete="off" disabled={loading || banksLoading} /></label>
          <label className="wallet-action-label" htmlFor="manual-bank">Bank<select id="manual-bank" className="editorial-field mt-2" value={bankCode} onChange={(event) => setBankCode(event.target.value)} disabled={loading || banksLoading || !filteredBanks.length}><option value="">{banksLoading ? "Loading Nigerian banks…" : "Choose a Nigerian bank"}</option>{filteredBanks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label>
          <label className="wallet-action-label" htmlFor="manual-account-number">10-digit account number<input id="manual-account-number" className="editorial-field mt-2" inputMode="numeric" autoComplete="off" maxLength={10} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/gu, ""))} disabled={loading || banksLoading} /></label>
          <label className="wallet-action-label" htmlFor="manual-account-holder">Account holder name<input id="manual-account-holder" className="editorial-field mt-2" autoComplete="name" maxLength={160} value={accountHolderName} onChange={(event) => setAccountHolderName(event.target.value)} disabled={loading} placeholder="Name exactly as shown by your bank" /></label>
          <p className="wallet-action-help">The name is supplied by you and is not automatically verified. Incorrect details may delay or prevent payment.</p>
          <button type="submit" className="editorial-button-secondary" disabled={loading || banksLoading || !banks.length}>Continue</button>
        </form> : null}
        {step === "amount" ? <form className="mt-5 space-y-3 border-t border-line pt-5" onSubmit={submitAmount}><p className="wallet-action-help"><b>2. Withdrawal amount</b> — your funds are reserved while the request is being processed.</p><p className="text-sm">{selectedBank?.name} · ******{normalizedAccountNumber.slice(-4)} · {accountHolderName.trim()}</p><label className="wallet-action-label" htmlFor="manual-payout-amount">Amount (₦)<input id="manual-payout-amount" className="editorial-field mt-2" type="text" inputMode="numeric" autoComplete="off" value={amount} onChange={(event) => { const next = formatWholeNairaInput(event.target.value); if (next !== null) setAmount(next); }} disabled={loading} /></label><p className="wallet-action-help">Available: {formatNaira(wallet?.availableBalanceKobo ?? 0)} · Minimum: {formatNaira(settings?.minimumWithdrawalKobo ?? 50_000)}.</p><div className="flex gap-3"><button type="button" className="editorial-button-secondary" onClick={() => setStep("details")} disabled={loading || submissionUnconfirmed}>Back</button><button type="submit" className="wallet-money-button" disabled={loading}>Review withdrawal</button></div></form> : null}
        {step === "review" ? <section className="mt-5 space-y-4 border-t border-line pt-5"><p className="wallet-action-help"><b>3. Double-check details</b></p><div className="border border-[#ce4040]/40 bg-[#fff4ed] p-4 text-sm leading-6"><p><b>{formatNaira(amountKobo ?? 0)}</b> to <b>{accountHolderName.trim()}</b></p><p>{selectedBank?.name} · account ending {normalizedAccountNumber.slice(-4)}</p><p className="mt-2 text-[#742726]">This name was entered by you, not verified automatically. Check the bank, account number, name, and amount carefully.</p></div><label className="flex gap-3 text-sm"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={loading} />I have double-checked these details and understand the request will be processed.</label><div className="flex flex-wrap gap-3"><button type="button" className="editorial-button-secondary" onClick={() => setStep("amount")} disabled={loading || submissionUnconfirmed}>Back</button><button type="button" className="editorial-button-primary" onClick={() => void continueToPin()} disabled={loading || !acknowledged}>Continue to PIN</button></div></section> : null}
        {step === "pin" ? <form className="mt-5 space-y-3 border-t border-line pt-5" onSubmit={submitPin}><p className="wallet-action-help"><b>4. {pinConfigured ? "Enter transaction PIN" : "Create transaction PIN"}</b> — never share it.</p>{pinConfigured ? <PinField id="manual-payout-pin" label="Six-digit transaction PIN" value={pin} onChange={setPin} visible={pinVisible} onVisibilityChange={() => setPinVisible((value) => !value)} disabled={loading} /> : <><PinField id="manual-payout-new-pin" label="Create six-digit transaction PIN" value={newPin} onChange={setNewPin} visible={newPinVisible} onVisibilityChange={() => setNewPinVisible((value) => !value)} disabled={loading} /><PinField id="manual-payout-confirm-pin" label="Confirm transaction PIN" value={confirmPin} onChange={setConfirmPin} visible={confirmPinVisible} onVisibilityChange={() => setConfirmPinVisible((value) => !value)} disabled={loading} /></>}<div className="flex flex-wrap gap-3"><button type="button" className="editorial-button-secondary" onClick={() => setStep("review")} disabled={loading || submissionUnconfirmed}>Back</button>{submissionUnconfirmed ? <button type="button" className="editorial-button-secondary" onClick={() => void recoverSubmission()} disabled={loading}>Check request status</button> : null}<button type="submit" className="editorial-button-primary" disabled={loading}>{loading ? <Loader2 className="animate-spin" size={16} /> : null}{pinConfigured ? "Submit withdrawal request" : "Save PIN"}</button></div></form> : null}
        {requests.length ? <div className="mt-5 border-t border-line pt-4 text-sm"><b>Recent withdrawal requests</b><ul className="mt-3 space-y-3">{requests.slice(0, 5).map((request) => <li key={request.id} className="flex items-center justify-between gap-3"><span>{formatNaira(request.amountKobo)} · {withdrawalStatusLabel(request.status)}</span>{request.status === "requested" ? <button type="button" className="text-xs font-bold underline" disabled={loading} onClick={() => void cancel(request.id)}>Cancel</button> : null}</li>)}</ul></div> : null}
      </>}
    </article>
  );
}
