import type { ExerciseConfig } from '../exerciseRegistry';
/** A setup illustration only. Recorded comparison always uses original video pixels. */
export default function BodyExerciseGuide({exercise}: {exercise: ExerciseConfig}) {
  const knee = exercise.bodyRegion === 'leg';
  return <details className="body-guide"><summary>Exercise & camera guide</summary><div className="body-guide-content"><svg viewBox="0 0 240 160" role="img" aria-label={`Seated ${knee ? 'side view, with the whole leg visible' : 'supported starting position'}`}>
    <rect x="36" y="93" width="72" height="9" rx="4" fill="#d9d9c6"/><path d="M42 98v49m60-49v49M36 49v47" stroke="#9baf95" strokeWidth="6" fill="none"/>
    <circle cx="80" cy="28" r="14" fill="#d9bfb2"/><path d="M78 47v41l48 6 4 47 18 1" stroke="#527969" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d={knee ? 'M126 94l62-9 18-2' : 'M80 54l25 27 26-29'} stroke="#c5a9cd" strokeWidth="10" strokeLinecap="round" strokeDasharray="5 8" fill="none"/>
    <path d="M79 53l14 25 21 8" stroke="#527969" strokeWidth="9" strokeLinecap="round" fill="none"/>
    <rect x="191" y="26" width="30" height="21" rx="5" fill="#d4dfcb"/><circle cx="205" cy="36" r="5" fill="#527969"/><path d="M205 47v29" stroke="#527969" strokeWidth="3"/>
  </svg><div><p>{exercise.setup}</p><p>{exercise.movement}</p><a href={exercise.source} target="_blank" rel="noreferrer">Exercise reference</a></div></div></details>;
}
