import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { useAuth } from "@/context/AuthContext";
import { consumePostLoginDestination } from "@/lib/authNavigation";

function providerErrorMessage(): string | null {
  const error = new URLSearchParams(window.location.search).get("error");
  if (!error) return null;
  if (error === "access_denied") return "Sign-in was cancelled. You can try again whenever you are ready.";
  return "We couldn't complete sign-in. Check the provider setup and try again.";
}

export function AuthCallback() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { user, loading, authError } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const providerError = useMemo(() => providerErrorMessage(), []);
  const error = providerError ?? authError ?? (timedOut ? "Sign-in is taking longer than expected. Please try again." : null);

  useEffect(() => {
    if (providerError || user || loading) return;
    const timeout = window.setTimeout(() => setTimedOut(true), 12_000);
    return () => window.clearTimeout(timeout);
  }, [loading, providerError, user]);

  useEffect(() => {
    if (providerError || loading || !user) return;
    navigate(consumePostLoginDestination(), { replace: true });
  }, [loading, navigate, providerError, user]);

  if (error) {
    return (
      <main className="auth-page flex min-h-screen items-center justify-center px-5 py-8">
        <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="auth-panel w-full max-w-md p-7 text-center sm:p-9">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[2px] bg-[#14274a] text-white"><CircleAlert size={22} aria-hidden /></span>
          <p className="editorial-kicker mt-6">Sign-in needs attention</p>
          <h1 className="font-editorial-display mt-5 text-3xl font-semibold tracking-[-0.05em] text-[#14274a]">Couldn't finish sign-in</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-[#34507c]">{error}</p>
          <SocialAuthButtons showError={false} className="mt-7" />
          <Link to="/login" className="editorial-text-link mt-5 inline-flex items-center gap-2"><ArrowLeft size={16} aria-hidden /> Back to sign-in</Link>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="auth-page flex min-h-screen items-center justify-center px-5">
      <div className="auth-panel w-full max-w-md p-8 text-center sm:p-10" aria-live="polite">
        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-2 border-[#14274a]/20 border-t-[#ce4040]" />
        <p className="font-editorial-display mt-5 text-3xl font-semibold tracking-[-0.05em] text-[#14274a]">Finishing sign-in</p>
        <p className="mt-2 text-sm text-[#34507c]">Securing your Examify session...</p>
      </div>
    </main>
  );
}
