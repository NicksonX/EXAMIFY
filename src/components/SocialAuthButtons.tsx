import { Loader2 } from "lucide-react";
import { useAuth, type SupportedOAuthProvider } from "@/context/AuthContext";

interface SocialAuthButtonsProps {
  showError?: boolean;
  className?: string;
}

const PROVIDERS: { provider: SupportedOAuthProvider; label: string }[] = [
  { provider: "google", label: "Continue with Google" },
  { provider: "apple", label: "Continue with Apple" },
];

export function SocialAuthButtons({ showError = true, className = "" }: SocialAuthButtonsProps) {
  const { authError, signingInProvider, signInWithProvider } = useAuth();

  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDERS.map(({ provider, label }) => {
          const opening = signingInProvider === provider;
          return (
            <button
              key={provider}
              type="button"
              onClick={() => void signInWithProvider(provider)}
              disabled={signingInProvider !== null}
              aria-busy={opening}
              className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[2px] border border-[#14274a]/25 bg-[#fffdfa]/80 px-4 py-3 text-sm font-bold text-[#14274a] transition hover:border-[#14274a] hover:bg-[#fffdfa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ce4040]/40 disabled:cursor-wait disabled:opacity-60"
            >
              {opening ? <Loader2 size={19} className="animate-spin text-[#ce4040]" aria-hidden /> : provider === "google" ? <GoogleMark /> : <AppleMark />}
              <span>{opening ? `Opening ${provider === "apple" ? "Apple" : "Google"}...` : label}</span>
            </button>
          );
        })}
      </div>

      {showError && authError ? <p role="alert" className="auth-inline-error mt-3">{authError}</p> : null}
    </div>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M16.7 12.4c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.8-1.4-.2-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 6.9 1.2 9.2.8 1.1 1.7 2.4 2.9 2.3 1.1 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.8-1.1-2.8-3.6ZM14.5 5.8c.7-.9 1.1-2.1 1-3.3-1 .1-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.2-.5 2.9-1.3Z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 32.464 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}
