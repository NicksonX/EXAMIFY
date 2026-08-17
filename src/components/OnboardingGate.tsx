import { Navigate, useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useAccountState } from "@/context/AccountStateContext";
import { saveAccountGateDestination } from "@/lib/authNavigation";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const {
    accountState,
    loading,
    error,
    refreshAccountState,
  } = useAccountState();

  if (loading || (!accountState && !error)) {
    return (
      <main className="auth-page flex min-h-screen items-center justify-center px-5" aria-live="polite">
        <div className="relative text-center text-[#34507c]">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#14274a]/20 border-t-[#ce4040]" />
          <p className="mt-4 text-sm">Checking your account setup...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="auth-page flex min-h-screen items-center justify-center px-5">
        <section className="auth-panel relative w-full max-w-md p-7 text-center sm:p-9">
          <p className="editorial-kicker">Connection problem</p>
          <h1 className="font-editorial-display mt-5 text-3xl font-semibold tracking-[-0.05em] text-[#14274a]">We couldn&apos;t check your account setup</h1>
          <p className="mt-3 text-sm leading-6 text-[#34507c]" role="alert">{error}</p>
          <button type="button" onClick={() => void refreshAccountState()} className="editorial-button-primary mt-7"><RefreshCw size={16} aria-hidden />Try again</button>
        </section>
      </main>
    );
  }

  if (accountState?.termsRequired && location.pathname !== "/terms/accept") {
    saveAccountGateDestination(location);
    return <Navigate to="/terms/accept" replace />;
  }

  if (!accountState?.termsRequired && !accountState?.profileComplete && location.pathname !== "/onboarding") {
    saveAccountGateDestination(location);
    return <Navigate to="/onboarding" replace />;
  }

  if (!accountState?.termsRequired && accountState?.profileComplete && location.pathname === "/onboarding") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
