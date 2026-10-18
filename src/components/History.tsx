import { useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../lib/store';
import { getExercise } from '../features/body-exercises/exerciseRegistry';
import { createDemoSession } from '../lib/demo';
import { exportSession } from '../lib/export';
export default function History({ compact = false }: { compact?: boolean }) {
  const Heading = compact ? 'h2' : 'h1';
  const { sessions, navigate, openSession, remove } = useApp();
  const [filter, setFilter] = useState<'all' | 'camera' | 'demo'>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const visible = sessions.filter(s => filter === 'all' || s.source === filter);
  return <section className={`history-page page-enter ${compact ? 'embedded-history' : ''}`}>
    <div className="page-heading"><Heading>Saved sessions</Heading><button className="btn btn-primary" onClick={() => navigate('exercise')}><Plus size={16}/>New session</button></div>
    <div className="history-toolbar"><div className="segmented">{(['all', 'camera', 'demo'] as const).map(value => <button key={value} onClick={() => setFilter(value)} className={filter === value ? 'selected' : ''}>{value === 'all' ? 'All sessions' : value === 'camera' ? 'My recordings' : 'Samples'}</button>)}</div></div>
    {visible.length ? <div className="session-list">{visible.map(session => <div className="session-row session-row-simple panel" key={session.id}>
      <button className="session-name" onClick={() => openSession(session)}><h3>{getExercise(session.exerciseId).title}</h3><p>{new Date(session.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {session.hand} {session.trackingMode === 'pose' ? 'side' : 'hand'}</p></button>
      <span className={`badge ${session.source === 'camera' ? 'personal-badge' : ''}`}>{session.source === 'demo' ? 'SAMPLE' : 'PERSONAL'}</span>
      <button className="icon-button" onClick={() => exportSession(session)} aria-label="Export session"><ArrowDownToLine size={16}/></button>
      {deleteId === session.id ? <div className="delete-confirm"><button onClick={() => { void remove(session.id); setDeleteId(null); }}>Delete?</button><button className="icon-button" onClick={() => setDeleteId(null)} aria-label="Cancel deletion"><X size={14}/></button></div> : <button className="icon-button" onClick={() => setDeleteId(session.id)} aria-label="Delete session"><Trash2 size={16}/></button>}
    </div>)}</div> : <div className="history-empty panel"><span className="empty-orb"><Activity size={32}/></span><h3>{filter === 'demo' ? 'No saved samples' : 'No recordings yet'}</h3><button className="btn btn-primary" onClick={() => filter === 'demo' ? openSession(createDemoSession()) : navigate('exercise')}>{filter === 'demo' ? 'Explore sample' : 'Practice'}<ArrowRight size={16}/></button></div>}
  </section>;
}
