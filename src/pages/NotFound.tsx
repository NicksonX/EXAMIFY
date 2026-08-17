import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function NotFound() {
  return (
    <main className="auth-page flex min-h-screen items-center justify-center px-5 text-center">
      <section className="auth-panel w-full max-w-md p-8 sm:p-10">
        <p className="font-editorial-display text-7xl font-semibold tracking-[-0.08em] text-[#ce4040]">404</p>
        <h1 className="font-editorial-display mt-4 text-3xl font-semibold tracking-[-0.05em] text-[#14274a]">This page isn't here.</h1>
        <p className="mt-3 text-sm leading-6 text-[#34507c]">The link may be out of date, or the page may have moved.</p>
        <Link to="/" className="editorial-button-primary mt-8"><ArrowLeft size={16} aria-hidden /> Back to home</Link>
      </section>
    </main>
  );
}
