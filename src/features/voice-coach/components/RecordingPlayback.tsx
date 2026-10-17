import { useEffect, useRef, useState } from "react";
import { Download, Play, Pause } from "lucide-react";
import type { CoachSessionRecord } from "../types/coach";
export function exportVideo(blob: Blob, id: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `remotion-${id}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function RecordingPlayback({
  session,
  video,
  seekMs,
  seekKey = 0,
}: {
  session: CoachSessionRecord;
  video?: Blob | null;
  seekMs?: number;
  seekKey?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState("");
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const duration = session.motionSession.duration;
  useEffect(() => {
    if (!video) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(video);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [video]);
  const seek = (seconds: number) => {
    if (!ref.current) return;
    try {
      ref.current.currentTime = Math.min(
        session.videoMetadata
          ? session.videoMetadata.durationMs / 1000
          : duration,
        Math.max(0, seconds),
      );
      setPosition(ref.current.currentTime);
    } catch {
      setError("The recording is still loading. Try the moment again shortly.");
    }
  };
  useEffect(() => {
    if (seekMs !== undefined && ref.current?.readyState) seek(seekMs / 1000);
  }, [seekMs, seekKey, url]);
  return (
    <section className="vc-card vc-replay" aria-label="Exercise recording">
      <div className="vc-card-title">
        <h3>Your exercise recording</h3>
        {video && (
          <button
            type="button"
            className="vc-icon-button"
            aria-label="Export exercise video"
            onClick={() => exportVideo(video, session.id)}
          >
            <Download size={20} />
          </button>
        )}
      </div>
      {url ? (
        <>
          <video
            ref={ref}
            src={url}
            playsInline
            controls
            preload="metadata"
            aria-label="Saved webcam exercise recording"
            onLoadedMetadata={() => {
              if (seekMs !== undefined) seek(seekMs / 1000);
            }}
            onTimeUpdate={() => setPosition(ref.current?.currentTime ?? 0)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() =>
              setError(
                "This browser cannot play this video codec. Export it and try another video player.",
              )
            }
          />
          <div className="vc-playback-controls">
            <button
              type="button"
              className="vc-primary"
              onClick={() => {
                if (playing) ref.current?.pause();
                else
                  void ref.current
                    ?.play()
                    .catch(() =>
                      setError("Tap the video Play control to begin playback."),
                    );
              }}
            >
              {playing ? <Pause size={20} /> : <Play size={20} />}{" "}
              {playing ? "Pause" : "Play recording"}
            </button>
            <span>
              {position.toFixed(1)}s / {duration.toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min="0"
            max={duration}
            step="0.05"
            value={Math.min(position, duration)}
            aria-label="Recording playback position"
            onChange={(event) => seek(Number(event.target.value))}
          />
          <div className="vc-replay-markers">
            {session.repetitions.map((rep, i) => (
              <button
                type="button"
                key={rep.id}
                onClick={() => seek(rep.peakMs / 1000)}
              >
                Repetition {i + 1}
                <small>{(rep.peakMs / 1000).toFixed(1)}s</small>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="vc-video-unavailable">
          <Play size={28} />
          <p>
            {session.source === "demo"
              ? "This sample has synthetic landmarks and no patient video."
              : "Video replay is unavailable. Video was not enabled, supported, or saved. Your measured landmarks are retained."}
          </p>
        </div>
      )}
      {session.videoMetadata?.warning && (
        <p className="vc-warning">{session.videoMetadata.warning}</p>
      )}
      {error && (
        <p className="vc-warning" role="status">
          {error}
        </p>
      )}
    </section>
  );
}
