import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="editorial-footer no-print">
      <div className="editorial-container flex flex-col items-center justify-between gap-4 py-7 sm:flex-row">
        <p className="editorial-wordmark">Exam<span>i</span>fy</p>
        <nav className="flex items-center gap-5 text-xs font-bold text-[#34507c]" aria-label="Footer">
          <Link to="/help" className="hover:text-[#ce4040]">Help Center</Link>
          <Link to="/terms" className="hover:text-[#ce4040]">Terms</Link>
        </nav>
        <p className="text-xs text-[#34507c]">© {new Date().getFullYear()} Examify. Built for Nigerian students.</p>
      </div>
    </footer>
  );
}
