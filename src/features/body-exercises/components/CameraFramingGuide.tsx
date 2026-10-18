export default function CameraFramingGuide({ready}: {ready: boolean}) {
  return <div className={`body-framing ${ready ? 'ready' : ''}`} aria-hidden="true"><div className="body-frame-corners"/></div>;
}
