/**
 * Every question Cube Atlas asks Jev, and every threshold it applies.
 *
 * This file is the whole surface. Nothing else builds a question, invents a
 * label or picks a cutoff, so reviewing the integration means reviewing this
 * one module. It is deliberately free of imports from the app: the server
 * loads it, the browser types against it, and the evaluation harness runs
 * against it, so all three agree by construction.
 *
 * Two rules shape every question here.
 *
 * 1. Jev judges; it never computes. No question asks how many moves a solution
 *    takes, whether a position is reachable, or whether a route is shortest.
 *    Those are facts the cube engine already knows exactly, and a probability
 *    is a worse answer than a proof.
 * 2. Every question has somewhere to go when it does not know. `insufficient`
 *    and `unrelated` are real outcomes, not failures, and every threshold has
 *    a deterministic fallback behind it.
 */

import type {
  CommandAction, HintSituation, LearnerSignals, MisconceptionLabel,
} from './protocol';

/* ------------------------------------------------------------ thresholds --- */

/**
 * Confidence cutoffs, gathered here so they can be argued about in one place.
 *
 * These are starting points calibrated against `evals/dataset.ts`, not
 * universal constants. `npm run jev:eval` reports accuracy and the
 * abstention rate at the current settings; move them when the data says so,
 * not because a number looks tidy.
 */
export const THRESHOLDS = {
  /** Below this, a diagnosis is reported as uncertain and the learner self-checks. */
  misconceptionConfidence: 0.45,
  /** Below this probability the answer is treated as not addressing the question. */
  misconceptionOnTopic: 0.35,
  /** Below this, the deterministic recommendation is used instead. */
  nextStepConfidence: 0.40,
  /** Above this, the plan's second step is practice rather than reading. */
  readyToPractise: 0.55,
  /** Below this, a described difficulty is not routed at all. */
  stuckConfidence: 0.45,
  /** Below this probability the description is treated as off-topic. */
  stuckOnTopic: 0.40,
  /** Below this score the learner is asked to say more instead. */
  stuckSpecificity: 0.75,
  /** Below this, the exercise is built to the rule's difficulty instead. */
  exerciseConfidence: 0.40,
  /** Below this, the hint ladder escalates by its own rule. */
  hintConfidence: 0.35,
  /** A command that changes the cube needs at least this much confidence. */
  commandConfidence: 0.70,
  /** ...and at least this probability of being unambiguous. */
  commandUnambiguous: 0.60,
} as const;

/* ------------------------------------------------- 1. misconception check --- */

/**
 * The curated prompts a learner can answer in their own words.
 *
 * Each names the misconceptions it is actually able to distinguish. A
 * diagnosis outside that set is treated as `insufficient`, because a label the
 * prompt cannot elicit is a label we have no evidence for.
 */
export interface MisconceptionPrompt {
  id: string;
  /** Misconceptions this prompt can genuinely tell apart. */
  plausible: readonly MisconceptionLabel[];
}

export const MISCONCEPTION_PROMPTS: readonly MisconceptionPrompt[] = [
  {
    id: 'inverse',
    plausible: ['correct', 'inverse-confusion', 'notation-direction', 'insufficient', 'unrelated'],
  },
  {
    id: 'map-vs-graph',
    plausible: ['correct', 'sticker-vs-state', 'insufficient', 'unrelated'],
  },
  {
    id: 'gods-number',
    plausible: ['correct', 'gods-number-human', 'any-vs-optimal', 'insufficient', 'unrelated'],
  },
  {
    id: 'any-vs-shortest',
    plausible: ['correct', 'any-vs-optimal', 'insufficient', 'unrelated'],
  },
];

/** The English text of each prompt, for the model. The UI uses i18n keys. */
const PROMPT_TEXT: Record<string, string> = {
  inverse: "Why does performing R and then R' leave the cube exactly as it was?",
  'map-vs-graph':
    'What is the difference between the sticker map (54 dots) and the state-space graph '
    + '(43,252,003,274,489,856,000 vertices)?',
  'gods-number':
    "God's number for the Rubik's Cube is 20 in the face-turn metric. What does that actually mean?",
  'any-vs-shortest':
    'A solver returns a solution of 18 moves. What can you conclude about the shortest solution?',
};

/**
 * What each label means, written for the model rather than for the learner.
 *
 * These are descriptions of *the learner's answer*, not of the cube. Saying
 * "the response claims ..." keeps the judgment about the text in front of it,
 * which is the only thing Jev can see.
 */
const MISCONCEPTION_CRITERIA: Record<MisconceptionLabel, string> = {
  correct:
    'The response shows correct understanding of the concept being asked about. It may be '
    + 'informal, brief or imperfectly worded, and it need not use technical vocabulary, but it '
    + 'contains no false claim about the cube.',
  'inverse-confusion':
    "The response misunderstands what an inverse move does. For example it claims R' is the same "
    + "move as R, that R followed by R' is a 180-degree turn, that the pair changes the cube in "
    + 'some way, or that two moves cancel only because they are both quarter turns.',
  'sticker-vs-state':
    'The response confuses a single sticker, or the 54-dot sticker map, with a whole cube '
    + 'configuration. For example it claims a dot on the map is one of the 43 quintillion '
    + 'positions, that the map has one vertex per configuration, or that the two pictures are the '
    + 'same object at different zoom levels.',
  'notation-direction':
    'The response misunderstands which way a face turn goes: it reverses clockwise and '
    + "anticlockwise, claims the prime mark means something other than the opposite direction, or "
    + 'describes the turn as seen from the far side of the cube rather than looking at the face.',
  'any-vs-optimal':
    'The response treats any solution the solver found as automatically the shortest one, or '
    + 'assumes a solution of a stated length proves no shorter solution exists.',
  'gods-number-human':
    "The response treats God's number as a description of how people solve cubes: that humans "
    + 'normally or easily solve in 20 moves, that 20 is a typical human solve length, or that '
    + 'learning enough algorithms lets a person find 20-move solutions at the table.',
  insufficient:
    'The response is on the topic of the question but does not say enough to tell whether the '
    + 'understanding is right or wrong. For example it restates the question, says only "I do not '
    + 'know", or gives a fragment with no reasoning.',
  unrelated:
    'The response does not address the question that was asked. It may be about something else '
    + 'entirely, be empty of content, or be nonsense.',
};

export interface MisconceptionState {
  question: string;
  learner_response: string;
  response_language: string;
}

/** Build the state for a misconception check. Text is the model's only input. */
export function misconceptionState(
  promptId: string, answer: string, language: 'en' | 'fa',
): MisconceptionState {
  return {
    question: PROMPT_TEXT[promptId] ?? promptId,
    learner_response: answer,
    response_language: language === 'fa' ? 'Persian (Farsi)' : 'English',
  };
}

/**
 * The two questions asked together about one answer.
 *
 * They are independent - Jev evaluates every question in a request in parallel
 * and no answer becomes context for another - so `on_topic` is a genuine
 * second opinion rather than a restatement of the diagnosis. Code combines
 * them: a response the model thinks is off-topic cannot be diagnosed as a
 * misconception, however confident the diagnosis looked on its own.
 */
export function misconceptionQuestions(promptId: string): QuestionSpec {
  const prompt = MISCONCEPTION_PROMPTS.find((p) => p.id === promptId);
  const labels = prompt?.plausible ?? (Object.keys(MISCONCEPTION_CRITERIA) as MisconceptionLabel[]);
  const criteria: Record<string, string> = {};
  for (const label of labels) criteria[label] = MISCONCEPTION_CRITERIA[label];

  return {
    diagnosis: {
      type: 'choice',
      instructions: {
        task:
          'A learner was asked a question about the Rubik\'s Cube and answered in their own '
          + 'words. Classify what their answer shows about their understanding.',
        judge: 'Classify the learner_response only. Do not judge the question itself.',
        note:
          'The response may be written in a language other than English. Judge the meaning, not '
          + 'the fluency, spelling or vocabulary.',
      },
      criteria,
    },
    on_topic: {
      type: 'noul',
      instructions:
        'Does `learner_response` attempt to answer `question`, whatever its correctness?',
      criteria: {
        true: 'The response engages with the question that was asked, even if it is wrong, vague or brief.',
        false: 'The response is about something else, is empty of content, or is nonsense.',
      },
    },
  };
}

/* ---------------------------------------------------- 2. adaptive tutor --- */

/**
 * The learning activities the tutor may choose between.
 *
 * Every one of these already exists in the application. Jev selects among
 * candidates the deterministic prerequisite filter has already approved; it
 * cannot invent an activity, and it never sees one the learner is not ready
 * for.
 */
export interface Activity {
  id: string;
  /** Where the application sends the learner. */
  route: string;
  /** Lessons that must be complete before this is offered. */
  requires: readonly string[];
  /** What this activity is, written for the model. */
  description: string;
}

export const ACTIVITIES: readonly Activity[] = [
  {
    id: 'lesson-notation',
    route: '#/learn/notation',
    requires: [],
    description:
      'Read the lesson on move notation: the six face letters, the prime mark and the '
      + 'face-turn metric. Right for a learner who has not covered notation or who reverses '
      + 'directions.',
  },
  {
    id: 'lesson-pieces',
    route: '#/learn/pieces',
    requires: ['notation'],
    description:
      'Read the lesson on pieces rather than stickers: twenty moving pieces, each with a '
      + 'position and an orientation. Right for a learner who thinks in stickers.',
  },
  {
    id: 'lesson-sticker-map',
    route: '#/learn/sticker-map',
    requires: ['notation'],
    description:
      'Read the lesson on the sticker map: 54 dots, nine circles, and why it is not the graph '
      + 'of cube configurations. Right for a learner who confuses the two pictures.',
  },
  {
    id: 'lesson-graph',
    route: '#/learn/graph',
    requires: ['notation'],
    description:
      'Read the lesson on positions as vertices: the state-space graph, its edges and its '
      + 'branching factor. Right for a learner ready to move from the cube to the graph.',
  },
  {
    id: 'lesson-distance',
    route: '#/learn/distance',
    requires: ['graph'],
    description:
      'Read the lesson on distance and diameter: where the cube actually lives, and what '
      + "God's number measures. Right for a learner who has the graph but not the metric.",
  },
  {
    id: 'lesson-gods-number',
    route: '#/learn/gods-number',
    requires: ['distance'],
    description:
      "Read the lesson on how God's number was proved. Right for a learner who confuses a "
      + 'solution with a shortest solution, or a bound with typical performance.',
  },
  {
    id: 'practice-inverse',
    route: '#/learn/notation',
    requires: ['notation'],
    description:
      'Practise inverse moves on a cube: undo a short sequence by reversing and negating it. '
      + 'Right for a learner who makes direction mistakes or wastes moves undoing their own work.',
  },
  {
    id: 'practice-efficiency',
    route: '#/practise',
    requires: ['notation'],
    description:
      'Attempt a challenge at a verified distance and be graded against the proven optimum. '
      + 'Right for a learner who can solve but wastes moves.',
  },
  {
    id: 'explore-state-space',
    route: '#/explore/state-space',
    requires: ['graph'],
    description:
      'Explore the state-space graph interactively: walk the neighbourhood of a position and '
      + 'see the complete graph of the 2x2x2. Right for a learner who has read about the graph '
      + 'but not handled one.',
  },
  {
    id: 'compare-solvers',
    route: '#/explore/solvers',
    requires: ['distance'],
    description:
      'Compare two-phase search with provably optimal search and see what each can promise. '
      + 'Right for a learner ready to separate a solution from a shortest solution.',
  },
];

export interface NextStepState {
  learner: LearnerSignals;
  available_activities: { id: string; description: string }[];
}

export function nextStepState(
  signals: LearnerSignals, candidates: readonly string[],
): NextStepState {
  const byId = new Map(ACTIVITIES.map((a) => [a.id, a]));
  return {
    learner: signals,
    available_activities: candidates
      .map((id) => byId.get(id))
      .filter((a): a is Activity => a !== undefined)
      .map((a) => ({ id: a.id, description: a.description })),
  };
}

/**
 * One question: which of these is the most useful thing to do next?
 *
 * The criteria are the candidate descriptions themselves, so the model is
 * choosing between real activities rather than abstract categories. There is
 * no no-match option here on purpose: the list is always non-empty and any
 * entry on it is a defensible next step, so abstaining would mean refusing to
 * help. Uncertainty is handled by the confidence threshold instead.
 */
export function nextStepQuestions(candidates: readonly string[]): QuestionSpec {
  const byId = new Map(ACTIVITIES.map((a) => [a.id, a]));
  const criteria: Record<string, string> = {};
  for (const id of candidates) {
    const activity = byId.get(id);
    if (activity) criteria[id] = activity.description;
  }
  return {
    /*
     * Two further questions about the same record, asked in the same request.
     *
     * They run in parallel and cannot see the choice above, which is the
     * point: `ready_to_practise` is an independent second opinion on whether
     * reading has stopped paying, not a justification of whatever activity was
     * picked. Code combines all three into an ordered plan.
     */
    ready_to_practise: {
      type: 'noul',
      instructions:
        'Would this learner now gain more from practising on real positions than from '
        + 'reading another lesson?',
      criteria: {
        true:
          'They have covered enough ground that the next gain is in applying it: lessons '
          + 'finished, few or no unresolved comprehension failures, and either no attempts yet '
          + 'or attempts that show they can solve but not efficiently.',
        false:
          'There is a concept still missing. They have read little, or they failed a '
          + 'comprehension question they have not gone back to, or they leaned heavily on '
          + 'hints, which is a sign the idea rather than the practice is absent.',
      },
    },
    support: {
      type: 'score',
      instructions: {
        task:
          'How much scaffolding should this learner\'s next piece of work carry?',
        principle:
          'Judge the support the work should offer, not the learner\'s ability. Someone new '
          + 'to the subject needs a worked example; someone wasting three moves an attempt '
          + 'needs a target, not an explanation.',
      },
      criteria: [
        'They are working independently and efficiently. Give them a harder problem and stay '
        + 'out of the way.',
        'They are solving things but not cleanly. An occasional nudge and a measurable target '
        + 'will do more than more explanation.',
        'They can follow the material but not yet apply it. A worked demonstration they can '
        + 'watch and repeat is the right size of help.',
        'They are at the beginning, or something fundamental has not landed. Step-by-step '
        + 'material with the reasoning spelled out.',
      ],
    },
    next: {
      type: 'choice',
      instructions: {
        task:
          'A learner is working through a course on the Rubik\'s Cube as a graph-theory '
          + 'problem. Given their record so far, which of the available activities would help '
          + 'them most right now?',
        signals:
          'In `learner`: lessonsDone and lessonsTotal are counts of completed lessons; '
          + 'avgWasted is the mean number of moves spent beyond the proven optimum across '
          + 'recorded attempts; lastWasted is the same figure for the most recent attempt, or '
          + 'null when there is none; hintsLastAttempt counts hints taken on the last attempt; '
          + 'strugglingWith lists lessons whose comprehension question was answered wrongly.',
        prefer:
          'Prefer the activity that addresses a demonstrated difficulty over the next unread '
          + 'lesson. Prefer consolidating a shaky concept over introducing a new one.',
      },
      criteria,
    },
  };
}

/* ----------------------------------------- 2b. "what are you stuck on?" --- */

export interface StuckState {
  difficulty: string;
  learner: LearnerSignals;
  available_activities: { id: string; description: string }[];
}

export function stuckState(
  description: string, signals: LearnerSignals, candidates: readonly string[],
): StuckState {
  const byId = new Map(ACTIVITIES.map((a) => [a.id, a]));
  return {
    difficulty: description,
    learner: signals,
    available_activities: candidates
      .map((id) => byId.get(id))
      .filter((a): a is Activity => a !== undefined)
      .map((a) => ({ id: a.id, description: a.description })),
  };
}

/**
 * Three independent readings of one sentence a learner wrote.
 *
 * This is the question a rule cannot answer. "I keep losing track of which way
 * round R prime goes" and "I get the first layer and then I'm guessing" are
 * different problems with different answers, and neither contains a keyword
 * worth matching on. So the model reads the sentence - but it chooses only
 * from activities the prerequisite filter has already approved, it is given a
 * `none` to take when nothing fits, and two further questions decide whether
 * the sentence was worth routing at all.
 *
 * `specificity` earns its place by changing what happens rather than what is
 * displayed: a vague description gets a request for more detail instead of a
 * confident route to the wrong lesson.
 */
export function stuckQuestions(candidates: readonly string[]): QuestionSpec {
  const byId = new Map(ACTIVITIES.map((a) => [a.id, a]));
  const criteria: Record<string, string> = {
    none: 'Nothing in the list addresses what they described.',
  };
  for (const id of candidates) {
    const activity = byId.get(id);
    if (activity) criteria[id] = activity.description;
  }
  return {
    activity: {
      type: 'choice',
      instructions: {
        task:
          'A learner working through a course on the Rubik\'s Cube described, in their own '
          + 'words, what they are finding difficult. Which of the available activities '
          + 'addresses that difficulty?',
        judge:
          'Match on what the difficulty is about, not on words it shares with an activity '
          + 'description. Choose `none` rather than the nearest thing when nothing addresses it.',
        note:
          'The description may be written in a language other than English. Judge the meaning, '
          + 'not the fluency, spelling or vocabulary.',
      },
      criteria,
    },
    on_topic: {
      type: 'noul',
      instructions:
        'Is `difficulty` about learning the Rubik\'s Cube, its notation, its mathematics or '
        + 'solving it?',
      criteria: {
        true: 'It describes something about the cube or the course, however vaguely.',
        false:
          'It is about something else entirely, is empty of content, or is an instruction to '
          + 'the application rather than a description of a difficulty.',
      },
    },
    specificity: {
      type: 'score',
      instructions:
        'How specific is `difficulty` about what the learner cannot do?',
      criteria: [
        'A general statement of being lost, with nothing to act on: "it is hard", "I do not '
        + 'get it", "help".',
        'A named area but no particular difficulty: "the notation", "the maths part", "solving '
        + 'it".',
        'A particular thing that goes wrong, which points at one activity: which way a prime '
        + 'turn goes, what happens after the first layer, why a shortest solution is different '
        + 'from any solution.',
      ],
    },
  };
}

/* ------------------------------------------- 2c. an exercise to measure --- */

export interface ExerciseState {
  learner: LearnerSignals;
  available_distances: number[];
}

export function exerciseState(
  signals: LearnerSignals, bands: readonly number[],
): ExerciseState {
  return { learner: signals, available_distances: [...bands] };
}

/**
 * How hard, and what kind of hard.
 *
 * Both questions are about the learner, and neither is about the cube. The
 * model is not asked how far a position is from solved - the optimal solver
 * knows that exactly and a probability would be a worse answer - it is asked
 * what would suit this person now. The engine then builds a position to that
 * shape and proves it, or reports that it could not.
 *
 * A Score for the difficulty because the bands are ordered and a value
 * between two of them is meaningful: the code rounds, and the learner can
 * always pick a different one by hand.
 */
export function exerciseQuestions(bands: readonly number[]): QuestionSpec {
  const levels = bands.map((n, i) => {
    const place = i === 0 ? 'the easiest'
      : i === bands.length - 1 ? 'the hardest' : 'a middling';
    return `Set them ${place} of the available distances, ${n} moves from solved. `
      + (i === 0
        ? 'Right for somebody new, or somebody who has just got something wrong and needs a win.'
        : i === bands.length - 1
          ? 'Right only for somebody solving reliably at the distance below and wasting almost nothing.'
          : 'Right for somebody who is solving at the distance below but not yet cleanly.');
  });

  return {
    difficulty: {
      type: 'score',
      instructions: {
        task:
          'A learner has asked for a position to practise on. Every position offered is a '
          + 'known, exact number of moves from solved. How hard should the next one be?',
        signals:
          'In `learner`: attempts counts recorded attempts; optimalSolves counts those that '
          + 'matched the proven shortest solution; avgWasted is the mean number of moves spent '
          + 'beyond the optimum; lastWasted is the same for the most recent attempt; '
          + 'hintsLastAttempt counts hints taken on it.',
        principle:
          'Stretch without discouraging. Somebody solving cleanly is bored; somebody wasting '
          + 'several moves an attempt, or leaning on hints, is not ready for more.',
      },
      criteria: levels as unknown as readonly [string, string, ...string[]],
    },
    focus: {
      type: 'choice',
      instructions: {
        task:
          'What kind of difficulty would teach this learner the most right now?',
        note:
          'These describe properties of a cube position that the application can check and '
          + 'guarantee. Choose `mixed` when nothing in their record points either way.',
      },
      criteria: {
        orientation:
          'A position where several pieces are in roughly the right area but facing the wrong '
          + 'way. Teaches the difference between where a piece is and which way it points - the '
          + 'idea a learner is missing when they think in stickers rather than pieces.',
        placement:
          'A position where every piece is already oriented correctly and the work is entirely '
          + 'in moving them to the right slots. Right for somebody who has orientation and '
          + 'needs to plan a route.',
        mixed:
          'An ordinary position with both kinds of work in it. The right answer when their '
          + 'record does not point at one weakness rather than the other.',
      },
    },
  };
}

/* ------------------------------------------------------ 3. hint ladder --- */

export interface HintState {
  attempt: HintSituation;
}

export function hintState(situation: HintSituation): HintState {
  return { attempt: situation };
}

/**
 * How much help to offer, as a position on an ordered ladder.
 *
 * A Score rather than a Choice because the answers are genuinely ordered -
 * "point at a region" is less help than "name the move" - and because a score
 * landing between two levels is meaningful here: the code rounds, and the
 * learner can always escalate by hand.
 *
 * What the hint *says* at each level is computed from the verified optimal
 * solution. Jev picks the rung; the cube engine writes the words.
 */
export function hintQuestions(): QuestionSpec {
  return {
    level: {
      type: 'score',
      instructions: {
        task:
          'A learner is trying to solve a Rubik\'s Cube position that is a known, small number '
          + 'of moves from solved. How much help should the next hint give?',
        signals:
          'In `attempt`: optimalLength is the proven shortest number of moves for this '
          + 'position; movesUsed is how many the learner has made; wasted is how many of those '
          + 'were beyond the optimum; hintsTaken counts hints already given on this position; '
          + 'restarts counts times they began again; secondsOnTask is time spent.',
        principle:
          'Give the least help that will unstick them. Early exploration deserves a nudge; '
          + 'sustained failure, repeated restarts and hints already spent deserve a direct '
          + 'answer. Do not withhold help from someone who is clearly stuck.',
      },
      criteria: [
        'The learner has barely begun or is making progress. Point them at the part of the '
        + 'cube worth looking at, and let them find the move.',
        'The learner is searching without a focus. Highlight the specific face and the stickers '
        + 'a useful turn would move, without naming the turn.',
        'The learner is repeating mistakes or has wasted several moves. Name the idea they are '
        + 'missing and send them to the concept that explains it.',
        'The learner is stuck: several hints taken, or many wasted moves, or repeated restarts. '
        + 'Give them the next move outright.',
      ],
    },
  };
}

/* --------------------------------------------------- 4. command routing --- */

/** What each command does, written for the model. */
const COMMAND_CRITERIA: Record<CommandAction, string> = {
  scramble: 'Mix the cube up into a new random position.',
  reset: 'Put the cube back to solved.',
  solve: 'Search for a solution to the current position and queue it.',
  play: 'Play the queued sequence of moves as an animation.',
  'step-forward': 'Advance the playback by exactly one move.',
  'step-back': 'Go back by exactly one move.',
  'show-sticker-map': 'Show the map of the 54 stickers beside the cube.',
  'show-state-space': 'Open the state-space graph, whose vertices are whole configurations.',
  'open-notation-lesson': 'Open the lesson that teaches move notation and the face-turn metric.',
  'open-training': 'Open the training page and start a graded challenge.',
  'explain-inverse':
    "Explain or demonstrate why a move and its inverse cancel, for example R then R'.",
  none:
    'The request does not match any available action, asks for something the application '
    + 'cannot do, or is too vague to act on.',
};

export interface CommandState {
  request: string;
  request_language: string;
}

export function commandState(utterance: string, language: 'en' | 'fa'): CommandState {
  return {
    request: utterance,
    request_language: language === 'fa' ? 'Persian (Farsi)' : 'English',
  };
}

/**
 * Which action was asked for, and whether the request was clear.
 *
 * The two questions are independent, which is the point: a request can map
 * cleanly onto one action and still be an ambiguous thing to have said. Code
 * requires both a confident choice and a high probability of being
 * unambiguous before it will touch the cube without asking.
 */
export function commandQuestions(): QuestionSpec {
  return {
    action: {
      type: 'choice',
      instructions: {
        task:
          'A learner typed a request into a Rubik\'s Cube laboratory. Which one of the '
          + 'available actions did they ask for?',
        note:
          'The request may be written in a language other than English. Choose `none` rather '
          + 'than guessing when nothing fits.',
      },
      criteria: COMMAND_CRITERIA,
    },
    unambiguous: {
      type: 'noul',
      instructions: 'Is `request` a clear instruction with exactly one reasonable reading?',
      criteria: {
        true: 'The request names one action plainly, and a reasonable person would not read it two ways.',
        false:
          'The request is vague, could mean several different actions, or asks a question '
          + 'rather than giving an instruction.',
      },
    },
  };
}

/* ------------------------------------------------------- shared shapes --- */

/**
 * A question set, in the SDK's own shape.
 *
 * Declared structurally rather than imported so this module stays loadable by
 * the browser bundle and by the evaluation harness, neither of which has the
 * SDK. The server checks these against the real types when it builds a call.
 */
export type QuestionSpec = Record<string, SpecQuestion>;

export type SpecQuestion =
  | { type: 'choice'; instructions: unknown; criteria: Record<string, string> }
  | { type: 'score'; instructions: unknown; criteria: readonly [string, string, ...string[]] }
  | { type: 'noul'; instructions: unknown; criteria?: { true?: string; false?: string } };
