import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAccountState } from "@/context/AccountStateContext";
import { Footer } from "@/components/layout/Footer";
import { displayIdentity } from "@/lib/accountState";

export function EditorialShell() {
  const { user, signOut } = useAuth();
  const { accountState } = useAccountState();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const handleSignOut = async () => {
    const complete = await signOut();
    if (complete) navigate("/login", { replace: true });
  };

  const publicNav = [
    { href: "/#features", label: "Features" },
    { href: "/#subjects", label: "Subjects" },
    { href: "/#pricing", label: "Pricing" },
    { href: "/help", label: "Help" },
  ];
  const signedInNav = [
    { to: "/study", label: "Study" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/upgrade", label: "Premium" },
    { to: "/help", label: "Help" },
  ];
  const accountName = displayIdentity(
    accountState?.profile,
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email,
  );

  return (
    <div className="editorial-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="editorial-header no-print sticky top-0 z-30 backdrop-blur">
        <nav className="editorial-container editorial-header-inner" aria-label="Primary">
          <Link to="/" className="editorial-wordmark">Exam<span>i</span>fy</Link>
          <div className="editorial-nav hidden md:flex">
            {user ? signedInNav.map((item) => <Link key={item.to} to={item.to} className="editorial-nav-link">{item.label}</Link>) : publicNav.map((item) => <a key={item.href} href={item.href} className="editorial-nav-link">{item.label}</a>)}
          </div>
          <div className="editorial-header-actions justify-self-end">
            {user ? (
              <div className="hidden items-center gap-3 md:flex">
                <span className="max-w-32 truncate text-[0.68rem] font-bold text-[#34507c]">{accountName}</span>
                <button type="button" onClick={() => void handleSignOut()} className="editorial-button-primary min-h-9 px-4 py-2 text-[0.68rem]"><LogOut size={14} aria-hidden />Log out</button>
              </div>
            ) : (
              <Link to="/login" className="editorial-button-primary hidden min-h-9 px-4 py-2 text-[0.68rem] md:inline-flex">Sign in</Link>
            )}
            <button ref={menuButtonRef} type="button" onClick={() => setMenuOpen((value) => !value)} className="inline-flex h-11 w-11 items-center justify-center text-[#14274a] md:hidden" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="editorial-menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </nav>
        {menuOpen ? (
          <div id="editorial-menu" className="border-t border-[#14274a]/15 bg-[#f7f2e9] md:hidden">
            <div className="editorial-container py-3">
              <div className="grid gap-1">
                {user ? signedInNav.map((item) => <Link key={item.to} to={item.to} onClick={closeMenu} className="flex min-h-11 items-center px-2 text-sm font-bold text-[#14274a] hover:text-[#ce4040]">{item.label}</Link>) : publicNav.map((item) => <a key={item.href} href={item.href} onClick={closeMenu} className="flex min-h-11 items-center px-2 text-sm font-bold text-[#14274a] hover:text-[#ce4040]">{item.label}</a>)}
                {user ? <button type="button" onClick={() => { closeMenu(); void handleSignOut(); }} className="flex min-h-11 items-center gap-2 px-2 text-left text-sm font-bold text-[#14274a]"><LogOut size={16} aria-hidden />Log out</button> : <Link to="/login" onClick={closeMenu} className="editorial-button-primary mt-2">Sign in</Link>}
              </div>
            </div>
          </div>
        ) : null}
      </header>
      <main id="main-content"><Outlet /></main>
      <Footer />
    </div>
  );
}
