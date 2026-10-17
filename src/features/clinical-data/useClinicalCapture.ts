import { useEffect, useRef, useState } from 'react';
import type { MotionSession } from '../../lib/types';
import { SessionVideoCapture, videoHash } from './capture';
import { clinicalRepository, useClinicalAccess } from './access';
import { recordingOutbox } from './outbox';
import type { ClinicalAccess } from './access';

export function useClinicalCapture() {
  const [consent, setConsent] = useState(false), [notice, setNotice] = useState(''), [version, setVersion] = useState(0);
  const active = useRef<{ capture: SessionVideoCapture; stop: () => void; access: ClinicalAccess; startedAt: string } | null>(null);
  const finishing = useRef(false);
  useEffect(() => () => { active.current?.stop(); }, []);
  const begin = (video: HTMLVideoElement | null, originMs: number, startedAt: string) => {
    const access = useClinicalAccess.getState().access;
    if (!consent || access?.role !== 'patient' || !access.patientId) return;
    if (!video) throw Error('Camera preview is unavailable for video recording.');
    const capture = new SessionVideoCapture();
    const control = capture.start(video, originMs, startedAt);
    active.current = { capture, stop: control.stop, access: { ...access }, startedAt }; finishing.current = false;
    setNotice('Recording video for your clinician.');
  };
  const finish = (motion: MotionSession) => {
    const current = active.current;
    if (!current || finishing.current) return;
    finishing.current = true; current.stop();
    void (async () => {
      try {
        const captured = await current.capture.finish();
        const sha256 = await videoHash(captured.video);
        const saved = { ...motion, createdAt: current.startedAt };
        const metadata = { id: motion.id, patientId: current.access.patientId, exerciseId: motion.exerciseId ?? 'finger-spread-close', hand: motion.hand, startedAt: current.startedAt, demonstration: current.access.demonstration, videoKind: 'camera' as const, video: { ...captured.metadata, sha256 } };
        // Commit video + landmarks in one local record BEFORE any network request.
        await recordingOutbox.save(metadata, saved, captured.video); setVersion(value => value + 1); setNotice('Saved locally. Uploading…');
        if (useClinicalAccess.getState().access?.token !== current.access.token) { setNotice('Saved locally. Reconnect this patient to upload.'); return; }
        const result = await recordingOutbox.sync(motion.id, clinicalRepository);
        setNotice(result.state === 'synced' ? 'Uploaded for clinician review.' : result.error ?? 'Saved locally. Retry upload.');
        if (result.state === 'synced') {
          // AI failure is independent from upload success. No fabricated fallback summary.
          void clinicalRepository.report(motion.id).catch(() => {});
        }
        setVersion(value => value + 1);
      } catch (error) { setNotice(error instanceof Error ? error.message : 'Video could not be saved.'); }
      finally { if (active.current === current) active.current = null; }
    })();
  };
  return { consent, setConsent, notice, version, begin, finish };
}
