/**
 * Deterministic learning logic, and the rules that combine Jev's answers with it.
 *
 * Everything in this file runs with or without an API key. The Jev-aware
 * functions take an already-parsed answer and decide whether to use it; the
 * rule functions beside them are what happens when there is no answer to use.
 * Keeping both in one module means the fallback is never an afterthought, and
 * the Learning Lab can show them side by side because they are the same code
 * the application runs.
 */

import { ACTIVITIES, MISCONCEPTION_PROMPTS, THRESHOLDS } from './questions';
import {
  MUTATING_ACTIONS, type CommandAction, type HintSituation, type LearnerSignals,
  type MisconceptionLabel,
} from './protocol';

/* ----------------------------------------------------- 1. misconception --- */

/**
 * Turn Jev's two answers into the diagnosis the application acts on.
 *
 * Three ways to end up uncertain, and all of them are honest outcomes rather
 * than errors: the label is not one this prompt can distinguish, the model
 * thinks the answer was not about the question, or the choice was not
 * confident enough to act on.
 */
export function resolveMisconception(
  promptId: string,
  label: string,
  confidence: number,
  onTopic: number,
): { label: MisconceptionLabel; uncertain: boolean } {
  const prompt = MISCONCEPTION_PROMPTS.find((p) => p.id === promptId);
  const allowed = prompt?.plausible ?? [];
  if (!allowed.includes(label as MisconceptionLabel)) {
    return { label: 'insufficient', uncertain: true };
  }
  if (onTopic < THRESHOLDS.misconceptionOnTopic) {
    return { label: 'unrelated', uncertain: false };
  }
  if (confidence < THRESHOLDS.misconceptionConfidence) {
    return { label: label as MisconceptionLabel, uncertain: true };
  }
  return { label: label as MisconceptionLabel, uncertain: false };
}

/**
 * What happens to a written answer with no Jev available.
 *
 * Nothing is classified, because nothing here can classify prose honestly. The
 * application shows the worked answer and the points a good response would
 * make, and the learner marks their own. That is a real exercise - self-
 * explanation against a model answer is a well-worn study technique - and it
 * is not dressed up as a diagnosis.
 */
export const SELF_CHECK: { readonly label: MisconceptionLabel; readonly selfAssessed: true } = {
  label: 'insufficient',
  selfAssessed: true,
};

/* ------------------------------------------------------ 2. next activity --- */

/**
 * Which activities the learner is ready for.
 *
 * Prerequisites are hard: a lesson that builds on another is not offered until
 * that other one is done. This runs before Jev sees anything, so an unready
 * activity is never even a candidate.
 */
export function eligibleActivities(signals: LearnerSignals, lessonsDone: readonly string[]): string[] {
  const done = new Set(lessonsDone);
  const out: string[] = [];
  for (const activity of ACTIVITIES) {
    if (!activity.requires.every((id) => done.has(id))) continue;
    // A lesson already read is not a next step unless it is one the learner
    // demonstrably struggled with.
    const lessonId = activity.id.startsWith('lesson-') ? activity.id.slice('lesson-'.length) : null;
    if (lessonId && done.has(lessonId) && !signals.strugglingWith.includes(lessonId)) continue;
    out.push(activity.id);
  }
  // Practice is always available to someone who has covered notation.
  if (out.length === 0) out.push(done.has('notation') ? 'practice-efficiency' : 'lesson-notation');
  return out;
}

/**
 * The rule-based recommendation.
 *
 * Deliberately simple and readable, because it is what most learners get: it
 * runs whenever Jev is off, unreachable or unsure, and the Learning Lab shows
 * it beside the model's pick so the difference is visible.
 */
export function ruleBasedNextStep(
  signals: LearnerSignals, candidates: readonly string[],
): string {
  const has = (id: string): boolean => candidates.includes(id);

  // A wrong comprehension answer outranks everything: go back to that lesson.
  for (const lesson of signals.strugglingWith) {
    if (has(`lesson-${lesson}`)) return `lesson-${lesson}`;
  }
  // Leaning on hints means the concept is missing, not the practice.
  if (signals.hintsLastAttempt >= 2 && has('practice-inverse')) return 'practice-inverse';
  // Solving but wasting moves is an efficiency problem.
  if (signals.attempts > 0 && signals.avgWasted >= 3 && has('practice-efficiency')) {
    return 'practice-efficiency';
  }
  // Otherwise work forward through the course in order.
  for (const activity of ACTIVITIES) {
    if (activity.id.startsWith('lesson-') && has(activity.id)) return activity.id;
  }
  return candidates[0] ?? 'lesson-notation';
}

/** Accept Jev's pick only if it is a real candidate and confident enough. */
export function resolveNextStep(
  choice: string, confidence: number, candidates: readonly string[], fallback: string,
): { activity: string; used: boolean } {
  if (!candidates.includes(choice)) return { activity: fallback, used: false };
  if (confidence < THRESHOLDS.nextStepConfidence) return { activity: fallback, used: false };
  return { activity: choice, used: true };
}

/**
 * The second step of the plan, chosen in code from two independent judgments.
 *
 * This is where the fan-out earns its keep. The model is not asked "what
 * should the plan be" - a question with no single right answer and no way to
 * check it - but three narrow questions whose answers code can combine under
 * a rule anybody can read: if practice would now pay more, follow the first
 * step with practice; otherwise follow it with reading, and let the support
 * level decide whether that reading comes with a demonstration attached.
 */
export function planSecondStep(
  first: string,
  candidates: readonly string[],
  readyToPractise: number | null,
  support: number | null,
): string | null {
  const rest = candidates.filter((id) => id !== first);
  if (rest.length === 0) return null;
  const practice = rest.filter((id) => id.startsWith('practice-') || id.startsWith('explore-'));
  const reading = rest.filter((id) => id.startsWith('lesson-'));

  // No judgment available: the next thing in course order, which is what the
  // rules alone would say.
  if (readyToPractise === null) return reading[0] ?? rest[0];

  if (readyToPractise >= THRESHOLDS.readyToPractise) return practice[0] ?? rest[0];
  // Reading, and a demonstration to watch if they need the scaffolding.
  if (support !== null && support >= 2) {
    const demo = rest.find((id) => id.startsWith('explore-'));
    if (demo) return demo;
  }
  return reading[0] ?? rest[0];
}

/* -------------------------------------------- 2b. a described difficulty --- */

/**
 * Where to send someone who has said what they are stuck on.
 *
 * Four ways this ends, and they are genuinely different: a confident route, a
 * request for more detail, an admission that the description was not about
 * this subject, and an admission that nothing in the course addresses it. The
 * last two are answers, not failures, and saying "that is not something this
 * covers" is more useful than routing to the nearest lesson and hoping.
 */
export function resolveStuck(
  choice: string,
  confidence: number,
  onTopic: number,
  specificity: number,
  candidates: readonly string[],
): { activity: string | null; needsDetail: boolean; used: boolean } {
  if (onTopic < THRESHOLDS.stuckOnTopic) {
    return { activity: null, needsDetail: false, used: true };
  }
  if (specificity < THRESHOLDS.stuckSpecificity) {
    return { activity: null, needsDetail: true, used: true };
  }
  if (choice === 'none' || !candidates.includes(choice)) {
    return { activity: null, needsDetail: false, used: true };
  }
  if (confidence < THRESHOLDS.stuckConfidence) {
    return { activity: null, needsDetail: true, used: false };
  }
  return { activity: choice, needsDetail: false, used: true };
}

/* --------------------------------------------------------- 3. hint level --- */

/** The ladder has four rungs; this keeps every caller agreed on that. */
export const MAX_HINT_LEVEL = 3;

/**
 * How much help to give, by rule.
 *
 * Escalates on evidence of being stuck, and never gives less than the learner
 * has already been given.
 */
export function ruleBasedHintLevel(s: HintSituation): number {
  let level = s.hintsTaken;
  if (s.wasted >= 4) level = Math.max(level, 2);
  if (s.restarts >= 2) level = Math.max(level, 2);
  if (s.movesUsed >= s.optimalLength * 2 && s.optimalLength > 0) level = Math.max(level, 2);
  if (s.hintsTaken >= 2) level = MAX_HINT_LEVEL;
  return Math.min(MAX_HINT_LEVEL, level);
}

/**
 * Combine Jev's rung with the floor the learner has already earned.
 *
 * Two guarantees, both deliberate. The ladder never goes backwards, so asking
 * again can only help more. And the model can only ever raise the level, not
 * lower it: a learner who has taken two hints gets the third if they ask,
 * whatever a probability says. An AI judgment must not stand between someone
 * and the answer they asked for.
 */
export function resolveHintLevel(
  score: number, confidence: number, situation: HintSituation,
): { level: number; used: boolean } {
  const floor = ruleBasedHintLevel(situation);
  if (confidence < THRESHOLDS.hintConfidence) return { level: floor, used: false };
  const rounded = Math.round(score);
  const level = Math.min(MAX_HINT_LEVEL, Math.max(floor, rounded));
  return { level, used: level !== floor || rounded >= floor };
}

/* ------------------------------------------------------ 4. command intent --- */

/**
 * Keyword routing, in both languages.
 *
 * This is a genuinely adequate deterministic implementation for the phrasings
 * people actually type, which is why the command bar works perfectly well
 * without a key. Jev earns its place on the sentences this misses - word
 * order, negation, indirect phrasing - not on the easy ones.
 */
const KEYWORDS: { action: CommandAction; en: RegExp; fa: RegExp }[] = [
  { action: 'scramble', en: /\b(scramble|mix|randomi[sz]e|shuffle)\b/i, fa: /(به.?هم.?بریز|بهم.?بریز|مخلوط|تصادفی)/ },
  { action: 'reset', en: /\b(reset|solved state|start over|clear the cube)\b/i, fa: /(بازنشانی|از.?نو|حل.?شده)/ },
  { action: 'solve', en: /\b(solve|solution|fix the cube)\b/i, fa: /(حل کن|راه.?حل|حلش)/ },
  { action: 'play', en: /\b(play|watch|animate|run it)\b/i, fa: /(پخش|تماشا|اجرا)/ },
  { action: 'step-forward', en: /\b(next move|step forward|advance)\b/i, fa: /(حرکت بعدی|جلو)/ },
  { action: 'step-back', en: /\b(previous move|step back|go back|undo)\b/i, fa: /(حرکت قبلی|عقب|واگرد)/ },
  { action: 'show-sticker-map', en: /\b(sticker map|the map|54 (dots|stickers))\b/i, fa: /(نقشه برچسب|نقشه)/ },
  { action: 'show-state-space', en: /\b(state.?space|configuration graph|the graph)\b/i, fa: /(فضای حالت|گراف)/ },
  { action: 'open-notation-lesson', en: /\b(notation|what does (r|u|f|d|l|b)['’]? mean)\b/i, fa: /(نماد|نماد.?گذاری)/ },
  { action: 'open-training', en: /\b(training|challenge|practi[sc]e)\b/i, fa: /(تمرین|چالش)/ },
  { action: 'explain-inverse', en: /\b(inverse|cancel|undo each other|opposite move)\b/i, fa: /(وارون|خنثی|همدیگر را)/ },
];

export function ruleBasedCommand(utterance: string, language: 'en' | 'fa'): CommandAction {
  const text = utterance.trim();
  if (!text) return 'none';
  const matches: CommandAction[] = [];
  for (const entry of KEYWORDS) {
    if (entry.en.test(text) || (language === 'fa' && entry.fa.test(text))) matches.push(entry.action);
  }
  // Exactly one match is a confident route; several is ambiguous, so say so.
  return matches.length === 1 ? matches[0] : 'none';
}

/**
 * Decide whether to act on a routed command.
 *
 * Anything that changes the cube has to clear both bars - a confident choice
 * and a high probability of being unambiguous - or the application asks first
 * rather than turning a face nobody asked it to turn.
 */
export function resolveCommand(
  action: CommandAction, confidence: number, unambiguous: number,
): { action: CommandAction; needsConfirmation: boolean } {
  if (action === 'none') return { action, needsConfirmation: false };
  const mutates = MUTATING_ACTIONS.includes(action);
  if (!mutates) return { action, needsConfirmation: false };
  const sure = confidence >= THRESHOLDS.commandConfidence
    && unambiguous >= THRESHOLDS.commandUnambiguous;
  return { action, needsConfirmation: !sure };
}
