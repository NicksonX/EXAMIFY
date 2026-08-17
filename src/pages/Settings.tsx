import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail, ShieldAlert, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

function playDeletionWarning(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(520, context.currentTime);
    oscillator.frequency.setValueAtTime(390, context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.36);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.38);
    window.setTimeout(() => void context.close(), 600);
  } catch {
    // Warning audio is supplementary and must never block the confirmation UI.
  }
}

export function Settings() {
  const { user, signOut } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailStatus, setEmailStatus] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleteStatus, setDeleteStatus] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const emailMatches = Boolean(user?.email) && confirmation.trim().toLowerCase() === user?.email?.toLowerCase();

  useEffect(() => {
    if (!deleteDialogOpen) return;
    cancelButtonRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) {
        event.preventDefault();
        setDeleteDialogOpen(false);
        setAcknowledged(false);
        window.setTimeout(() => continueButtonRef.current?.focus(), 0);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const items = Array.from(focusable);
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [deleteDialogOpen, deleting]);

  const updateEmail = async (event: FormEvent) => {
    event.preventDefault();
    const next = email.trim();
    if (!next || next.toLowerCase() === user?.email?.toLowerCase()) {
      setEmailStatus("Enter a different email address to request an update.");
      return;
    }
    setEmailBusy(true);
    setEmailStatus("");
    const { error } = await supabase.auth.updateUser({ email: next });
    setEmailBusy(false);
    setEmailStatus(error ? error.message : "Check your email for Supabase confirmation instructions. Your account email changes only after confirmation.");
  };

  const openDeletionConfirmation = (event: FormEvent) => {
    event.preventDefault();
    if (!emailMatches) {
      setDeleteStatus("Type your currently registered email address exactly to continue.");
      return;
    }
    setDeleteStatus("");
    setAcknowledged(false);
    playDeletionWarning();
    setDeleteDialogOpen(true);
  };

  const closeDeletionConfirmation = () => {
    if (deleting) return;
    setDeleteDialogOpen(false);
    setAcknowledged(false);
    window.setTimeout(() => continueButtonRef.current?.focus(), 0);
  };

  const deleteAccount = async () => {
    if (!user?.email || !emailMatches || !acknowledged || deleting) return;
    setDeleting(true);
    setDeleteStatus("");
    const { data, error } = await supabase.functions.invoke("request-account-deletion", {
      body: { confirmedEmail: confirmation.trim() },
    });
    if (error || !(data as { deleted?: unknown } | null)?.deleted) {
      setDeleteStatus(error?.message ?? "We couldn't delete the account. Resolve any pending financial activity and try again.");
      setDeleting(false);
      return;
    }
    setDeleteStatus("Your account was deleted. Signing you out now.");
    setDeleteDialogOpen(false);
    await signOut();
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !deleting) closeDeletionConfirmation();
  };

  return <div className="workspace-page"><header className="workspace-page-heading"><div><p className="eyebrow">Settings</p><h1 className="workspace-title mt-2">Manage your account</h1><p className="workspace-subtitle">Email changes are confirmed through Supabase. Account deletion is permanent for your access and profile data.</p></div></header>
    <section className="mt-6 grid gap-5 xl:grid-cols-2"><form className="surface-panel p-5 sm:p-6" onSubmit={updateEmail}><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#14274a] text-white"><Mail size={18} /></span><div><p className="editorial-kicker">Email address</p><h2 className="workspace-module-title mt-2">Update your email</h2></div></div><p className="mt-4 text-sm leading-6 text-ink-soft">Current email: <b className="text-ink">{user?.email ?? "Unavailable"}</b></p><label className="mt-5 block text-xs font-bold text-ink-soft">New email<input className="editorial-field mt-2" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={emailBusy} /></label>{emailStatus ? <p className="editorial-notice mt-4" role="status">{emailStatus}</p> : null}<button type="submit" className="editorial-button-primary mt-5" disabled={emailBusy}>{emailBusy ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Request email update</button></form>
      <form className="border border-[#ce4040]/50 bg-[#fffdfa]/75 p-5 sm:p-6" onSubmit={openDeletionConfirmation}><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#ce4040] text-white"><ShieldAlert size={18} /></span><div><p className="editorial-kicker">Danger zone</p><h2 className="workspace-module-title mt-2">Delete your account</h2></div></div><p className="mt-4 text-sm leading-6 text-ink-soft">This removes your Examify profile and access permanently. Financial and audit records may be retained securely where required. Any earlier records that need reconciliation remain protected.</p><label className="mt-5 block text-xs font-bold text-ink-soft">Type your registered email to confirm<input className="editorial-field mt-2" type="email" autoComplete="off" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setDeleteStatus(""); }} disabled={deleting} /></label>{deleteStatus ? <p className="editorial-error mt-4" role="alert"><AlertTriangle className="mr-1 inline" size={14} />{deleteStatus}</p> : null}<button ref={continueButtonRef} type="submit" className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 bg-[#ce4040] px-5 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={deleting || !emailMatches}><AlertTriangle size={16} />Continue to deletion confirmation</button></form></section>

    {deleteDialogOpen ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#14274a]/60 p-4 sm:p-6" role="presentation"><div ref={dialogRef} onKeyDown={onDialogKeyDown} role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" className="w-full max-w-lg border border-[#ce4040]/60 bg-[#fffdfa] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#ce4040] text-white"><ShieldAlert size={21} /></span><button type="button" onClick={closeDeletionConfirmation} disabled={deleting} aria-label="Cancel account deletion" className="flex h-10 w-10 items-center justify-center text-[#34507c] hover:bg-[#eee5d6] disabled:opacity-50"><X size={19} /></button></div><p className="editorial-kicker mt-6">Final confirmation</p><h2 id="delete-account-title" className="font-editorial-display mt-3 text-4xl font-semibold tracking-[-0.055em] text-[#14274a]">Delete your account?</h2><p id="delete-account-description" className="mt-4 text-sm leading-6 text-[#34507c]">This permanently removes your Examify profile and future access. Required financial and audit records remain protected for legal and operational retention. This cannot be undone.</p><label className="mt-6 flex cursor-pointer items-start gap-3 border-y border-[#14274a]/15 py-4 text-sm leading-6 text-[#14274a]"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={deleting} className="mt-1 h-4 w-4 accent-[#ce4040]" /><span>I understand that I will permanently lose access to my Examify account.</span></label><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button ref={cancelButtonRef} type="button" onClick={closeDeletionConfirmation} disabled={deleting} className="editorial-button-secondary">Cancel and keep my account</button><button type="button" onClick={() => void deleteAccount()} disabled={deleting || !acknowledged} className="inline-flex min-h-11 items-center justify-center gap-2 bg-[#ce4040] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{deleting ? <Loader2 className="animate-spin" size={16} /> : <AlertTriangle size={16} />}{deleting ? "Deleting account" : "Delete my account permanently"}</button></div></div></div> : null}
  </div>;
}
