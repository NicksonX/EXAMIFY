const wholeNairaFormatter = new Intl.NumberFormat("en-NG", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

/** Formats a browser amount field without accepting fractional or signed values. */
export function formatWholeNairaInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^[\d,\s₦]+$/u.test(trimmed)) return null;
  const digits = trimmed.replace(/[^\d]/gu, "");
  if (!digits) return "";
  const amount = Number(digits);
  if (!Number.isSafeInteger(amount)) return null;
  return wholeNairaFormatter.format(amount);
}

/** Converts a formatted, whole-naira browser value to the integer kobo contract. */
export function wholeNairaInputToKobo(value: string): number | null {
  const formatted = formatWholeNairaInput(value);
  if (formatted === null || !formatted) return null;
  const naira = Number(formatted.replace(/,/gu, ""));
  if (!Number.isSafeInteger(naira) || naira < 0 || naira > Number.MAX_SAFE_INTEGER / 100) {
    return null;
  }
  return naira * 100;
}
