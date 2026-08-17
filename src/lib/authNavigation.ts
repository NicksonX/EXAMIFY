const POST_LOGIN_DESTINATION_KEY = "examify.post-login-destination";
const ACCOUNT_GATE_DESTINATION_KEY = "examify.account-gate-destination";
const DEFAULT_DESTINATION = "/dashboard";

export interface AuthLocation {
  pathname: string;
  search?: string;
  hash?: string;
}

function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && "sessionStorage" in window;
}

export function safeInternalDestination(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_DESTINATION;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin) return DEFAULT_DESTINATION;

    if (parsed.pathname === "/login" || parsed.pathname === "/auth/callback") {
      return DEFAULT_DESTINATION;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_DESTINATION;
  }
}

export function destinationFromLocation(location: AuthLocation): string {
  return safeInternalDestination(
    `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`,
  );
}

export function savePostLoginDestination(location: AuthLocation): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(
    POST_LOGIN_DESTINATION_KEY,
    destinationFromLocation(location),
  );
}

export function getPostLoginDestination(): string {
  if (!hasSessionStorage()) return DEFAULT_DESTINATION;
  return safeInternalDestination(
    window.sessionStorage.getItem(POST_LOGIN_DESTINATION_KEY),
  );
}

export function consumePostLoginDestination(): string {
  const destination = getPostLoginDestination();
  clearPostLoginDestination();
  return destination;
}

export function clearPostLoginDestination(): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.removeItem(POST_LOGIN_DESTINATION_KEY);
}

export function saveAccountGateDestination(location: AuthLocation): void {
  if (!hasSessionStorage()) return;
  const destination = destinationFromLocation(location);
  if (destination === "/onboarding" || destination === "/terms/accept") return;
  window.sessionStorage.setItem(ACCOUNT_GATE_DESTINATION_KEY, destination);
}

export function consumeAccountGateDestination(): string {
  if (!hasSessionStorage()) return DEFAULT_DESTINATION;
  const destination = safeInternalDestination(
    window.sessionStorage.getItem(ACCOUNT_GATE_DESTINATION_KEY),
  );
  window.sessionStorage.removeItem(ACCOUNT_GATE_DESTINATION_KEY);
  return destination;
}

export function clearAccountGateDestination(): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.removeItem(ACCOUNT_GATE_DESTINATION_KEY);
}
