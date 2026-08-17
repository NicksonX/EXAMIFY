import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Provider, Session, User } from "@supabase/supabase-js";
import { clearAccountGateDestination, clearPostLoginDestination } from "@/lib/authNavigation";
import { supabase } from "@/lib/supabase";

export type SupportedOAuthProvider = Extract<Provider, "google" | "apple">;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  signingInProvider: SupportedOAuthProvider | null;
  retrySession: () => Promise<void>;
  signInWithProvider: (provider: SupportedOAuthProvider) => Promise<void>;
  signOut: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function sessionErrorMessage(): string {
  return "We couldn't check your sign-in session. Check your connection and try again.";
}

function signInErrorMessage(provider: SupportedOAuthProvider): string {
  const name = provider === "apple" ? "Apple" : "Google";
  return `We couldn't open ${name} sign-in. Check the redirect setup and try again.`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingInProvider, setSigningInProvider] = useState<SupportedOAuthProvider | null>(null);

  const retrySession = useCallback(async () => {
    setLoading(true);
    setAuthError(null);

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setSession(null);
      setAuthError(sessionErrorMessage());
    } else {
      setSession(data.session);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error) {
        setSession(null);
        setAuthError(sessionErrorMessage());
      } else {
        setSession(data.session);
      }
      setLoading(false);
    };

    void hydrateSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      setLoading(false);
      setSigningInProvider(null);
      if (newSession) setAuthError(null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithProvider = useCallback(async (provider: SupportedOAuthProvider) => {
    if (signingInProvider) return;

    setAuthError(null);
    setSigningInProvider(provider);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error || !data.url) {
      setAuthError(signInErrorMessage(provider));
      setSigningInProvider(null);
    }
  }, [signingInProvider]);

  const signOut = useCallback(async (): Promise<boolean> => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError("We couldn't sign you out. Please try again.");
      return false;
    }

    clearPostLoginDestination();
    clearAccountGateDestination();
    setSession(null);
    setAuthError(null);
    return true;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        authError,
        signingInProvider,
        retrySession,
        signInWithProvider,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
