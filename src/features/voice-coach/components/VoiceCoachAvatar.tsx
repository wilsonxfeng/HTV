export function VoiceCoachAvatar({
  speaking = false,
  listening = false,
}: {
  speaking?: boolean;
  listening?: boolean;
}) {
  return (
    <div
      className={`vc-avatar ${speaking ? "vc-speaking" : listening ? "vc-listening" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100">
        <g fill="currentColor">
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <ellipse
              key={angle}
              cx="50"
              cy="31"
              rx="15"
              ry="24"
              transform={`rotate(${angle} 50 50)`}
            />
          ))}
        </g>
        <circle cx="50" cy="50" r="21" fill="#f4ce78" />
        <circle cx="43" cy="48" r="2" fill="#31493e" />
        <circle cx="57" cy="48" r="2" fill="#31493e" />
        <path
          d="M44 57Q50 62 56 57"
          fill="none"
          stroke="#31493e"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span />
      <span />
    </div>
  );
}
