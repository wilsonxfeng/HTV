import { getPhase, referenceAt } from "../../../lib/geometry";
import { HAND_CONNECTIONS } from "../../../lib/geometry";
import { makeDemoHand } from "../../../lib/demo";
import type { Calibration } from "../types/coach";
/** A light SVG cue, avoiding another camera, detector, or 3D canvas. */
export function GuidedPracticeFlow({
  elapsedMs,
  calibration,
  demo = false,
}: {
  elapsedMs: number;
  calibration: Calibration | null;
  demo?: boolean;
}) {
  const time = demo
    ? (elapsedMs / 1000) % 10
    : Math.min(elapsedMs, 9999) / 1000;
  const phase = getPhase(time, 10);
  const points = calibration
    ? referenceAt(calibration, time, 10)
    : makeDemoHand(phase.amount);
  return (
    <section className="vc-card vc-demonstration">
      <span className="vc-eyebrow">
        {calibration ? "YOUR COMFORTABLE RANGE" : "ILLUSTRATIVE MOVEMENT"}
      </span>
      <svg
        viewBox="0 0 300 260"
        role="img"
        aria-label={`Hand movement cue: ${phase.name}`}
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        >
          {HAND_CONNECTIONS.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={150 + points[a].x * 70}
              y1={225 - points[a].y * 70}
              x2={150 + points[b].x * 70}
              y2={225 - points[b].y * 70}
            />
          ))}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={150 + p.x * 70}
              cy={225 - p.y * 70}
              r="4"
              fill="currentColor"
            />
          ))}
        </g>
      </svg>
      <div className="vc-cue-steps">
        {["Together", "Spread", "Hold", "Close"].map((name) => (
          <span className={phase.name === name ? "vc-current" : ""} key={name}>
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
