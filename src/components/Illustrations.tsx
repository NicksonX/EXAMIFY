// Hand-drawn line illustrations for Examify. Each picks up `currentColor`
// so they sit naturally inside accent/ink/gold containers.
// Used in the "How it works" steps and the final CTA.

type SvgProps = {
  className?: string;
  strokeWidth?: number;
};

const base = (strokeWidth: number) => ({
  fill: "none",
  stroke: "currentColor",
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/** Step 1: pick your exam (a checklist paper). */
export function PickExam({ className, strokeWidth = 1.8 }: SvgProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g {...base(strokeWidth)}>
        <rect x="15" y="11" width="34" height="45" rx="4" />
        <rect x="23" y="7" width="18" height="9" rx="2.5" />
        <path d="M22 27l3.2 3.2 5.4-6" />
        <path d="M22 39l3.2 3.2 5.4-6" />
        <line x1="36" y1="29" x2="45" y2="29" />
        <line x1="36" y1="41" x2="45" y2="41" />
      </g>
    </svg>
  );
}

/** Step 2: practise timed (a stopwatch). */
export function PractiseTimed({ className, strokeWidth = 1.8 }: SvgProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g {...base(strokeWidth)}>
        <rect x="26" y="6" width="12" height="7" rx="2.5" />
        <line x1="32" y1="13" x2="32" y2="19" />
        <circle cx="32" cy="37" r="18" />
        <line x1="32" y1="37" x2="32" y2="24" />
        <line x1="32" y1="37" x2="41" y2="41" />
        <line x1="13" y1="21" x2="9" y2="17" />
        <line x1="51" y1="21" x2="55" y2="17" />
        <line x1="10" y1="37" x2="14" y2="37" />
        <line x1="50" y1="37" x2="54" y2="37" />
      </g>
    </svg>
  );
}

/** Step 3: track progress (bars trending up with a line). */
export function TrackProgress({ className, strokeWidth = 1.8 }: SvgProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g {...base(strokeWidth)}>
        <line x1="11" y1="52" x2="53" y2="52" />
        <rect x="15" y="39" width="8" height="13" rx="1.5" />
        <rect x="28" y="29" width="8" height="23" rx="1.5" />
        <rect x="41" y="19" width="8" height="33" rx="1.5" />
        <path d="M19 31 L32 23 L45 13" />
      </g>
      <circle cx="45" cy="13" r="1.8" fill="currentColor" />
    </svg>
  );
}

/** Graduation cap, used in the final CTA. */
export function GradCap({ className, strokeWidth = 1.8 }: SvgProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g {...base(strokeWidth)}>
        <path d="M5 24 L32 13 L59 24 L32 35 Z" />
        <path d="M17 29 L17 43 C17 46 25 49 32 49 C39 49 47 46 47 43 L47 29" />
        <line x1="59" y1="24" x2="59" y2="39" />
        <path d="M59 39 L56.5 45 M59 39 L61.5 45" />
      </g>
    </svg>
  );
}

/** Small four-point sparkle for accents. */
export function Sparkle({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z"
        fill="currentColor"
      />
    </svg>
  );
}

/** A soft wave that bridges the dark hero into the light canvas below. */
export function WaveDivider({ className }: { className?: string }) {
  return (
    <div className={`hero-wave ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 1440 80" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M0 44 C 220 84 470 6 720 36 C 970 66 1220 10 1440 42 L1440 80 L0 80 Z"
          fill="#F5F7FB"
        />
      </svg>
    </div>
  );
}
