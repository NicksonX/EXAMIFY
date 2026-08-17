import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { isFinanceAdmin } from "@/lib/access";

type State = "checking" | "allowed" | "denied";

export function AdminRoute({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>("checking");
  useEffect(() => {
    let active = true;
    void isFinanceAdmin().then((allowed) => { if (active) setState(allowed ? "allowed" : "denied"); });
    return () => { active = false; };
  }, []);
  if (state === "checking") return <div className="workspace-page flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#ce4040]" /><span className="sr-only">Checking account permissions</span></div>;
  return state === "allowed" ? <>{children}</> : <Navigate to="/dashboard" replace />;
}
