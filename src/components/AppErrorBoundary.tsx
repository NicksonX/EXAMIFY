import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  failed: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // Errors are intentionally not rendered or sent to a browser-visible endpoint.
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="auth-page flex min-h-screen items-center justify-center px-5">
        <section className="auth-panel w-full max-w-lg p-7 text-center sm:p-9" role="alert">
          <CircleAlert className="mx-auto h-10 w-10 text-[#ce4040]" aria-hidden />
          <p className="editorial-kicker mt-6">Page unavailable</p>
          <h1 className="font-editorial-display mt-4 text-3xl font-semibold tracking-[-0.05em] text-[#14274a]">We couldn&apos;t display this page.</h1>
          <p className="mt-3 text-sm leading-6 text-[#34507c]">Your account and Wallet have not been changed. You can retry safely or return to a familiar page.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" className="editorial-button-primary" onClick={() => window.location.reload()}><RefreshCw size={16} aria-hidden />Try again</button>
            <a href="/wallet" className="editorial-button-secondary">Wallet</a>
            <a href="/help" className="editorial-button-secondary">Help</a>
          </div>
        </section>
      </main>
    );
  }
}
