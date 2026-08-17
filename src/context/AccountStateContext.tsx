import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { accountStateFrom, type AccountState } from "@/lib/accountState";
import { supabase } from "@/lib/supabase";

interface AccountStateContextValue {
  accountState: AccountState | null;
  loading: boolean;
  error: string | null;
  refreshAccountState: () => Promise<void>;
  acceptCurrentTerms: () => Promise<AccountState>;
  completeOnboardingProfile: (username: string, avatar: File) => Promise<AccountState>;
}

const AccountStateContext = createContext<AccountStateContextValue | undefined>(undefined);

const accountStateError = "We couldn't check your account setup. Check your connection and try again.";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function accountFunctionError(error: unknown, fallback: string): Promise<Error> {
  const context = record(error)?.context;
  if (context instanceof Response) {
    try {
      const body = record(await context.clone().json());
      const message = typeof body?.message === "string" && body.message.trim().length > 0 && body.message.length <= 220
        ? body.message.trim()
        : fallback;
      const code = typeof body?.error === "string" && /^[A-Z0-9_]{3,80}$/u.test(body.error)
        ? body.error
        : null;
      return new Error(code && code !== "INTERNAL_ERROR" ? `${message} [${code}]` : message);
    } catch {
      // Fall through to a stable, safe message.
    }
  }
  return new Error(fallback);
}

function completedAccountStateFrom(value: unknown): AccountState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return accountStateFrom(value);
  }

  const response = value as Record<string, unknown>;
  const account = accountStateFrom(response.account ?? value);
  const avatarUrl = typeof response.avatarUrl === "string" && response.avatarUrl
    ? response.avatarUrl
    : null;

  if (!avatarUrl) return account;
  return {
    ...account,
    profile: {
      username: account.profile?.username ?? null,
      displayName: account.profile?.displayName ?? account.profile?.username ?? null,
      avatarUrl,
    },
  };
}

export function AccountStateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAccountState = useCallback(async () => {
    if (!user) {
      setAccountState(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: functionError } = await supabase.functions.invoke(
      "get-account-state",
      { body: {} },
    );
    if (functionError) {
      setAccountState(null);
      setError(accountStateError);
    } else {
      setAccountState(completedAccountStateFrom(data));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refreshAccountState();
  }, [refreshAccountState]);

  const acceptCurrentTerms = useCallback(async (): Promise<AccountState> => {
    const { data, error: rpcError } = await supabase.rpc("accept_current_terms");
    if (rpcError) throw new Error(rpcError.message || "We couldn't record your acceptance. Please try again.");

    const nextState = accountStateFrom(data);
    setAccountState(nextState);
    setError(null);
    return nextState;
  }, []);

  const completeOnboardingProfile = useCallback(async (
    username: string,
    avatar: File,
  ): Promise<AccountState> => {
    const body = new FormData();
    body.set("username", username);
    body.set("avatar", avatar);

    const { data, error: functionError } = await supabase.functions.invoke(
      "complete-onboarding-profile",
      { body },
    );
    if (functionError) {
      throw await accountFunctionError(
        functionError,
        "We couldn't save your profile. Please try again.",
      );
    }

    const nextState = completedAccountStateFrom(data);
    setAccountState(nextState);
    setError(null);
    return nextState;
  }, []);

  return (
    <AccountStateContext.Provider
      value={{
        accountState,
        loading,
        error,
        refreshAccountState,
        acceptCurrentTerms,
        completeOnboardingProfile,
      }}
    >
      {children}
    </AccountStateContext.Provider>
  );
}

export function useAccountState() {
  const context = useContext(AccountStateContext);
  if (!context) throw new Error("useAccountState must be used within an AccountStateProvider");
  return context;
}
