import type { VideoMetadata } from './contracts';
export interface CapturedVideo { video: Blob; originMs: number; startedAt: string; metadata: Omit<VideoMetadata, 'sha256'> }

/** Uses the existing camera stream; never opens a second camera or records microphone audio. */
export class SessionVideoCapture {
  private recorder: MediaRecorder | null = null;
  private stopped: Promise<CapturedVideo> | null = null;
  start(preview: HTMLVideoElement, originMs = performance.now(), startedAt = new Date().toISOString()) {
    if (this.recorder) throw Error('A video recording is already active.');
    const source = preview.srcObject;
    if (!(source instanceof MediaStream) || !source.getVideoTracks().some(track => track.readyState === 'live')) throw Error('Connect the camera before recording.');
    if (!globalThis.MediaRecorder) throw Error('This browser cannot record video. Use Chrome, Edge, or Safari.');
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    const stream = new MediaStream(source.getVideoTracks());
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    this.recorder = recorder;
    const chunks: BlobPart[] = [];
    const startCallMs = performance.now();
    let endMs = startCallMs;
    this.stopped = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(Error('Video recording failed. Landmark data is still available locally.'));
      recorder.onstop = () => {
        if (endMs === startCallMs) endMs = performance.now();
        const video = new Blob(chunks, { type: recorder.mimeType || mime || 'video/webm' });
        if (!video.size) { reject(Error('The camera produced an empty video.')); return; }
        resolve({ video, originMs, startedAt, metadata: { mimeType: video.type, sizeBytes: video.size, width: preview.videoWidth, height: preview.videoHeight, durationMs: endMs - startCallMs, landmarkOffsetMs: originMs - startCallMs, mirrored: false } });
      };
    });
    // Attach a handler immediately, including before finish() is called after a device failure.
    void this.stopped.catch(() => {});
    recorder.start(250);
    return { originMs, startedAt, stop: () => { endMs = performance.now(); if (recorder.state !== 'inactive') recorder.stop(); } };
  }
  async finish(): Promise<CapturedVideo> {
    if (!this.stopped) throw Error('No video recording was started.');
    const result = await this.stopped;
    this.recorder = null; this.stopped = null;
    return result;
  }
}
export async function videoHash(video: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await video.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
}
