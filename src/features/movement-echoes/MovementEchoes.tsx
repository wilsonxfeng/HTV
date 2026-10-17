import type { EvidenceFocus } from '../ask-remotion/contracts';
import { getExercise } from '../body-exercises/exerciseRegistry';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Layers, RefreshCw, Trash2 } from 'lucide-react';
import EchoViewer from './EchoViewer';
import SideBySide from './SideBySide';
import { MarkerEditor, RecordingTools } from './RecordingTools';
import { compatible, representativeRep } from './geometry';
import { buildGhostCache, importRecording } from './processing';
import { echoRepository } from './repository';
import { loadPreparedDemo } from './preparedDemo';
import { DEMO_CLIPS } from './demoClips';
import { ECHO_COLORS } from './rendering';
import { DEFAULT_CONFIG } from './types';
import type { EchoSession, GhostCache, ProcessingUpdate } from './types';
import './echoes.css';

export interface MovementEchoesProps {
  sessions?: EchoSession[];
  evidenceFocus?: EvidenceFocus;
  initialFocusedSessionId?: string;
  onClose?: () => void;
  /** Delete matching host history only if that host explicitly linked a video. */
  onDeleted?: (id: string) => void | Promise<void>;
  /** Authorized remote selection only: no browser recording merge or persistent image cache. */
  providedOnly?: boolean;
  /** Opt-in only for locally captured body video, never remote patient images. */
  cacheLocally?: boolean;
  backLabel?: string;
}
export default function MovementEchoes({
  sessions: provided = [],
  initialFocusedSessionId,
  evidenceFocus,
  onClose,
  onDeleted,
  providedOnly = false,
  cacheLocally = false,
  backLabel,
}: MovementEchoesProps) {
  const [sessions, setSessions] = useState<EchoSession[]>([]),
    [focusId, setFocusId] = useState(initialFocusedSessionId ?? ''),
    [ready, setReady] = useState(false);
  const [repChoices, setRepChoices] = useState<Record<string, number>>({}),
    [caches, setCaches] = useState<Record<string, GhostCache>>({}),
    [failures, setFailures] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false),
    [preparing, setPreparing] = useState(false),
    [update, setUpdate] = useState<ProcessingUpdate | null>(null),
    [error, setError] = useState('');
  const [config, setConfig] = useState(DEFAULT_CONFIG),
    [retry, setRetry] = useState(0),
    [overlay, setOverlay] = useState(false),
    [opacity, setOpacity] = useState(0.3),
    [limit, setLimit] = useState(3),
    [reveal, setReveal] = useState(0),
    [revealed, setRevealed] = useState(5),
    [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [sideBySide, setSideBySide] = useState(false);
  const [tools, setTools] = useState(false),
    [markers, setMarkers] = useState(false),
    [deleteId, setDeleteId] = useState<string | null>(null),
    [inspecting, setInspecting] = useState(false);
  const importController = useRef<AbortController | null>(null),
    revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const providedRef = useRef(provided);
  useEffect(() => {
    let live = true;
    void (providedOnly ? Promise.resolve([] as EchoSession[]) : echoRepository.list())
      .then((saved) => {
        if (!live) return;
        const merged = [
          ...new Map(
            [...saved, ...providedRef.current].map((s) => [s.id, s]),
          ).values(),
        ];
        setSessions(merged);
        setRepChoices(
          Object.fromEntries(
            merged.map((s) => [s.id, representativeRep(s.repetitions)]),
          ),
        );
        setFocusId((id) =>
          merged.some((s) => s.id === id) ? id : (merged.at(-1)?.id ?? ''),
        );
        setReady(true);
      })
      .catch(() => {
        if (live) {
          setError(
            'Local recording storage is unavailable. Your existing ReMotion history is unchanged.',
          );
          setSessions(providedRef.current);
          setReady(true);
        }
      });
    return () => {
      live = false;
      importController.current?.abort();
      revealTimers.current.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    if(!providedOnly || !ready)return;
    setSessions(current => {
      const additions=provided.filter(s=>!current.some(c=>c.id===s.id));
      return additions.length ? [...current,...additions] : current;
    });
  },[provided,providedOnly,ready]);
  useEffect(() => {
    if (!ready || importing || !sessions.length) return;
    const controller = new AbortController();
    setPreparing(true);
    setFailures({});
    setCaches({});
    void (async () => {
      for (const session of sessions) {
        if (controller.signal.aborted) return;
        if (!session.repetitions.length) {
          setFailures((f) => ({
            ...f,
            [session.id]: 'No usable tracked cycle. Use the original video and phase markers.',
          }));
          continue;
        }
        try {
          const cache = await buildGhostCache(
            session,
            repChoices[session.id] ?? 0,
            config,
            (u) => {
              if (!controller.signal.aborted) setUpdate(u);
            },
            controller.signal,
            false,
            !providedOnly || cacheLocally,
          );
          if (!controller.signal.aborted)
            setCaches((c) => ({ ...c, [session.id]: cache }));
        } catch (e) {
          if (controller.signal.aborted) return;
          setFailures((f) => ({
            ...f,
            [session.id]:
              e instanceof Error ? e.message : 'Outline preparation failed.',
          }));
        }
      }
      if (!controller.signal.aborted) {
        setPreparing(false);
        setUpdate(null);
      }
    })();
    return () => controller.abort();
  }, [sessions, repChoices, config, importing, ready, retry]);
  useEffect(() => {
    if(!evidenceFocus || !sessions.some(s=>s.id===evidenceFocus.sessionId))return;
    setFocusId(evidenceFocus.sessionId);setSideBySide(false);
    if(evidenceFocus.repetitionIndex!==null)setRepChoices(current=>current[evidenceFocus.sessionId]===evidenceFocus.repetitionIndex?current:{...current,[evidenceFocus.sessionId]:evidenceFocus.repetitionIndex!});
  },[evidenceFocus,sessions]);
  const focus = sessions.find((s) => s.id === focusId);
  const comparison = useMemo(
    () =>
      focus
        ? sessions.filter((s) => s.id !== focus.id && compatible(focus, s))
        : [],
    [focus, sessions],
  );
  const ghosts = useMemo(
    () =>
      overlay
        ? comparison
            .filter((s) => enabled[s.id] !== false)
            .slice(0, Math.min(limit, revealed))
            .map((s) => s.id)
        : [],
    [comparison, enabled, limit, overlay, revealed],
  );
  const saveImported = async (
    blob: Blob,
    name: string,
    hand: EchoSession['selectedHand'],
    mirrored: boolean,
    demo = false,
    id: string = crypto.randomUUID(),
  ) => {
    const session = await importRecording(
      blob,
      {
        id,
        name,
        selectedHand: hand,
        mirrored,
        demonstration: demo,
        comparisonGroup: demo ? 'supplied-same-hand-demo' : undefined,
        createdAt: new Date().toISOString(),
      },
      setUpdate,
      importController.current?.signal,
    );
    if (importController.current?.signal.aborted) return;
    await echoRepository.save(session);
    setSessions((s) => [...s.filter((v) => v.id !== session.id), session]);
    setRepChoices((r) => ({
      ...r,
      [id]: representativeRep(session.repetitions),
    }));
    setFocusId(id);
  };
  const importOne = async (
    blob: Blob,
    name: string,
    hand: 'Left' | 'Right',
    mirrored: boolean,
  ) => {
    if (importing) return;
    importController.current = new AbortController();
    setImporting(true);
    setError('');
    try {
      await saveImported(blob, name, hand, mirrored);
    } catch (e) {
      if (!importController.current.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : 'This recording could not be imported.',
        );
    } finally {
      setImporting(false);
      setUpdate(null);
    }
  };
  const importDemo = async () => {
    if (importing) return;
    importController.current = new AbortController();
    setImporting(true);
    setError('');
    try {
      for (const clip of DEMO_CLIPS) {
        if (sessions.some((s) => s.id === clip.id)) continue;
        setUpdate({
          stage: 'Loading supplied demo video',
          completed: 0,
          total: 1,
          sessionName: clip.name,
        });
        const response = await fetch(clip.url, {
          signal: importController.current.signal,
        });
        if (!response.ok)
          throw Error(`${clip.name} was not found in public/demo recordings.`);
        const blob = await response.blob();
        const prepared = await loadPreparedDemo(
          clip.id,
          blob,
          setUpdate,
          importController.current.signal,
        );
        if (prepared) {
          await echoRepository.save(prepared.session);
          await echoRepository.saveCache(prepared.cache);
          setSessions((s) => [
            ...s.filter((v) => v.id !== clip.id),
            prepared.session,
          ]);
          setRepChoices((r) => ({
            ...r,
            [clip.id]: representativeRep(prepared.session.repetitions),
          }));
          setFocusId(clip.id);
        } else
          await saveImported(
            blob,
            clip.name,
            'Unconfirmed',
            false,
            true,
            clip.id,
          );
      }
    } catch (e) {
      if (!importController.current.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : 'Demo import failed. Retry to resume.',
        );
    } finally {
      setImporting(false);
      setUpdate(null);
    }
  };
  const overlayWeek = () => {
    setSideBySide(false);
    revealTimers.current.forEach(clearTimeout);
    setOverlay(true);
    setLimit(focus?.trackingMode === 'pose' ? 3 : 5);
    setOpacity(comparison.length > 1 ? .2 : .3);
    setEnabled({});
    setRevealed(0);
    setReveal((v) => v + 1);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) setRevealed(5);
    else
      comparison
        .slice(0, 5)
        .forEach((_, i) =>
          revealTimers.current.push(
            setTimeout(() => setRevealed(i + 1), i * 230 + 50),
          ),
        );
  };
  const remove = async (id: string) => {
    try {
      if (sessions.find(s => s.id === id)?.trackingMode === 'pose') {
        const { bodyRecordingStore } = await import('../body-tracking/bodyRecordingStore');
        await bodyRecordingStore.remove(id);
      }
      await echoRepository.delete(id);
      await onDeleted?.(id);
      setSessions((s) => s.filter((v) => v.id !== id));
      if (id === focusId)
        setFocusId(sessions.find((s) => s.id !== id)?.id ?? '');
      setDeleteId(null);
    } catch {
      setError('The recording could not be fully deleted. Retry the deletion.');
    }
  };
  const selectedRep = focus?.repetitions[repChoices[focus.id] ?? 0];
  const validCounts = (id: string) => {
    const c = caches[id];
    return c
      ? `${c.frames.filter((f) => f.quality.valid).length}/${c.frames.length}`
      : 'Preparing';
  };
  return (
    <div className="echoes">
      <header className="echo-header">
        {onClose && (
          <button className="echo-back" onClick={onClose}>
            <ArrowLeft size={20} />
            {backLabel ?? (providedOnly ? 'Back to dashboard' : 'Back to Progress')}
          </button>
        )}
        <div className="echo-title-row">
          <div>
            <h1>
              Movement Echoes<span>.</span>
            </h1>
          </div>
          <span className="echo-title-icon">
            <Layers size={30} />
          </span>
        </div>
        {!providedOnly&&<p className="echo-local">Local preview · Videos stay in this browser.</p>}
      </header>
      {error && (
        <p className="echo-error" role="alert">
          {error}
        </p>
      )}
      {(preparing || importing) && (
        <div className="echo-processing" role="status">
          <div>
            <strong>{update?.stage ?? 'Preparing movement comparison…'}</strong>
            <span>{update?.sessionName}</span>
          </div>
          <progress
            aria-label="Current processing step"
            value={update?.completed ?? 0}
            max={update?.total ?? 1}
          />
          {importing && (
            <button
              className="echo-text-button"
              onClick={() => importController.current?.abort()}
            >
              Cancel import
            </button>
          )}
        </div>
      )}
      {!ready ? (
        <p role="status">Loading local recordings…</p>
      ) : !sessions.length ? (
        <section className="echo-empty">
          <span className="echo-empty-icon">
            <Layers size={40} />
          </span>
          <h2>Bring your movement into view.</h2>
          <p>
            Superimpose real hand cutouts from the four supplied recordings. One
            video stays in full color; the others become aligned, translucent
            echoes.
          </p>
          <button
            className="echo-button echo-primary"
            disabled={importing}
            onClick={() => void importDemo()}
          >
            Prepare four demo clips
            <ArrowRight size={20} />
          </button>
          <p className="echo-note">
            Demonstration footage · Not a patient’s recovery history.
            Preparation runs once on this device.
          </p>
        </section>
      ) : null}
      {evidenceFocus && evidenceFocus.sessionId===focusId && <p className="echo-notice" role="status">Search evidence · {evidenceFocus.timestampMs===null?'Session measurement; exact timestamp unavailable.':`Recorded event at ${(evidenceFocus.timestampMs/1000).toFixed(2)}s · Repetition ${(evidenceFocus.repetitionIndex??0)+1}`}</p>}
      {focus && (
        <>
          <div className="echo-demo-banner">
            {providedOnly ? focus.demonstration ? 'Demo footage · Not a recovery history.' : cacheLocally ? 'Local recording' : 'Authorized patient recordings' : focus.demonstration
              ? 'Supplied demonstration footage · The filenames describe intended ranges, not measured progress. Physical left/right hand identity is unconfirmed.'
              : 'Compare the same exercise, side and camera view.'}
          </div>
          <div className="echo-layout">
            <div className="echo-main">
              <div className="echo-view-top">
                <span className="echo-eyebrow">
                  {ghosts.length
                    ? `${ghosts.length} PAST ${ghosts.length === 1 ? 'RECORDING' : 'RECORDINGS'} OVERLAID`
                    : 'ONE RECORDING, IN FOCUS'}
                </span>
                <button
                  className="echo-button echo-primary"
                  disabled={!comparison.length}
                  onClick={overlayWeek}
                >
                  <Layers size={20} />
                  Overlay Sessions
                </button>
              </div>
              <div className="echo-mode-row">
                <button
                  className="echo-text-button"
                  disabled={!comparison.length}
                  onClick={() => setSideBySide((v) => !v)}
                >
                  {sideBySide
                    ? 'Return to overlays'
                    : 'Compare original videos side by side'}
                </button>
              </div>
              {sideBySide ? (
                <SideBySide
                  focus={focus}
                  others={comparison}
                  repChoices={repChoices}
                />
              ) : (
                <EchoViewer
                  sessions={sessions}
                  focusId={focus.id}
                  evidenceFocus={evidenceFocus}
                  caches={caches}
                  repChoices={repChoices}
                  ghostIds={ghosts}
                  opacity={opacity}
                  onFocus={(id) => {
                    setFocusId(id);
                    setMarkers(false);
                    setInspecting(false);
                  }}
                  revealToken={reveal}
                />
              )}
              <div className="echo-repeat-row">
                <label>
                  Compare
                  <select
                    aria-label="Focused repetition"
                    value={repChoices[focus.id] ?? 0}
                    onChange={(e) =>
                      setRepChoices((r) => ({
                        ...r,
                        [focus.id]: Number(e.target.value),
                      }))
                    }
                  >
                    {focus.repetitions.map((rep, i) => (
                      <option key={i} value={i}>
                        {rep.static
                          ? 'Static pose'
                          : `Repetition ${i + 1}${rep.manual ? ' · manual markers' : ''}`}
                      </option>
                    ))}
                  </select>
                </label>
                <span>
                  {selectedRep?.coverage !== undefined
                    ? `${Math.round(selectedRep.coverage * 100)}% tracked samples`
                    : ''}
                </span>
              </div>
              <section className="echo-session-section">
                <div className="echo-section-heading">
                  <h2>Choose a recording</h2>
                  <span>Tap an outline or a date</span>
                </div>
                <div
                  className="echo-session-chips"
                  role="group"
                  aria-label="Focused recording"
                >
                  {sessions.map((s, i) => (
                    <button
                      key={s.id}
                      className={s.id === focus.id ? 'selected' : ''}
                      aria-pressed={s.id === focus.id}
                      onClick={() => {
                        setFocusId(s.id);
                        setMarkers(false);
                        setInspecting(false);
                      }}
                    >
                      <i
                        style={{
                          background: ECHO_COLORS[i % ECHO_COLORS.length],
                        }}
                      />
                      <span>
                        {s.name.replace(/\.(mov|mp4|webm)$/i, '')}
                        <small>
                          {s.repetitions[repChoices[s.id] ?? 0]?.static
                            ? 'Static pose'
                            : s.demonstration
                              ? 'Demo clip'
                              : `Imported ${new Date(s.createdAt).toLocaleDateString()}`}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
            <aside className="echo-sidebar">
              <section className="echo-control-card">
                <div className="echo-section-heading">
                  <h2>Your echoes</h2>
                  <Layers size={23} />
                </div>
                <label className="echo-check">
                  <input
                    type="checkbox"
                    checked={overlay}
                    onChange={(e) => {
                      setOverlay(e.target.checked);
                      setRevealed(5);
                    }}
                  />
                  Show past sessions
                </label>
                <label className="echo-range-label">
                  Ghost opacity<span>{Math.round(opacity * 100)}%</span>
                  <input
                    aria-label="Ghost opacity"
                    type="range"
                    min={0.1}
                    max={0.6}
                    step={0.01}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                  />
                </label>
                <label className="echo-fields">
                  Number of ghosts
                  <select
                    aria-label="Number of ghosts"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                  >
                    {(focus.trackingMode === 'pose' ? [1, 2, 3] : [1, 2, 3, 4, 5]).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="echo-layer-list">
                  {sessions
                    .filter((s) => s.id !== focus.id)
                    .map((s, i) => {
                      const eligible = compatible(focus, s);
                      return (
                        <label className="echo-layer" key={s.id}>
                          <input
                            type="checkbox"
                            checked={eligible && enabled[s.id] !== false}
                            disabled={!eligible}
                            onChange={(e) =>
                              setEnabled((v) => ({
                                ...v,
                                [s.id]: e.target.checked,
                              }))
                            }
                          />
                          <i
                            style={{
                              background:
                                ECHO_COLORS[
                                  sessions.indexOf(s) % ECHO_COLORS.length
                                ],
                            }}
                          />
                          <span>
                            {s.name.replace('.mov', '')}
                            <small>
                              {!eligible
                                ? 'Different side, exercise, viewpoint or analysis version'
                                : failures[s.id]
                                  ? 'Outline unavailable'
                                  : s.repetitions[repChoices[s.id] ?? 0]?.static
                                    ? 'Static real pose · No detected cycle'
                                    : `${validCounts(s.id)} reliable outline samples`}
                            </small>
                          </span>
                          <span className="echo-sr-only">Layer {i + 1}</span>
                        </label>
                      );
                    })}
                </div>
                <p className="echo-note">
                  {focus.trackingMode === 'pose' ? 'Aligned once to the seated baseline. Limb shapes and movement stay unchanged.' : 'Only the palm is aligned. Every finger keeps its recorded shape and position.'}
                </p>
              </section>
              <section className="echo-metrics">
                <p className="echo-eyebrow">RECORDED MOVEMENT</p>
                <h2>
                  {getExercise(focus.exerciseId).experimental ? 'Video only' : selectedRep ? `${selectedRep.peakSpread.toFixed(1)}°` : '—'}
                  <span>
                    {selectedRep?.static
                      ? 'at the selected still pose'
                      : 'at this repetition’s peak'}
                  </span>
                </h2>
                <p>
                  {focus.trackingMode === 'pose' ? `${getExercise(focus.exerciseId).peakLabel} · Camera estimate` : 'Mean finger-axis separation, estimated in 3D.'}
                </p>
                {comparison[0] && selectedRep && !getExercise(focus.exerciseId).experimental && (
                  <p className="echo-difference">
                    {comparison[0].name.replace('.mov', '')}:{' '}
                    {comparison[0].repetitions[
                      repChoices[comparison[0].id] ?? 0
                    ]?.peakSpread.toFixed(1) ?? '—'}
                    ° at its selected{' '}
                    {comparison[0].repetitions[
                      repChoices[comparison[0].id] ?? 0
                    ]?.static
                      ? 'still pose'
                      : 'peak'}
                    .
                  </p>
                )}
                <p className="echo-note">
                  One selected cycle or still pose per recording. These
                  differences do not measure clinical recovery.
                </p>
              </section>
            </aside>
          </div>
          <details
            className="echo-details"
            onToggle={(e) => setInspecting(e.currentTarget.open)}
          >
            <summary>Inspect extraction quality</summary>
            {inspecting && <QualityPreview cache={caches[focus.id]} />}
            {focus.trackingMode !== 'pose' && <label className="echo-range-label">
              Color tolerance<span>{config.colorTolerance.toFixed(2)}×</span>
              <input
                aria-label="Segmentation color tolerance"
                type="range"
                min={0.6}
                max={1.5}
                step={0.05}
                value={config.colorTolerance}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    colorTolerance: Number(e.target.value),
                  }))
                }
              />
            </label>}
            <p className="echo-note">
              {focus.trackingMode === 'pose' ? 'Masks come from the recorded person. Unreliable outlines are hidden.' : <>Color is learned from this recording’s palm and fingers. A plain
              backdrop works best. Higher tolerance can include background;
              unreliable outlines are hidden.</>}
            </p>
            {Object.entries(failures).map(([id, message]) => (
              <p key={id} className="echo-error">
                {sessions.find((s) => s.id === id)?.name}: {message}
              </p>
            ))}
            <button
              className="echo-button echo-secondary"
              disabled={preparing}
              onClick={() => {
                void Promise.all(
                  sessions.map((s) => echoRepository.clearCache(s.id)),
                )
                  .then(() => setRetry((v) => v + 1))
                  .catch(() => setError('Could not clear the ghost cache.'));
              }}
            >
              <RefreshCw size={19} />
              Rebuild local outlines
            </button>
          </details>
          {(!providedOnly||cacheLocally)&&<details
            className="echo-details"
            onToggle={(e) => setMarkers(e.currentTarget.open)}
          >
            <summary>Original video and manual phase markers</summary>
            {markers && (
              <MarkerEditor
                key={focus.id}
                session={focus}
                onSaved={(updated) => {
                  setSessions((s) =>
                    s.map((v) => (v.id === updated.id ? updated : v)),
                  );
                  setRepChoices((r) => ({
                    ...r,
                    [updated.id]: updated.repetitions.length - 1,
                  }));
                }}
              />
            )}
          </details>}
          {!providedOnly&&<div className="echo-delete">
            {deleteId === focus.id ? (
              <>
                <p>
                  Delete this local video, landmarks and all of its ghost
                  caches?
                </p>
                <button
                  className="echo-button echo-danger"
                  onClick={() => void remove(focus.id)}
                >
                  Delete recording
                </button>
                <button
                  className="echo-button echo-secondary"
                  onClick={() => setDeleteId(null)}
                >
                  Keep recording
                </button>
              </>
            ) : (
              <button
                className="echo-text-button"
                onClick={() => setDeleteId(focus.id)}
              >
                <Trash2 size={18} />
                Delete this local recording
              </button>
            )}
          </div>}
        </>
      )}
      {!providedOnly&&<details
        className="echo-details"
        open={tools}
        onToggle={(e) => setTools(e.currentTarget.open)}
      >
        <summary>Add a recording</summary>
        {tools && (
          <RecordingTools
            disabled={importing || preparing}
            onImport={(...args) => void importOne(...args)}
          />
        )}{' '}
        {!!sessions.length &&
          DEMO_CLIPS.some((c) => !sessions.some((s) => s.id === c.id)) && (
            <button
              className="echo-button echo-secondary"
              disabled={importing}
              onClick={() => void importDemo()}
            >
              Load remaining supplied demo clips
            </button>
          )}
      </details>}
    </div>
  );
}
function QualityPreview({ cache }: { cache?: GhostCache }) {
  const [url, setUrl] = useState('');
  const frame = cache?.frames.reduce<(typeof cache.frames)[number] | undefined>(
    (best, v) =>
      !best || Math.abs(v.phase - 0.5) < Math.abs(best.phase - 0.5) ? v : best,
    undefined,
  );
  useEffect(() => {
    if (!frame) return;
    const u = URL.createObjectURL(frame.image);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [frame]);
  return frame ? (
    <div className="echo-quality">
      <div className="echo-checker">
        <img
          src={url}
          alt="Actual extracted hand pixels on a transparency checkerboard"
        />
      </div>
      <div>
        <strong>
          {frame.quality.valid
            ? 'Outline passed basic checks'
            : 'Hand outline unavailable at this phase'}
        </strong>
        <p>
          {frame.quality.tipsRetained}/5 fingertip regions ·{' '}
          {Math.round(frame.quality.palmRetained * 100)}% palm seed retention
        </p>
        <p>
          {frame.quality.warnings.join(' ') || 'No crop-edge leakage detected.'}
        </p>
        <p className="echo-note">
          Heuristic checks, not a validated segmentation accuracy score.
        </p>
      </div>
    </div>
  ) : (
    <p>Outline cache is not ready.</p>
  );
}
