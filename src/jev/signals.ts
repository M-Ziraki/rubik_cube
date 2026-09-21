/**
 * Turning the learner's record into the handful of numbers the tutor needs.
 *
 * This is the privacy boundary as much as the modelling one. What leaves the
 * browser is counts and averages: no move history, no facelet string, no
 * timings beyond a duration, nothing that identifies anybody. A tutor that
 * needs to know how often you wasted moves does not need to know which moves.
 */

import type { AppState } from '../state/store';
import { LESSONS } from '../lessons/registry';
import type { LearnerSignals } from './protocol';

/** Lessons whose comprehension question was answered wrongly and not since retried. */
function strugglingWith(state: AppState): string[] {
  // An exercise id is `<lesson>-q1`; a lesson read but with its question
  // unanswered is the signal that something did not land.
  const done = new Set(state.progress.exercisesDone);
  const out: string[] = [];
  for (const lesson of LESSONS) {
    if (!state.progress.lessonsDone.includes(lesson.id)) continue;
    const hasQuestion = ['notation', 'pieces', 'laws', 'sticker-map', 'graph', 'distance',
      'search', 'heuristics', 'groups', 'ladder', 'gods-number', 'human-vs-machine']
      .includes(lesson.id);
    if (!hasQuestion) continue;
    const answered = [...done].some((id) => id.startsWith(`${lesson.id}-`));
    if (!answered) out.push(lesson.id);
  }
  return out.slice(0, 6);
}

export function learnerSignals(state: AppState, hintsLastAttempt = 0): LearnerSignals {
  const runs = state.progress.challengeRuns;
  const recent = runs.slice(-10);
  const wasted = recent.map((r) => Math.max(0, r.used - r.optimal));
  const avgWasted = wasted.length
    ? Number((wasted.reduce((a, b) => a + b, 0) / wasted.length).toFixed(2))
    : 0;
  return {
    lessonsDone: state.progress.lessonsDone.length,
    lessonsTotal: LESSONS.length,
    exercisesDone: state.progress.exercisesDone.length,
    attempts: runs.length,
    optimalSolves: runs.filter((r) => r.used === r.optimal).length,
    avgWasted,
    lastWasted: recent.length ? wasted[wasted.length - 1] : null,
    hintsLastAttempt,
    strugglingWith: strugglingWith(state),
  };
}
