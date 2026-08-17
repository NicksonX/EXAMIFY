import { Navigate, useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { savePostLoginDestination } from "@/lib/authNavigation";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, authError, retrySession } = useAuth();
  const location = useLocation();
  const editorial = !location.pathname.startsWith("/dashboard") && !location.pathname.startsWith("/exam");

  if (loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${editorial ? "auth-page" : "bg-canvas"}`} aria-live="polite">
        <div className={editorial ? "relative text-center text-[#34507c]" : "text-center"}>
          <div className={`mx-auto h-10 w-10 animate-spin rounded-full border-2 ${editorial ? "border-[#14274a]/20 border-t-[#ce4040]" : "border-line border-t-accent"}`} />
          <p className={`mt-4 text-sm ${editorial ? "text-[#34507c]" : "text-ink-soft"}`}>Checking your session...</p>
        </div>
      </div>
    );
  }

  if (authError && !user) {
    return (
      <main className={`flex min-h-screen items-center justify-center px-5 ${editorial ? "auth-page" : "bg-canvas"}`}>
        <div className="auth-panel relative w-full max-w-md p-7 text-center sm:p-9">
          <p className={editorial ? "editorial-kicker" : "text-xs font-extrabold uppercase tracking-[0.14em] text-accent"}>Connection problem</p>
          <h1 className={editorial ? "font-editorial-display mt-5 text-3xl font-semibold tracking-[-0.05em] text-[#14274a]" : "mt-3 font-display text-2xl font-bold text-ink"}>We couldn't check your access</h1>
          <p role="alert" className={editorial ? "mt-3 text-sm leading-6 text-[#34507c]" : "mt-3 text-sm leading-6 text-ink-soft"}>{authError}</p>
          <button type="button" onClick={() => void retrySession()} className={editorial ? "editorial-button-primary mt-7" : "btn-primary mt-7"}><RefreshCw size={16} aria-hidden /> Try again</button>
        </div>
      </main>
    );
  }

  if (!user) {
    savePostLoginDestination(location);
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
