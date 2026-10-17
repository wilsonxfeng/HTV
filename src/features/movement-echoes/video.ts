export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException('Preparation cancelled.', 'AbortError');
}
export function videoEvent(
  video: HTMLVideoElement,
  event: string,
  signal?: AbortSignal,
  start?: () => void,
): Promise<void> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener('error', fail);
      signal?.removeEventListener('abort', abort);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(
        Error(
          'This recording could not be decoded. Try an H.264 MP4 or a supported WebM.',
        ),
      );
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Preparation cancelled.', 'AbortError'));
    };
    const timer = setTimeout(fail, 15000);
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', fail, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    try {
      start?.();
    } catch {
      fail();
    }
  });
}
export async function loadVideo(blob: Blob, signal?: AbortSignal) {
  const url = URL.createObjectURL(blob),
    video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const release = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  };
  try {
    await videoEvent(video, 'loadedmetadata', signal, () => {
      video.src = url;
    });
    // Some MediaRecorder WebMs have unknown duration until the decoder seeks to their end.
    if (!Number.isFinite(video.duration))
      await videoEvent(video, 'seeked', signal, () => {
        video.currentTime = 1e8;
      });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration < 0.6 || duration > 90)
      throw Error('Use a recording between 0.6 and 90 seconds.');
    return { video, url, release };
  } catch (e) {
    release();
    throw e;
  }
}
export async function seekVideo(
  video: HTMLVideoElement,
  time: number,
  signal?: AbortSignal,
) {
  checkAbort(signal);
  const t = Math.max(0, Math.min(video.duration - 0.001, time));
  if (video.readyState >= 2 && Math.abs(video.currentTime - t) < 0.0001) return;
  await videoEvent(video, 'seeked', signal, () => {
    video.currentTime = t;
  });
  if (video.readyState < 2) await videoEvent(video, 'loadeddata', signal);
}
export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else
          canvas.toBlob(
            (png) =>
              png ? resolve(png) : reject(Error('Image encoding failed.')),
            'image/png',
          );
      },
      'image/webp',
      0.9,
    ),
  );
}
