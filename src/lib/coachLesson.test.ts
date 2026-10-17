import { describe, expect, it } from 'vitest';
import { parseLessonReply } from './coachLesson';
import { defaultExercise, exercises } from './exercises';
import { createDemoSession } from './demo';

describe('voice lesson replies', () => {
  it.each(['Right hand.', 'My right hand', 'I’m using my right hand only'])('confirms a physical hand from %s', reply => {
    expect(parseLessonReply(reply)).toEqual({ type: 'hand', hand: 'Right' });
  });
  it('accepts explicit progress and pace replies', () => {
    expect(parseLessonReply('I’m ready!')).toEqual({ type: 'ready' });
    expect(parseLessonReply('Begin practice')).toEqual({ type: 'ready' });
    expect(parseLessonReply('Ten seconds per repetition')).toEqual({ type: 'pace', seconds: 10 });
    expect(parseLessonReply('use a reference video')).toEqual({ type: 'reference' });
    expect(parseLessonReply('target angles 10 12 8')).toEqual({ type: 'angles', values: [10, 12, 8] });
  });
  it.each(['not ready', 'I do not want to begin', 'don’t use my left hand', 'left or right hand', 'the coach said ready', 'yes', 'start another exercise'])('does not treat ambiguous or negated speech as consent: %s', reply => {
    expect(parseLessonReply(reply)).toBeNull();
  });
  it.each(['Stop please', 'Pause', 'My hand hurts', 'This is uncomfortable'])('prioritizes stopping: %s', reply => {
    expect(parseLessonReply(reply)).toEqual({ type: 'stop' });
  });
});

describe('exercise menu definitions', () => {
  it('lists only supported exercises with unique identifiers', () => {
    expect(exercises.map(item => item.id)).toEqual(['finger-spread-close']);
    expect(new Set(exercises.map(item => item.id)).size).toBe(exercises.length);
  });
  it('owns the phase model and reference validation for the selected exercise', () => {
    const { calibration } = createDemoSession();
    expect(defaultExercise.hasDistinctTarget(calibration.neutral, calibration.neutral)).toBe(false);
    expect(defaultExercise.hasDistinctTarget(calibration.neutral, calibration.target)).toBe(true);
    expect(defaultExercise.phaseAt(9, 8).repetition).toBe(2);
    expect(defaultExercise.repetitions).toBe(3);
  });
});
