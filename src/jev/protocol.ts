/**
 * The contract between the browser and Cube Atlas's own Jev endpoint.
 *
 * The browser never names a question, never sends criteria and never sees an
 * API key. It names a *task* and supplies a small, validated payload; the
 * server turns that into the questions defined in `questions.ts`. That keeps
 * two promises at once: the key stays server-side, and the endpoint cannot be
 * used as a general-purpose Jev proxy by anyone who finds it.
 */

/** The tasks the server is willing to ask Jev about. */
export type JevTask =
  | 'misconception' | 'next-step' | 'hint-level' | 'command' | 'stuck' | 'exercise';

/** Where a judgment came from. Shown in the UI; never guessed at. */
export type DecisionSource =
  /** Jev answered, and the answer cleared its threshold. */
  | 'jev'
  /** Jev answered but was too uncertain, so the deterministic rule decided. */
  | 'jev-uncertain'
  /** Jev was off, unconfigured or unreachable; the deterministic rule decided. */
  | 'deterministic';

export interface JevUsage {
  inputTokens: number;
  outputTokens: number;
}

/** What the server reports back about a Jev call, for the Learning Lab. */
export interface JevTrace {
  model: string;
  usage: JevUsage;
  /** Milliseconds spent in the call, measured on the server. */
  millis: number;
  /** Per-question raw answers, normalized for display. */
  answers: Record<string, TracedAnswer>;
}

export type TracedAnswer =
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> }
  | { type: 'noul'; noul: number };

/* ------------------------------------------------------------- requests --- */

export interface MisconceptionRequest {
  task: 'misconception';
  /** Which curated prompt the learner answered. */
  promptId: string;
  /** The learner's own words. Length-capped by the server. */
  answer: string;
  language: 'en' | 'fa';
}

export interface NextStepRequest {
  task: 'next-step';
  /** Deterministically computed learning signals. Numbers only. */
  signals: LearnerSignals;
  /** Activity ids the deterministic prerequisite filter has already approved. */
  candidates: string[];
  language: 'en' | 'fa';
}

/**
 * A learner describing, in their own words, what they are finding hard.
 *
 * The one thing here that no rule can do. "I keep losing track of which way
 * round R prime goes" and "I can get the first layer but then I'm guessing"
 * are different problems with different answers, and neither contains a
 * keyword worth matching on. The description goes to the model; the list of
 * things it may route to is computed first and is not negotiable.
 */
export interface StuckRequest {
  task: 'stuck';
  /** The learner's own words. Length-capped by the server. */
  description: string;
  /** Activity ids the deterministic prerequisite filter has already approved. */
  candidates: string[];
  signals: LearnerSignals;
  language: 'en' | 'fa';
}

/**
 * Asking for an exercise shaped to the learner rather than picked off a list.
 *
 * The division of labour is the whole design. Jev chooses the *shape* - how
 * hard, and what kind of difficulty - and the cube engine builds a position
 * to that shape and proves it: the distance is verified by the optimal
 * solver, and the focus is checked against the position's own analysis. A
 * model never asserts that a position is nine moves from solved. It says
 * "nine would suit them", and then the search either finds such a position or
 * the application says it could not.
 */
export interface ExerciseRequest {
  task: 'exercise';
  signals: LearnerSignals;
  /** Distances the application is willing to generate, smallest first. */
  bands: number[];
  language: 'en' | 'fa';
}

/** What a generated exercise can be about, as the engine can check it. */
export const EXERCISE_FOCUSES = ['orientation', 'placement', 'mixed'] as const;
export type ExerciseFocus = (typeof EXERCISE_FOCUSES)[number];

export interface ExerciseDecision {
  kind: 'exercise';
  /** One of the offered bands. Never a number the client did not offer. */
  distance: number;
  focus: ExerciseFocus;
  source: DecisionSource;
  confidence?: number;
  /** What the rules alone would have set, always computed. */
  deterministicDistance: number;
  /** The model's own wording for the difficulty level it chose. */
  bandLegend?: string;
  trace?: JevTrace;
}

export interface HintLevelRequest {
  task: 'hint-level';
  situation: HintSituation;
  language: 'en' | 'fa';
}

export interface CommandRequest {
  task: 'command';
  utterance: string;
  language: 'en' | 'fa';
}

export type JevRequest =
  | MisconceptionRequest | NextStepRequest | HintLevelRequest | CommandRequest
  | StuckRequest | ExerciseRequest;

/**
 * Everything the tutor knows about a learner, as numbers.
 *
 * Deliberately small and anonymous: counts and ratios, no move history, no
 * facelet strings, no text the learner wrote elsewhere, no identifiers.
 */
export interface LearnerSignals {
  lessonsDone: number;
  lessonsTotal: number;
  exercisesDone: number;
  /** Challenge attempts recorded, ever. */
  attempts: number;
  /** Attempts that matched the proven optimum. */
  optimalSolves: number;
  /** Mean moves wasted against the optimum, over recent attempts. */
  avgWasted: number;
  /** Moves wasted on the most recent attempt, or null if there is none. */
  lastWasted: number | null;
  /** Hints requested during the most recent attempt. */
  hintsLastAttempt: number;
  /** Ids of lessons whose check-yourself question was answered wrongly. */
  strugglingWith: string[];
}

export interface HintSituation {
  /** How many hints the learner has already taken on this position. */
  hintsTaken: number;
  /** Moves the learner has made on this position. */
  movesUsed: number;
  /** The proven optimal length for this position. */
  optimalLength: number;
  /** movesUsed - optimalLength, floored at zero. */
  wasted: number;
  /** Whole restarts of this position. */
  restarts: number;
  /** Seconds since the position was set up, capped by the client. */
  secondsOnTask: number;
}

/* ------------------------------------------------------------ responses --- */

export interface MisconceptionDecision {
  kind: 'misconception';
  /** The diagnosis the application will act on. */
  label: MisconceptionLabel;
  source: DecisionSource;
  /** 0..1 for a Jev answer; absent for a deterministic decision. */
  confidence?: number;
  /** Probability that the answer addressed the question at all. */
  onTopic?: number;
  trace?: JevTrace;
}

export const MISCONCEPTION_LABELS = [
  'correct',
  'inverse-confusion',
  'sticker-vs-state',
  'notation-direction',
  'any-vs-optimal',
  'gods-number-human',
  'insufficient',
  'unrelated',
] as const;
export type MisconceptionLabel = (typeof MISCONCEPTION_LABELS)[number];

/**
 * A plan rather than a single pick.
 *
 * Three independent judgments are asked about the same learner record in one
 * request - what to do now, whether reading has stopped paying and practice
 * would pay more, and how much support the work should carry. They cannot see
 * one another's answers, which is what makes the second and third useful
 * rather than restatements of the first, and code composes them into two
 * ordered steps. One round trip, one latency, three things worth knowing.
 */
export interface NextStepDecision {
  kind: 'next-step';
  /** One of the candidate ids the client supplied. Never anything else. */
  activity: string;
  source: DecisionSource;
  confidence?: number;
  /** What the deterministic rule would have chosen, always computed. */
  deterministicChoice: string;
  /** The step after this one, chosen in code from the judgments below. */
  thenActivity: string | null;
  /** Probability that practice would now help more than more reading. */
  readyToPractise?: number;
  /** 0..3: how much scaffolding the next piece of work should carry. */
  support?: number;
  /** The model's own words for the support level it picked. */
  supportLegend?: string;
  trace?: JevTrace;
}

/**
 * Where a described difficulty should send the learner.
 *
 * `activity` is null when the model was not confident, the description was
 * not about learning the cube, or it was too vague to act on - three different
 * situations the interface reports differently, because "say a bit more" and
 * "that isn't something this application covers" are different answers.
 */
export interface StuckDecision {
  kind: 'stuck';
  activity: string | null;
  source: DecisionSource;
  confidence?: number;
  /** Probability the description is about learning this subject at all. */
  onTopic?: number;
  /** 0..2: how specific the description was. */
  specificity?: number;
  /** True when the application should ask for more detail rather than route. */
  needsDetail: boolean;
  /** Always computed: where the rules alone would have sent them. */
  deterministicChoice: string;
  trace?: JevTrace;
}

export interface HintLevelDecision {
  kind: 'hint-level';
  /** 0..3, clamped so it never goes backwards. */
  level: number;
  source: DecisionSource;
  confidence?: number;
  deterministicLevel: number;
  trace?: JevTrace;
}

export const COMMAND_ACTIONS = [
  'scramble',
  'reset',
  'solve',
  'play',
  'step-forward',
  'step-back',
  'show-sticker-map',
  'show-state-space',
  'open-notation-lesson',
  'open-training',
  'explain-inverse',
  'none',
] as const;
export type CommandAction = (typeof COMMAND_ACTIONS)[number];

/** Actions that change the cube, and so need confirmation when uncertain. */
export const MUTATING_ACTIONS: readonly CommandAction[] = [
  'scramble', 'reset', 'solve', 'play', 'step-forward', 'step-back',
];

export interface CommandDecision {
  kind: 'command';
  action: CommandAction;
  source: DecisionSource;
  confidence?: number;
  /** Probability the request was unambiguous, from Jev. */
  unambiguous?: number;
  /** True when the app should ask before acting. */
  needsConfirmation: boolean;
  trace?: JevTrace;
}

export type JevDecision =
  | MisconceptionDecision | NextStepDecision | HintLevelDecision | CommandDecision
  | StuckDecision | ExerciseDecision;

/* --------------------------------------------------------------- errors --- */

/** Every way a request can fail, as a stable code the UI can translate. */
export type JevErrorCode =
  | 'not-configured'
  | 'disabled'
  | 'auth'
  | 'rate-limit'
  | 'timeout'
  | 'network'
  | 'server'
  | 'bad-request'
  | 'aborted'
  | 'unexpected-response';

export interface JevErrorBody {
  error: JevErrorCode;
  /** Safe, non-secret detail. Never contains a key or a raw upstream body. */
  detail?: string;
  /** Seconds to wait, when the upstream said so. */
  retryAfter?: number;
}

export interface JevStatusBody {
  /** True when the server has a key of its own in the environment. */
  serverKey: boolean;
  /** Model the server would use. */
  model: string;
  /** Present only after an explicit connection test. */
  models?: string[];
}
