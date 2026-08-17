import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { consumePostLoginDestination } from "@/lib/authNavigation";
import { useAuth } from "@/context/AuthContext";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";

export function Login() {
  const { user, loading, authError, retrySession } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!loading && user) {
      navigate(consumePostLoginDestination(), { replace: true });
    }
  }, [loading, navigate, user]);

  return (
    <main className="auth-page flex min-h-screen items-center px-5 py-8 sm:px-8">
      <div className="auth-page-glow" aria-hidden />
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="auth-panel relative mx-auto w-full max-w-md p-6 sm:p-9"
      >
        <Link to="/" className="editorial-text-link inline-flex items-center gap-2">
          <ArrowLeft size={16} aria-hidden /> Back to Examify
        </Link>

        <div className="mt-10">
          <p className="editorial-wordmark">Exam<span>i</span>fy</p>
          <p className="editorial-kicker mt-8">Student access</p>
          <h1 className="font-editorial-display mt-3 text-4xl font-semibold leading-[0.88] tracking-[-0.06em] text-[#14274a] sm:text-5xl">Your learning space is ready.</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#34507c]">Sign in securely to continue studying, take timed practice, and review completed results.</p>
        </div>

        {loading ? (
          <div className="mt-8 flex items-center gap-3 border-y border-[#14274a]/15 px-1 py-4 text-sm text-[#34507c]" aria-live="polite">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#14274a]/20 border-t-[#ce4040]" />
            Checking your session...
          </div>
        ) : user ? null : (
          <div className="mt-8">
            <SocialAuthButtons showError={false} />
            {authError ? (
              <div role="alert" className="auth-inline-error mt-3">
                <p>{authError}</p>
                <button type="button" onClick={() => void retrySession()} className="mt-2 font-semibold underline underline-offset-2">Check connection again</button>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-8 flex items-start gap-3 border-t border-[#14274a]/15 pt-5 text-xs leading-5 text-[#34507c]">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#ce4040]" aria-hidden />
          <p>Secure sign-in. We never see or store your password. By continuing, you agree to use Examify responsibly for your own learning.</p>
        </div>
      </motion.section>
    </main>
  );
}
