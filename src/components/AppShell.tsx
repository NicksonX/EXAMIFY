import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, ChevronDown, Crown, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, WalletCards, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAccountState } from "@/context/AccountStateContext";
import { displayIdentity } from "@/lib/accountState";
import { getPlan, isPremium, planLabel, type PlanSlug } from "@/lib/premium";
import { isFinanceAdmin } from "@/lib/access";

const NAV_ITEMS: Array<{
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  comingSoon?: boolean;
}> = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/study", label: "Study", icon: BookOpen },
  { to: "/wallet", label: "Wallet", icon: WalletCards, comingSoon: true },
  { to: "/upgrade", label: "Premium", icon: Crown },
];

function sidebarLinkClass({ isActive }: { isActive: boolean }): string {
  return `flex min-h-11 items-center gap-3 border-l-2 px-3 text-sm font-bold transition ${
    isActive
      ? "border-[#ce4040] bg-[#fffdfa]/75 text-[#14274a]"
      : "border-transparent text-ink-soft hover:border-[#ce4040]/45 hover:bg-[#fffdfa]/45 hover:text-ink"
  }`;
}

function mobileMenuLinkClass({ isActive }: { isActive: boolean }): string {
  return `flex min-h-11 items-center gap-3 border-l-2 px-3 text-sm font-bold transition ${
    isActive
      ? "border-[#ce4040] bg-[#fffdfa]/75 text-[#14274a]"
      : "border-transparent text-ink-soft hover:border-[#ce4040]/45 hover:bg-[#fffdfa]/45 hover:text-ink"
  }`;
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const { accountState } = useAccountState();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [plan, setPlan] = useState<PlanSlug>("free");
  const [financeAdmin, setFinanceAdmin] = useState(false);

  const name = displayIdentity(
    accountState?.profile,
    (user?.user_metadata?.full_name as string | undefined)
      ?? (user?.user_metadata?.name as string | undefined),
  );
  const avatar = accountState?.profile?.avatarUrl
    ?? (user?.user_metadata?.avatar_url as string | undefined)
    ?? (user?.user_metadata?.picture as string | undefined);
  const premium = isPremium(plan);
  const mobileNavItems: typeof NAV_ITEMS = financeAdmin
    ? [...NAV_ITEMS, { to: "/admin", label: "Admin", icon: ShieldCheck }]
    : NAV_ITEMS;

  useEffect(() => {
    let active = true;
    void getPlan().then((profilePlan) => active && setPlan(profilePlan)).catch(() => undefined);
    void isFinanceAdmin().then((allowed) => active && setFinanceAdmin(allowed));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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

  const toggleMenu = (event: MouseEvent<HTMLButtonElement>) => {
    menuButtonRef.current = event.currentTarget;
    setMenuOpen((value) => !value);
  };

  const closeMenu = () => setMenuOpen(false);

  const handleSignOut = async () => {
    const complete = await signOut();
    if (complete) navigate("/login", { replace: true });
  };

  const handleBack = () => {
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) navigate(-1);
    else navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto grid min-h-screen w-full max-w-[1500px] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <a href="#main-content" className="skip-link">Skip to content</a>

        <aside className="no-print hidden border-r border-line bg-[#eee5d6]/55 p-4 lg:flex lg:flex-col" aria-label="Dashboard navigation">
          <Link to="/dashboard" className="editorial-wordmark px-2 py-2.5">Exam<span>i</span>fy</Link>

          <nav className="mt-10 space-y-1" aria-label="Dashboard">
            <p className="px-3 pb-2 text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-ink-lighter">Workspace</p>
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={sidebarLinkClass}>
                <item.icon size={18} aria-hidden /> <span>{item.label}</span>
                {item.comingSoon ? <span className="ml-auto text-[0.6rem] font-extrabold uppercase tracking-[0.1em] text-[#ce4040]">Coming soon</span> : null}
              </NavLink>
            ))}
            {financeAdmin ? <NavLink to="/admin" className={sidebarLinkClass}><ShieldCheck size={18} aria-hidden /> Finance admin</NavLink> : null}
          </nav>

          <Link to="/upgrade" className="mt-auto border-y border-[#14274a]/15 py-5 text-left transition hover:bg-[#fffdfa]/45">
            <span className="flex h-9 w-9 items-center justify-center rounded-[2px] bg-[#14274a] text-white"><Crown size={17} aria-hidden /></span>
            <p className="mt-4 font-editorial-display text-2xl font-semibold tracking-[-0.04em] text-[#14274a]">{premium ? `Examify ${planLabel(plan)}` : "Keep practising"}</p>
            <p className="mt-1 text-xs leading-5 text-ink-soft">{plan === "pro" ? "Your full study library and unlimited practice access are active." : plan === "plus" ? "Your selected Plus lessons and practice pass are active." : "Unlock more study access and completed exam attempts."}</p>
            <span className="mt-3 inline-flex text-xs font-extrabold text-[#ce4040]">{premium ? "View plan" : "Explore plans"}</span>
          </Link>
        </aside>

        <div className="min-w-0 bg-canvas">
          <header className="no-print sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-line bg-[#f7f2e9]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              {location.pathname !== "/dashboard" ? <button type="button" onClick={handleBack} className="inline-flex min-h-11 items-center gap-1 px-1 text-xs font-extrabold text-ink hover:text-[#ce4040]" aria-label="Go back"><ArrowLeft size={16} /> <span className="hidden sm:inline">Back</span></button> : null}
              <Link to="/dashboard" className="editorial-wordmark lg:hidden">Exam<span>i</span>fy</Link>
              <div className="hidden lg:block">
                <p className="font-editorial-display text-xl font-semibold tracking-[-0.04em] text-ink">Learning workspace</p>
                <p className="mt-0.5 text-[11px] text-ink-lighter">Study, practise, review</p>
              </div>
            </div>

            <div className="relative ml-auto flex items-center gap-2">
              <Link to="/upgrade" className="hidden items-center gap-1.5 border border-[#14274a]/20 bg-[#fffdfa]/65 px-3 py-2 text-xs font-bold text-ink sm:inline-flex"><Crown size={13} aria-hidden /> {premium ? planLabel(plan) : "Free plan"}</Link>
              <button type="button" onClick={toggleMenu} className="hidden min-h-10 items-center gap-2 px-1.5 text-ink hover:text-[#ce4040] lg:inline-flex" aria-expanded={menuOpen} aria-controls="account-menu">
                {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full border border-[#14274a]/15 object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#14274a] text-xs font-extrabold text-white" aria-hidden>{name.charAt(0).toUpperCase()}</span>}
                <ChevronDown size={15} className="hidden text-ink-lighter sm:block" aria-hidden />
                <span className="sr-only">Open account menu</span>
              </button>
              <button type="button" onClick={toggleMenu} className="inline-flex h-10 w-10 items-center justify-center text-ink hover:text-[#ce4040] lg:hidden" aria-label="Toggle workspace navigation" aria-expanded={menuOpen} aria-controls="workspace-menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>

              {menuOpen ? (
                <div id="account-menu" className="absolute right-0 top-[calc(100%+0.65rem)] z-40 hidden w-64 border border-line bg-[#fffdfa] p-2 shadow-[4px_4px_0_#ce4040] lg:block">
                  <div className="border-b border-line px-3 py-3"><p className="truncate text-sm font-extrabold text-ink">{name}</p><p className="mt-0.5 truncate text-xs text-ink-lighter">{user?.email ?? "Signed-in learner"}</p></div>
                  <Link to="/upgrade" onClick={closeMenu} className="mt-1 flex min-h-10 items-center gap-2 px-3 text-sm font-bold text-ink-soft hover:bg-[#f7f2e9] hover:text-ink"><Crown size={16} aria-hidden />{premium ? `Your ${planLabel(plan)} plan` : "View plans"}</Link>
                  <Link to="/settings" onClick={closeMenu} className="flex min-h-10 items-center gap-2 px-3 text-sm font-bold text-ink-soft hover:bg-[#f7f2e9] hover:text-ink"><Settings size={16} aria-hidden />Account settings</Link>
                  {financeAdmin ? <Link to="/admin" onClick={closeMenu} className="flex min-h-10 items-center gap-2 px-3 text-sm font-bold text-ink-soft hover:bg-[#f7f2e9] hover:text-ink"><ShieldCheck size={16} aria-hidden />Finance admin</Link> : null}
                  <button type="button" onClick={() => { closeMenu(); void handleSignOut(); }} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm font-bold text-ink-soft hover:bg-[#f7f2e9] hover:text-ink"><LogOut size={16} aria-hidden />Sign out</button>
                </div>
              ) : null}
            </div>
          </header>
          {menuOpen ? <nav id="workspace-menu" className="no-print border-b border-line bg-[#f7f2e9] lg:hidden" aria-label="Workspace navigation">
            <div className="mx-auto grid w-full max-w-[1240px] gap-1 px-4 py-3 sm:px-6">
              {mobileNavItems.map((item) => <NavLink key={item.to} to={item.to} onClick={closeMenu} className={mobileMenuLinkClass}><item.icon size={17} aria-hidden /><span>{item.label}</span>{item.comingSoon ? <span className="ml-auto text-[0.6rem] font-extrabold uppercase tracking-[0.1em] text-[#ce4040]">Coming soon</span> : null}</NavLink>)}
              <Link to="/settings" onClick={closeMenu} className="flex min-h-11 items-center gap-3 px-3 text-sm font-bold text-ink-soft hover:bg-[#fffdfa]/45 hover:text-ink"><Settings size={17} aria-hidden />Account settings</Link>
              <button type="button" onClick={() => { closeMenu(); void handleSignOut(); }} className="flex min-h-11 items-center gap-3 px-3 text-left text-sm font-bold text-ink-soft hover:bg-[#fffdfa]/45 hover:text-ink"><LogOut size={17} aria-hidden />Sign out</button>
            </div>
          </nav> : null}

          <main id="main-content" className="min-h-[calc(100vh-4rem)]"><Outlet /></main>
        </div>
      </div>
    </div>
  );
}
