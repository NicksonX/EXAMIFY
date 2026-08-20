import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAccountState } from "@/context/AccountStateContext";
import { consumeAccountGateDestination } from "@/lib/authNavigation";
import { normalisedAvatar, trustedProviderAvatar } from "@/lib/avatar";
import { useAuth } from "@/context/AuthContext";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function Onboarding() {
  const { user } = useAuth();
  const { accountState, completeOnboardingProfile } = useAccountState();
  const navigate = useNavigate();
  const [username, setUsername] = useState(accountState?.profile?.username ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [normalisingAvatar, setNormalisingAvatar] = useState(false);
  const avatarSelectionSequence = useRef(0);
  const preview = useMemo(() => (avatar ? URL.createObjectURL(avatar) : null), [avatar]);
  const accountAvatar = accountState?.profile?.avatarUrl
    ?? trustedProviderAvatar(user);
  const initial = username.trim().charAt(0).toUpperCase()
    || (user?.email?.charAt(0).toUpperCase() ?? "S");

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const selectAvatar = async (file: File | null) => {
    if (!file) return;
    const selection = ++avatarSelectionSequence.current;
    setNormalisingAvatar(true);
    setError(null);
    try {
      const prepared = await normalisedAvatar(file);
      if (selection !== avatarSelectionSequence.current) return;
      setAvatar(prepared);
    } catch (caught) {
      if (selection !== avatarSelectionSequence.current) return;
      setAvatar(null);
      setError(caught instanceof Error ? caught.message : "We couldn't prepare that image. Choose another picture.");
    } finally {
      if (selection === avatarSelectionSequence.current) setNormalisingAvatar(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextUsername = username.trim();
    if (!USERNAME_PATTERN.test(nextUsername)) {
      setError("Use 3–20 lowercase letters, numbers, or underscores for your username.");
      return;
    }
    if (normalisingAvatar) {
      setError("Your image is still being prepared. Please wait a moment.");
      return;
    }
    if (!avatar && !accountAvatar) {
      setError("Add a profile picture to continue, or sign in with a provider that supplies one.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await completeOnboardingProfile(nextUsername, avatar);
      navigate(consumeAccountGateDestination(), { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't save your profile. Please try again.");
      setSaving(false);
    }
  };

  return (
    <section className="editorial-page-narrow">
      <p className="editorial-kicker">Set up your account</p>
      <h1 className="editorial-section-title mt-5">Make your learning space yours.</h1>
      <p className="editorial-copy mt-5 max-w-xl">Choose the name learners will see on your Examify account. We use a trusted provider photo automatically when one is available, or you can add your own.</p>

      <form className="editorial-panel mt-8 p-5 sm:p-8" onSubmit={(event) => void submit(event)}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-[#14274a]/20 bg-[#eee5d6]">
            {preview || accountAvatar ? <img src={preview ?? accountAvatar ?? undefined} alt="Selected profile" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-[#14274a] font-editorial-display text-4xl font-semibold text-white" aria-hidden>{initial}</span>}
          </div>
          <div>
            <p className="font-editorial-display text-2xl font-semibold tracking-[-0.04em] text-[#14274a]">Your profile photo</p>
            <p className="mt-1 text-sm leading-6 text-[#34507c]">{accountAvatar ? "A trusted provider photo is already available. You can replace it at any time." : "Add a photo if your sign-in provider did not supply one; we safely resize and convert it to a private profile image."}</p>
            <label className="editorial-button-secondary mt-4 cursor-pointer"><Upload size={16} aria-hidden />{normalisingAvatar ? "Preparing image..." : avatar ? "Choose another image" : accountAvatar ? "Replace image" : "Choose image"}<input type="file" accept="image/*" className="sr-only" onChange={(event) => void selectAvatar(event.target.files?.[0] ?? null)} disabled={saving || normalisingAvatar} required={!accountAvatar} /></label>
          </div>
        </div>

        <label className="mt-8 block text-xs font-bold text-[#34507c]" htmlFor="username">Username
          <input id="username" name="username" className="editorial-field mt-2" value={username} onChange={(event) => { setUsername(event.target.value.toLowerCase()); setError(null); }} autoComplete="username" autoCapitalize="none" maxLength={20} pattern="[a-z0-9_]{3,20}" aria-describedby="username-help" disabled={saving} required />
        </label>
        <p id="username-help" className="mt-2 text-xs leading-5 text-[#34507c]">Use 3–20 lowercase letters, numbers, or underscores. This helps identify your account without exposing your email.</p>

        {error ? <p className="editorial-error mt-6" role="alert">{error}</p> : null}
        <div className="mt-8 flex flex-col-reverse gap-4 border-t border-[#14274a]/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-xs leading-5 text-[#34507c]"><Camera size={15} className="mt-0.5 shrink-0 text-[#ce4040]" aria-hidden />Your photo and username are only used to personalize your Examify account.</p>
          <button type="submit" disabled={saving || normalisingAvatar} className="editorial-button-primary shrink-0">{saving || normalisingAvatar ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}{saving ? "Saving profile..." : normalisingAvatar ? "Preparing image..." : "Continue to Examify"}</button>
        </div>
      </form>
    </section>
  );
}
