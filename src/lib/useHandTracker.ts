import { useCallback, useEffect, useRef, useState } from 'react';
import { createTrackingAdapter, type TrackingAdapter } from '../features/body-tracking/trackingAdapter';
import { HAND_CONNECTIONS, normalizeHand, pairAngles } from './geometry';
import type { HandFrame } from './types';

export type TrackerStatus = 'off' | 'loading' | 'ready' | 'error';
export interface TrackedSample extends HandFrame { observedAt: number; reason: string }

/** The input to MediaPipe is never mirrored. Both preview layers mirror only in CSS.
 * Hand identity is declared by the user; model labels are retained as provenance only.
 */
export function useHandTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<TrackingAdapter | null>(null);
  const requestRef = useRef(0);
  const generation = useRef(0);
  const expectedLabel = useRef<string | null>(null);
  const latestRef = useRef<TrackedSample | null>(null);
  const [status, setStatus] = useState<TrackerStatus>('off');
  const [error, setError] = useState('');
  const [sample, setSample] = useState<TrackedSample | null>(null);
  const [fps, setFps] = useState(0);

  const release = useCallback(() => {
    generation.current += 1;
    cancelAnimationFrame(requestRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    latestRef.current = null;
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const stop = useCallback(() => { release(); setStatus('off'); setSample(null); }, [release]);
  const lockIdentity = useCallback((label: string | null) => { expectedLabel.current = label; }, []);

  const start = useCallback(async () => {
    release();
    const run = generation.current;
    setStatus('loading'); setError(''); setSample(null); setFps(0);
    let openingStream: MediaStream | null = null;
    let openingDetector: TrackingAdapter | null = null;
    try {
      if (!window.isSecureContext) throw new Error('Camera access needs localhost or an HTTPS connection. Open this app on localhost and try again.');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera access. Try a current version of Chrome, Edge, or Safari.');
      openingStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
      if (run !== generation.current) { openingStream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = openingStream;
      openingStream.getVideoTracks().forEach(track => { track.onended = () => { if (run === generation.current) { release(); setError('Camera connection ended. Reconnect your camera and retry.'); setStatus('error'); } }; });
      openingDetector = await createTrackingAdapter('hand');
      if (run !== generation.current) { openingDetector.close(); openingStream.getTracks().forEach(track => track.stop()); return; }
      detectorRef.current = openingDetector;
      const video = videoRef.current;
      if (!video) throw new Error('Camera preview is unavailable. Return to preparation and try again.');
      video.srcObject = openingStream;
      await video.play();
      if (run !== generation.current) return;
      setStatus('ready');
      let lastInference = 0; let lastVideoTime = -1; let count = 0; let fpsStart = performance.now();
      const detect = (now: number) => {
        if (run !== generation.current) return;
        const detector = detectorRef.current;
        if (!detector) return;
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastInference >= 55) {
          lastVideoTime = video.currentTime; lastInference = now;
          try {
            const result = detector.detect(video, now);
            const label = result.handedness[0]?.label;
            const landmarks = result.world[0] ? normalizeHand(result.world[0]) : [];
            const image = result.image[0];
            const multiple = result.image.length > 1;
            const identityChanged = Boolean(label && expectedLabel.current && label !== expectedLabel.current);
            const inFrame = Boolean(image?.length === 21 && image.every(point => point.x > .025 && point.x < .975 && point.y > .025 && point.y < .975));
            const tracking = !multiple && !identityChanged && inFrame && landmarks.length === 21 && pairAngles(landmarks).length === 4;
            const reason = multiple ? 'Keep only one hand in the camera view.' : identityChanged ? 'Hand identity changed — show the same calibrated hand.' : result.image.length && !inFrame ? 'Move your whole hand inside the camera view.' : tracking ? 'Hand detected' : 'Position your hand inside the guide.';
            const next: TrackedSample = { t: 0, observedAt: now, tracking, landmarks: tracking ? landmarks : [], worldLandmarks: tracking ? result.world[0].map(p => ({ x: p.x, y: p.y, z: p.z })) : undefined, imageLandmarks: tracking ? image.map(p => ({ x: p.x, y: p.y, z: p.z })) : undefined, confidence: tracking ? (result.handedness[0]?.score ?? 0) : 0, modelHandedness: label, reason };
            latestRef.current = next; setSample(next);
            const canvas = canvasRef.current;
            if (canvas) {
              if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (tracking && image) {
                  ctx.strokeStyle = '#80e4cf'; ctx.lineWidth = 3; ctx.shadowColor = '#80e4cf'; ctx.shadowBlur = 10;
                  HAND_CONNECTIONS.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(image[a].x * canvas.width, image[a].y * canvas.height); ctx.lineTo(image[b].x * canvas.width, image[b].y * canvas.height); ctx.stroke(); });
                  image.forEach((p, index) => { ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, index % 4 === 0 ? 5 : 3.5, 0, Math.PI * 2); ctx.fillStyle = '#eafff9'; ctx.fill(); });
                }
              }
            }
            count += 1;
            if (now - fpsStart > 1000) { setFps(Math.round(count * 1000 / (now - fpsStart))); count = 0; fpsStart = now; }
          } catch (failure) {
            release(); setError(`Hand tracking could not continue. ${failure instanceof Error ? failure.message : 'Please retry.'}`); setStatus('error'); return;
          }
        }
        if (latestRef.current?.tracking && now - latestRef.current.observedAt > 200) {
          const stale = { ...latestRef.current, tracking: false, landmarks: [], reason: 'Tracking lost — reposition your hand.' };
          latestRef.current = stale; setSample(stale);
          const canvas = canvasRef.current;
          canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        }
        requestRef.current = requestAnimationFrame(detect);
      };
      requestRef.current = requestAnimationFrame(detect);
    } catch (failure) {
      openingStream?.getTracks().forEach(track => track.stop());
      if (run !== generation.current) { openingDetector?.close(); return; }
      release();
      const name = failure instanceof DOMException ? failure.name : '';
      setError(name === 'NotAllowedError' ? 'Camera permission was blocked. Allow camera access in your browser’s address bar, then choose Retry camera.' : name === 'NotFoundError' ? 'No camera was found. Connect a webcam and choose Retry camera.' : name === 'NotReadableError' ? 'Your camera may be in use by another app. Close that app, then choose Retry camera.' : failure instanceof Error ? failure.message : 'Camera setup failed. Please retry.');
      setStatus('error');
    }
  }, [release]);

  useEffect(() => () => release(), [release]);
  return { videoRef, canvasRef, status, error, sample, latestRef, fps, start, stop, lockIdentity };
}
