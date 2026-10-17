import { useEffect, useRef, useState } from 'react';
import { Camera, Square, Upload } from 'lucide-react';
import { echoRepository } from './repository';
import type { EchoSession, Repetition } from './types';

export function RecordingTools({
  disabled,
  onImport,
}: {
  disabled: boolean;
  onImport: (
    blob: Blob,
    name: string,
    hand: 'Left' | 'Right',
    mirrored: boolean,
  ) => void;
}) {
  const [hand, setHand] = useState<'Left' | 'Right'>('Right'),
    [mirrored, setMirrored] = useState(false),
    [consent, setConsent] = useState(false),
    [recording, setRecording] = useState(false),
    [opening, setOpening] = useState(false),
    [error, setError] = useState('');
  const stream = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    preview = useRef<HTMLVideoElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    disposed = useRef(false);
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const start = async () => {
    setError('');
    setOpening(true);
    try {
      if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia)
        throw Error(
          'Camera recording is unavailable. Import a video file instead.',
        );
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 720 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });
      if (disposed.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/mp4',
        'video/webm',
      ].find((v) => MediaRecorder.isTypeSupported(v));
      const r = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.current = r;
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onerror = () => {
        setError('Recording failed. Try importing a video instead.');
        media.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      r.onstop = () => {
        clearTimeout(timer.current);
        media.getTracks().forEach((t) => t.stop());
        stream.current = null;
        if (disposed.current) return;
        setRecording(false);
        if (chunks.length)
          onImport(
            new Blob(chunks, { type: r.mimeType || mime || 'video/webm' }),
            `Camera ${new Date().toLocaleTimeString()}`,
            hand,
            mirrored,
          );
      };
      setRecording(true);
      r.start(250);
      timer.current = setTimeout(() => {
        if (r.state === 'recording') r.stop();
      }, 90000);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setError(e instanceof Error ? e.message : 'Camera access failed.');
    } finally {
      if (!disposed.current) setOpening(false);
    }
  };
  useEffect(() => {
    if (recording && preview.current && stream.current) {
      preview.current.srcObject = stream.current;
      void preview.current.play().catch(() => {});
    }
  }, [recording]);
  return (
    <div className="echo-record-tools">
      <p>
        New camera clips have no microphone audio. Imported videos are kept
        unchanged and played muted.
      </p>
      <p>
        One hand, a fixed camera, and an evenly lit plain backdrop give the
        clearest outlines. Use the same physical hand and recording orientation
        for comparisons.
      </p>
      <div className="echo-fields">
        <label>
          Physical hand
          <select
            value={hand}
            disabled={recording}
            onChange={(e) => setHand(e.target.value as 'Left' | 'Right')}
          >
            <option>Right</option>
            <option>Left</option>
          </select>
        </label>
        <label className="echo-check">
          <input
            type="checkbox"
            checked={mirrored}
            disabled={recording}
            onChange={(e) => setMirrored(e.target.checked)}
          />
          The saved pixels are mirrored
        </label>
      </div>
      <label className="echo-check">
        <input
          type="checkbox"
          checked={consent}
          disabled={recording}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I agree to store this video and its hand landmarks in this browser.
      </label>
      <div className="echo-actions">
        <label
          className={`echo-button echo-secondary ${!consent || disabled || recording ? 'echo-disabled' : ''}`}
        >
          <Upload size={20} />
          Import video
          <input
            type="file"
            accept="video/*,.mov"
            disabled={!consent || disabled || recording}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file, file.name, hand, mirrored);
              e.target.value = '';
            }}
          />
        </label>
        <button
          className="echo-button echo-secondary"
          disabled={!consent || opening || (disabled && !recording)}
          onClick={() => {
            if (recording) recorder.current?.stop();
            else void start();
          }}
        >
          {recording ? (
            <>
              <Square size={19} />
              Finish recording
            </>
          ) : (
            <>
              <Camera size={20} />
              Record a new clip
            </>
          )}
        </button>
      </div>
      {recording && (
        <>
          <video
            ref={preview}
            autoPlay
            muted
            playsInline
            className="echo-capture-preview"
          />
          <p role="status">
            Recording silent video · Stops automatically after 90 seconds.
            Follow your usual prescribed exercise; stop if uncomfortable.
          </p>
        </>
      )}
      {error && (
        <p className="echo-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function MarkerEditor({
  session,
  onSaved,
}: {
  session: EchoSession;
  onSaved: (session: EchoSession) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [marks, setMarks] = useState<(number | null)[]>([null, null, null]),
    [error, setError] = useState('');
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const url = URL.createObjectURL(session.video);
    v.src = url;
    return () => {
      v.pause();
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
    };
  }, [session.video]);
  const save = async () => {
    const [start, peak, end] = marks;
    if (
      start === null ||
      peak === null ||
      end === null ||
      peak - start < 200 ||
      end - peak < 200
    ) {
      setError(
        'Mark a start, then a peak, then an end at least 0.2 seconds apart.',
      );
      return;
    }
    const frames = session.frames.filter(
      (f) =>
        f.tMs + session.landmarkOffsetMs >= start &&
        f.tMs + session.landmarkOffsetMs <= end,
    );
    const coverage =
      frames.filter((f) => f.valid).length / Math.max(1, frames.length);
    if (coverage < 0.8) {
      setError(
        'Too much tracking was lost in this interval. Choose a better-tracked interval.',
      );
      return;
    }
    const closest = frames
      .filter((f) => f.valid)
      .sort(
        (a, b) =>
          Math.abs(a.tMs + session.landmarkOffsetMs - peak) -
          Math.abs(b.tMs + session.landmarkOffsetMs - peak),
      )[0];
    const rep: Repetition = {
      startMs: start,
      peakMs: peak,
      endMs: end,
      coverage,
      peakSpread: closest.spread!,
      valid: true,
      manual: true,
    };
    const updated = {
      ...session,
      repetitions: [...session.repetitions.filter((r) => !r.static), rep],
    };
    try {
      await echoRepository.save(updated);
      await echoRepository.clearCache(session.id);
      onSaved(updated);
    } catch {
      setError(
        'The phase markers could not be saved. Free some browser storage and retry.',
      );
    }
  };
  return (
    <div className="echo-marker-editor">
      <p>
        Use the original video to mark one complete cycle. Manual markers are
        labeled; they do not confirm an automatically detected repetition.
      </p>
      <video
        ref={ref}
        controls
        muted
        playsInline
        aria-label="Original video for manual phase marking"
      />
      <div className="echo-actions">
        {['Start together', 'Peak spread', 'End together'].map((label, i) => (
          <button
            key={label}
            className="echo-button echo-secondary"
            onClick={() =>
              setMarks((m) =>
                m.map((v, j) =>
                  j === i ? (ref.current?.currentTime ?? 0) * 1000 : v,
                ),
              )
            }
          >
            {label}
            {marks[i] !== null ? ` · ${(marks[i]! / 1000).toFixed(2)}s` : ''}
          </button>
        ))}
      </div>
      <button className="echo-button echo-primary" onClick={() => void save()}>
        Save manual cycle
      </button>
      {error && (
        <p role="alert" className="echo-error">
          {error}
        </p>
      )}
    </div>
  );
}
