import { useEffect, useRef, useState } from 'react';
import { phaseToTime, timeToPhase } from './geometry';
import type { EchoSession } from './types';

/** Explicit fallback: two original videos, with no claimed hand extraction. */
export default function SideBySide({
  focus,
  others,
  repChoices,
}: {
  focus: EchoSession;
  others: EchoSession[];
  repChoices: Record<string, number>;
}) {
  const [otherId, setOtherId] = useState(others[0]?.id ?? '');
  const other = others.find((s) => s.id === otherId) ?? others[0];
  const mainRef = useRef<HTMLVideoElement>(null),
    otherRef = useRef<HTMLVideoElement>(null);
  const rep = focus.repetitions[repChoices[focus.id] ?? 0],
    otherRep = other?.repetitions[repChoices[other.id] ?? 0];
  useEffect(() => {
    const a = mainRef.current,
      b = otherRef.current;
    if (!a || !b || !other) return;
    const urls = [
      URL.createObjectURL(focus.video),
      URL.createObjectURL(other.video),
    ];
    const readyA = () => {
      a.currentTime = rep ? rep.peakMs / 1000 : 0;
    };
    const readyB = () => {
      b.currentTime = otherRep ? otherRep.peakMs / 1000 : 0;
    };
    a.addEventListener('loadedmetadata', readyA);
    b.addEventListener('loadedmetadata', readyB);
    a.src = urls[0];
    b.src = urls[1];
    return () => {
      a.removeEventListener('loadedmetadata', readyA);
      b.removeEventListener('loadedmetadata', readyB);
      for (const v of [a, b]) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
      urls.forEach(URL.revokeObjectURL);
    };
  }, [focus, other, rep, otherRep]);
  const sync = () => {
    const a = mainRef.current,
      b = otherRef.current;
    if (!a || !b || !rep || !otherRep || b.readyState < 2) return;
    const phase = rep.static ? 0.5 : timeToPhase(a.currentTime * 1000, rep);
    const target = phaseToTime(otherRep.static ? 0.5 : phase, otherRep) / 1000;
    if (Math.abs(b.currentTime - target) > 0.12) b.currentTime = target;
    if (rep.static || otherRep.static) {
      b.pause();
      return;
    }
    const aSpan =
      phase < 0.5 ? rep.peakMs - rep.startMs : rep.endMs - rep.peakMs;
    const bSpan =
      phase < 0.5
        ? otherRep.peakMs - otherRep.startMs
        : otherRep.endMs - otherRep.peakMs;
    b.playbackRate = Math.max(
      0.1,
      Math.min(4, (a.playbackRate * bSpan) / Math.max(1, aSpan)),
    );
    if (!a.paused) void b.play().catch(() => {});
    else b.pause();
    if (a.currentTime * 1000 >= rep.endMs && !a.paused)
      a.currentTime = rep.startMs / 1000;
  };
  return (
    <section className="echo-side-fallback">
      <h2>Original video comparison</h2>
      <p className="echo-note">
        Two full recordings without extracted outlines. Complete cycles follow
        matching movement phases. Static poses remain still.
      </p>
      <label>
        Compare with
        <select
          aria-label="Side-by-side recording"
          value={other?.id ?? ''}
          onChange={(e) => setOtherId(e.target.value)}
        >
          {others.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="echo-side-videos">
        <figure>
          <video
            ref={mainRef}
            controls
            muted
            playsInline
            onTimeUpdate={sync}
            onSeeking={sync}
            onPlay={sync}
            onPause={() => otherRef.current?.pause()}
          />
          <figcaption>{focus.name} · Master playback</figcaption>
        </figure>
        <figure>
          <video ref={otherRef} muted playsInline />
          <figcaption>{other?.name ?? 'No compatible recording'}</figcaption>
        </figure>
      </div>
    </section>
  );
}
