import { getPhase, pairAngles } from './geometry';
import type { Vec3 } from './types';

// Add an exercise with its reference checks and phase model before listing it.
export const exercises = [{
  id: 'finger-spread-close',
  name: 'Finger Spread & Close',
  description: 'Gently open, hold, and close your fingers at your own pace.',
  repetitions: 3,
  defaultCycleDuration: 8,
  neutralCue: 'Support your arm. Show your whole hand with your palm facing the camera and your fingers gently together. Say ready when comfortable.',
  targetCue: 'Slowly spread your fingers to a comfortable or prescribed range. Keep your palm facing the camera. Say ready to capture that position. Never force the movement.',
  practiceCue: 'Follow three slow repetitions: fingers together, gently spread, hold comfortably, and slowly close. Say begin when you are ready.',
  phaseAt: getPhase,
  phaseCue(name: string) {
    return ({ Together: 'Fingers together', Spread: 'Gently spread', Hold: 'Hold comfortably', Close: 'Slowly close' } as Record<string, string>)[name] ?? name;
  },
  hasDistinctTarget(neutral: Vec3[], target: Vec3[]) {
    const baseline = pairAngles(neutral);
    return pairAngles(target).slice(1).some((angle, i) => angle - baseline[i + 1] >= 2);
  },
}];
export type ExerciseDefinition = typeof exercises[number];
export const defaultExercise = exercises[0];
