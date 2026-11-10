export function CircuitDecoration({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 420 180"
      fill="none"
      className={className}
    >
      <g stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M420 28H298l-34 34h-58l-36 36H78l-32 32H0" opacity=".65" />
        <path d="M420 48H310l-36 36h-58l-36 36H92l-30 30H0" opacity=".35" />
        <path d="M420 128h-78l-28-28h-60l-48 48h-72" opacity=".6" />
        <path d="M420 150h-86l-28-28h-44l-40 40h-66" opacity=".3" />
        <path d="M366 0v42l-42 42H280" opacity=".45" />
        <path d="M184 0v30l-22 22H94L60 86H0" opacity=".4" />
        <path d="M164 0v22l-14 14H84L52 68H0" opacity=".2" />
        <circle cx="134" cy="148" r="4" />
        <circle cx="280" cy="84" r="4" />
        <circle cx="206" cy="62" r="3" />
        <circle cx="94" cy="52" r="3" />
        <circle cx="342" cy="128" r="3" />
      </g>
      <g fill="currentColor" opacity=".65">
        <circle cx="78" cy="98" r="2" />
        <circle cx="366" cy="28" r="2" />
        <circle cx="206" cy="148" r="2" />
      </g>
    </svg>
  );
}
