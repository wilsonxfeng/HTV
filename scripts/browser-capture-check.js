/** Run from the local Vite page only. Synthetic pixels; requires the loopback demo API. */
export async function runCaptureCheck() {
  const { SessionVideoCapture, videoHash } = await import('/src/features/clinical-data/capture.ts');
  const { ApiSessionRepository } = await import('/src/features/clinical-data/api.ts');
  const { recordingOutbox } = await import('/src/features/clinical-data/outbox.ts');
  const { makeDemoHand } = await import('/src/lib/demo.ts');
  const { getPhase, HAND_CONNECTIONS } = await import('/src/lib/geometry.ts');
  const response = await fetch('/api/demo-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'patient' }) });
  if (!response.ok) throw Error('Start api:demo; this check is restricted to fictional local demo access.');
  const access = await response.json(), repository = new ApiSessionRepository('', () => access.token);
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480; document.body.append(canvas);
  const context = canvas.getContext('2d');
  let origin = 0;
  const frames = [];
  const paint = () => {
    const t = origin ? (performance.now() - origin) / 1000 : 0;
    const landmarks = makeDemoHand(getPhase(t, 6).amount * .75);
    const imageLandmarks = landmarks.map(p => ({ x: .5 + p.x * .14, y: .85 - p.y * .25, z: p.z * .14 }));
    context.fillStyle = '#edf2e6'; context.fillRect(0, 0, 640, 480);
    context.fillStyle = '#254d3c'; context.font = '22px sans-serif'; context.fillText('SYNTHETIC CAPTURE TEST', 18, 32);
    context.strokeStyle = '#dbaa86'; context.lineWidth = 18; context.lineCap = 'round';
    for (const [a, b] of HAND_CONNECTIONS) { context.beginPath(); context.moveTo(imageLandmarks[a].x * 640, imageLandmarks[a].y * 480); context.lineTo(imageLandmarks[b].x * 640, imageLandmarks[b].y * 480); context.stroke(); }
    if (origin) frames.push({ t, landmarks, worldLandmarks: landmarks, imageLandmarks, tracking: true, confidence: 1 });
  };
  const timer = setInterval(paint, 82); paint();
  const preview = document.createElement('video'); preview.muted = true; preview.playsInline = true; preview.srcObject = canvas.captureStream(15); document.body.append(preview);
  try {
    await preview.play();
    const capture = new SessionVideoCapture(), startedAt = new Date().toISOString(); origin = performance.now();
    const control = capture.start(preview, origin, startedAt);
    await new Promise(resolve => setTimeout(resolve, 18000)); clearInterval(timer);
    const duration = (performance.now() - origin) / 1000; control.stop();
    const captured = await capture.finish(), id = crypto.randomUUID();
    const motion = { id, createdAt: startedAt, exerciseId: 'finger-spread-close', hand: 'Right', duration, cycleDuration: 6, source: 'demo', completed: true, calibration: { neutral: makeDemoHand(0), target: makeDemoHand(1), source: 'demo', hand: 'Right', createdAt: startedAt }, frames };
    const metadata = { id, patientId: access.patientId, exerciseId: motion.exerciseId, hand: motion.hand, startedAt, demonstration: true, videoKind: 'synthetic', video: { ...captured.metadata, sha256: await videoHash(captured.video) } };
    await recordingOutbox.save(metadata, motion, captured.video);
    const result = await recordingOutbox.sync(id, repository);
    if (result.state !== 'synced') throw Error(`Upload failed; local video preserved: ${result.error}`);
    const restored = await repository.detail(id), stored = await repository.video(id);
    return { id, state: result.state, videoBytes: stored.size, frames: restored.motion.frames.length, cycles: restored.repetitions.length, offsetMs: restored.video.landmarkOffsetMs, localCopyBytes: (await recordingOutbox.get(id)).video.size };
  } finally { clearInterval(timer); preview.srcObject.getTracks().forEach(track => track.stop()); preview.remove(); canvas.remove(); }
}
