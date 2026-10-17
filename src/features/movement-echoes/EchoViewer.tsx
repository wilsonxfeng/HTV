import type { EvidenceFocus } from '../ask-remotion/contracts';
import { baselineAnchors } from '../body-echoes/bodyAlignment';
import { getExercise } from '../body-exercises/exerciseRegistry';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, ScanLine } from 'lucide-react';
import { frameAtTime, palmAnchors, phaseToTime, timeToPhase } from './geometry';
import {
  decodeCache,
  drawGhost,
  ECHO_COLORS,
  hitGhosts,
  sampleGhost,
} from './rendering';
import type { DecodedGhost, DrawnGhost } from './rendering';
import type { EchoSession, GhostCache } from './types';

export interface EchoViewerProps {
  sessions: EchoSession[];
  evidenceFocus?: EvidenceFocus;
  focusId: string;
  repChoices: Record<string, number>;
  caches: Record<string, GhostCache>;
  ghostIds: string[];
  opacity: number;
  onFocus: (id: string) => void;
  revealToken: number;
}
export default function EchoViewer({
  sessions,
  evidenceFocus,
  focusId,
  repChoices,
  caches,
  ghostIds,
  opacity,
  onFocus,
  revealToken,
}: EchoViewerProps) {
  const focus = sessions.find((s) => s.id === focusId)!;
  const rep = focus.repetitions[repChoices[focus.id] ?? 0];
  const videoRef = useRef<HTMLVideoElement>(null),
    canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(0.5),
    playingRef = useRef(false),
    drawnRef = useRef<DrawnGhost[]>([]);
  const [phase, setPhase] = useState(0.5),
    [playing, setPlaying] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [rate, setRate] = useState(1),
    [decoded, setDecoded] = useState<Record<string, DecodedGhost[]>>({});
  const [choices, setChoices] = useState<string[]>([]),
    [status, setStatus] = useState(''),
    [reduced, setReduced] = useState(false);
  const [detail, setDetail] = useState(focus.trackingMode !== 'pose');
  useEffect(() => setDetail(focus.trackingMode !== 'pose'), [focus.trackingMode]);
  const [redraw, setRedraw] = useState(0);
  const waitingFrame = useRef(false);
  const decodeIds = JSON.stringify([...new Set([focusId, ...ghostIds])].sort());
  const [visible, setVisible] = useState(!document.hidden);
  const lastPaint = useRef(0);
  const paintPhase = playing ? -1 : phase;
  useEffect(() => {
    const f = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  useEffect(() => {
    if (!visible) {
      videoRef.current?.pause();
      playingRef.current = false;
      setPlaying(false);
    }
  }, [visible]);
  useEffect(() => {
    let cancelled = false;
    const loaded: Record<string, DecodedGhost[]> = {};
    setDecoded({});
    void (async () => {
      try {
        for (const session of sessions.filter((s) =>
          (JSON.parse(decodeIds) as string[]).includes(s.id),
        )) {
          const cache = caches[session.id];
          if (!cache) continue;
          const images = await decodeCache(
            cache,
            ECHO_COLORS[sessions.indexOf(session) % ECHO_COLORS.length],
          );
          if (cancelled) {
            images.forEach((v) => v.image.close());
            return;
          }
          loaded[session.id] = images;
        }
        if (!cancelled) setDecoded({ ...loaded });
      } catch {
        if (!cancelled)
          setError(
            'Some cached outlines could not be decoded. Rebuild their cache to retry.',
          );
      }
    })();
    return () => {
      cancelled = true;
      Object.values(loaded)
        .flat()
        .forEach((v) => v.image.close());
    };
  }, [caches, sessions, decodeIds]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setLoading(true);
    setError('');
    setChoices([]);
    drawnRef.current = [];
    waitingFrame.current = true;
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    const url = URL.createObjectURL(focus.video);
    let disposed = false;
    const ready = () => {
      if (disposed) return;
      if (evidenceFocus?.sessionId === focus.id && (evidenceFocus.repetitionIndex===null || evidenceFocus.repetitionIndex===(repChoices[focus.id]??0))) {
        video.pause();playingRef.current=false;setPlaying(false);
        const targetTime=(evidenceFocus.timestampMs??0)/1000;
        waitingFrame.current=Math.abs(video.currentTime-targetTime)>.00001;
        video.currentTime=targetTime;
        if(!waitingFrame.current){setLoading(false);setRedraw(v=>v+1);}
        if(rep){phaseRef.current=timeToPhase(evidenceFocus.timestampMs??rep.startMs,rep);setPhase(phaseRef.current);}
      } else if (rep)
        video.currentTime =
          phaseToTime(rep.static ? 0.5 : phaseRef.current, rep) / 1000;
      else setLoading(false);
    };
    const sought = () => {
      if (disposed) return;
      waitingFrame.current = false;
      setRedraw((v) => v + 1);
      setLoading(false);
      if (rep?.static) {
        phaseRef.current = 0.5;
        setPhase(0.5);
        playingRef.current = false;
        setPlaying(false);
      } else if (playingRef.current)
        void video.play().catch(() => {
          setPlaying(false);
          playingRef.current = false;
        });
    };
    const fail = () => {
      setLoading(false);
      setError(
        'The original video could not play in this browser. Try a supported recording.',
      );
    };
    video.addEventListener('loadedmetadata', ready);
    video.addEventListener('seeked', sought);
    video.addEventListener('error', fail);
    video.src = url;
    video.playbackRate = rate;
    video.load();
    return () => {
      disposed = true;
      video.removeEventListener('loadedmetadata', ready);
      video.removeEventListener('seeked', sought);
      video.removeEventListener('error', fail);
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    };
    // Playback rate is updated separately; changing it must not reload the source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.video, focus.id, rep, evidenceFocus]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate]);
  const seek = useCallback(
    (p: number) => {
      const video = videoRef.current;
      if (!video || !rep) return;
      phaseRef.current = rep.static ? 0.5 : p;
      setPhase(phaseRef.current);
      setChoices([]);
      const t = phaseToTime(phaseRef.current, rep) / 1000;
      waitingFrame.current = Math.abs(video.currentTime - t) > 0.00001;
      if (waitingFrame.current) {
        const c = canvasRef.current;
        c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        drawnRef.current = [];
        video.currentTime = t;
      }
    },
    [rep],
  );
  const seekRef = useRef(seek);
  seekRef.current = seek;
  useEffect(() => {
    if (!revealToken) return;
    playingRef.current = false;
    videoRef.current?.pause();
    setPlaying(false);
    seekRef.current(0.5);
  }, [revealToken]);
  useEffect(() => {
    let request = 0,
      videoRequest = 0;
    let frames = 0,
      lastFrame = 0,
      slow = 0;
    const draw = (now: number, decodedMs?: number) => {
      const canvas = canvasRef.current,
        video = videoRef.current;
      if (!canvas || !video || !rep || !visible) return;
      if (playing && !loading) {
        if (video.currentTime * 1000 >= rep.endMs - 30) {
          video.currentTime = rep.startMs / 1000;
        }
        const p = timeToPhase(decodedMs ?? video.currentTime * 1000, rep);
        phaseRef.current = p;
        if (now - lastPaint.current > 70) {
          setPhase(p);
          lastPaint.current = now;
        }
      }
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawnRef.current = [];
      if (!loading && !waitingFrame.current) {
        const tracked = frameAtTime(
          focus.frames,
          (decodedMs ?? video.currentTime * 1000) - focus.landmarkOffsetMs,
        );
        const target = focus.trackingMode === 'pose' ? (tracked ? baselineAnchors(focus, canvas.width, canvas.height) : null) : tracked ? palmAnchors(tracked.image, canvas.width, canvas.height) : null;
        let unavailable = 0;
        const ids = reduced ? ghostIds.slice(0, 2) : ghostIds;
        if (target) {
          for (const id of ids) {
            const cache = decoded[id];
            const session = sessions.find((s) => s.id === id);
            if (!cache || !session) {
              unavailable++;
              continue;
            }
            const source = sampleGhost(
              cache,
              phaseRef.current,
              session.repetitions[repChoices[id] ?? 0]?.static,
            );
            if (!source) {
              unavailable++;
              continue;
            }
            const result = drawGhost(ctx, source, target, opacity, id);
            if (result) drawnRef.current.push(result);
            else unavailable++;
          }
        }
        setStatus(
          !target
            ? 'Alignment unavailable at this instant.'
            : unavailable
              ? `${unavailable} outline${unavailable === 1 ? ' is' : 's are'} unavailable at this phase. Only reliable outlines are shown.`
              : '',
        );
      }
      if (playing) {
        frames++;
        if (lastFrame && now - lastFrame > 65) slow++;
        lastFrame = now;
        if (frames > 45 && slow > 12) setReduced(true);
        if (video.requestVideoFrameCallback)
          videoRequest = video.requestVideoFrameCallback((time, metadata) =>
            draw(time, metadata.mediaTime * 1000),
          );
        else request = requestAnimationFrame(draw);
      }
    };
    request = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(request);
      if (videoRequest)
        videoRef.current?.cancelVideoFrameCallback?.(videoRequest);
    };
  }, [
    decoded,
    focus,
    ghostIds,
    opacity,
    loading,
    playing,
    visible,
    rep,
    repChoices,
    sessions,
    reduced,
    paintPhase,
    redraw,
  ]);
  const toggle = async () => {
    const video = videoRef.current;
    if (!video || !rep || rep.static) return;
    if (playing) {
      video.pause();
      const p = timeToPhase(video.currentTime * 1000, rep);
      phaseRef.current = p;
      setPhase(p);
      playingRef.current = false;
      setPlaying(false);
    } else {
      try {
        await video.play();
        playingRef.current = true;
        setPlaying(true);
      } catch {
        setError('Tap Play again to allow video playback.');
      }
    }
  };
  const elapsed = rep ? (phaseToTime(phase, rep) - rep.startMs) / 1000 : 0,
    total = rep ? (rep.endMs - rep.startMs) / 1000 : 0;
  const peakFrame = rep
    ? frameAtTime(focus.frames, rep.peakMs - focus.landmarkOffsetMs)
    : null;
  const center = peakFrame
    ? {
        x:
          (Math.min(...peakFrame.image.map((p) => p.x)) +
            Math.max(...peakFrame.image.map((p) => p.x))) /
          2,
        y:
          (Math.min(...peakFrame.image.map((p) => p.y)) +
            Math.max(...peakFrame.image.map((p) => p.y))) /
          2,
      }
    : { x: 0.5, y: 0.5 };
  const imageStyle = {
    transform: detail ? 'scale(1.5)' : 'none',
    transformOrigin: `${center.x * 100}% ${center.y * 100}%`,
  };
  return (
    <section className="echo-viewer" aria-label="Movement comparison viewer">
      <div
        className="echo-stage"
        style={{ aspectRatio: `${focus.videoWidth} / ${focus.videoHeight}` }}
      >
        <video
          ref={videoRef}
          muted
          controls={!rep}
          playsInline
          preload="auto"
          style={imageStyle}
          aria-label={`Original recording: ${focus.name}`}
        />
        <canvas
          ref={canvasRef}
          width={720}
          height={Math.round((720 * focus.videoHeight) / focus.videoWidth)}
          style={{...imageStyle,pointerEvents:rep?'auto':'none'}}
          aria-label="Real video ghost overlays. Use session buttons below to select a recording."
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const ids = hitGhosts(
              {
                x: ((e.clientX - r.left) / r.width) * e.currentTarget.width,
                y: ((e.clientY - r.top) / r.height) * e.currentTarget.height,
              },
              drawnRef.current,
            );
            if (ids.length === 1) onFocus(ids[0]);
            else setChoices(ids);
          }}
        />
        <span className="echo-focus-label">
          <i />
          {focus.name.replace('.mov', '')}
          <small>Original video</small>
        </span>
        <button
          className="echo-frame-toggle"
          onClick={() => setDetail((v) => !v)}
        >
          {detail ? 'Full frame' : focus.trackingMode === 'pose' ? 'Movement detail' : 'Hand detail'}
        </button>
        {loading && (
          <div className="echo-stage-loading" role="status">
            Loading original recording…
          </div>
        )}
        {!!choices.length && (
          <div
            className="echo-hit-choices"
            role="group"
            aria-label="Choose an overlapping recording"
          >
            <p>Which recording?</p>
            {choices.map((id) => (
              <button
                key={id}
                onClick={() => {
                  onFocus(id);
                  setChoices([]);
                }}
              >
                {sessions.find((s) => s.id === id)?.name}
              </button>
            ))}
            <button onClick={() => setChoices([])}>Cancel</button>
          </div>
        )}
      </div>
      {error && (
        <p className="echo-error" role="alert">
          {error}
        </p>
      )}
      {rep?.static && (
        <p className="echo-note">
          Static pose · No distinct open–close cycle was detected. Other hands
          show their peak poses here.
        </p>
      )}
      {!rep && (
        <p className="echo-note">
          No usable repetition. You can inspect the original recording below.
        </p>
      )}
      <div className="echo-playback">
        <button
          className="echo-button echo-primary echo-play"
          onClick={() => void toggle()}
          disabled={loading || !rep || rep.static}
          aria-label={playing ? 'Pause comparison' : 'Play comparison'}
        >
          {playing ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <button
          className="echo-icon"
          aria-label="Replay repetition"
          disabled={!rep || rep.static}
          onClick={() => seek(0)}
        >
          <RotateCcw size={22} />
        </button>
        <div className="echo-timeline">
          <label className="echo-sr-only" htmlFor="echo-phase">
            Movement phase
          </label>
          <input
            id="echo-phase"
            aria-label="Movement phase"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={phase}
            disabled={!rep || rep.static || loading}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <div>
            <span>
              {elapsed.toFixed(1)} / {total.toFixed(1)}s
            </span>
            <span>
              {phase < 0.46
                ? focus.trackingMode === 'pose' ? 'Moving' : 'Opening'
                : phase > 0.54
                  ? focus.trackingMode === 'pose' ? 'Returning' : 'Closing'
                  : focus.trackingMode === 'pose' ? 'Peak movement' : 'Peak spread'}
            </span>
          </div>
        </div>
        <select
          aria-label="Playback speed"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        >
          <option value={1}>1×</option>
          <option value={0.5}>0.5×</option>
        </select>
      </div>
      <button
        className="echo-button echo-secondary echo-peak"
        disabled={!rep}
        onClick={() => {
          videoRef.current?.pause();
          playingRef.current = false;
          setPlaying(false);
          seek(0.5);
        }}
      >
        <ScanLine size={20} />
        Pause at peak {focus.trackingMode === 'pose' ? 'movement' : 'spread'}
      </button>
      <p className="echo-alignment" role="status">
        {status ||
          (focus.trackingMode === 'pose' ? `Aligned to the seated baseline · ${getExercise(focus.exerciseId).title}` : 'Aligned at the palm. Recorded finger positions stay unchanged.')}
        {reduced && ' Showing two ghosts to keep playback responsive.'}
      </p>
    </section>
  );
}
