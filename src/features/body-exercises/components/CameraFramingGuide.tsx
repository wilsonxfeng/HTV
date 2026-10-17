export default function CameraFramingGuide({ready, message}: {ready: boolean; message: string}) {
  return <div className={`body-framing ${ready ? 'ready' : ''}`}><div className="body-frame-corners"/><span role="status">{message}</span></div>;
}
