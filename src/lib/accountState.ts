export interface AccountProfile {
  username: string | null;
  avatarUrl: string | null;
  displayName: string | null;
}

export interface CurrentTerms {
  version: string;
  effectiveAt: string | null;
  content: string;
}

export interface AccountState {
  termsAvailable: boolean;
  termsRequired: boolean;
  profileComplete: boolean;
  profile: AccountProfile | null;
  terms: CurrentTerms | null;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function profileFrom(value: unknown): AccountProfile | null {
  const profile = record(value);
  if (!profile) return null;

  const username = stringValue(profile.username);
  const avatarUrl = stringValue(profile.avatarUrl) ?? stringValue(profile.avatar_url);
  const displayName = stringValue(profile.displayName)
    ?? stringValue(profile.display_name)
    ?? username;

  return username || avatarUrl || displayName ? { username, avatarUrl, displayName } : null;
}

export function termsFrom(value: unknown): CurrentTerms | null {
  const terms = record(value);
  if (!terms) return null;

  const version = stringValue(terms.version);
  const content = stringValue(terms.content);
  if (!version || !content) return null;

  return {
    version,
    effectiveAt: stringValue(terms.effectiveAt) ?? stringValue(terms.effective_at),
    content,
  };
}

export function accountStateFrom(value: unknown): AccountState {
  const state = record(value) ?? {};
  return {
    termsAvailable: booleanValue(state.termsAvailable) || booleanValue(state.terms_available),
    termsRequired: booleanValue(state.termsRequired) || booleanValue(state.terms_required),
    profileComplete: booleanValue(state.profileComplete) || booleanValue(state.profile_complete),
    profile: profileFrom(state.profile) ?? profileFrom(state.currentProfile) ?? profileFrom(state.current_profile),
    terms: termsFrom(state.terms) ?? termsFrom(state.currentTerms) ?? termsFrom(state.current_terms),
  };
}

export function displayIdentity(
  profile: AccountProfile | null | undefined,
  fallbackName: string | null | undefined,
): string {
  return profile?.displayName ?? profile?.username ?? fallbackName ?? "Student";
}
