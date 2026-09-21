/**
 * The educational material the judgments select between.
 *
 * Every word a learner reads here was written by a person and checked against
 * the cube engine. Jev chooses *which* of these to show; it never writes one.
 * That division is the whole safety story of the tutor: a wrong judgment shows
 * the wrong correct explanation, which is a bad recommendation, not a false
 * statement about the cube.
 */

import { MOVE_FACE, MOVE_NAMES, MOVE_POWER } from '../cube/defs';
import { faceletsAffectedBy } from '../graph/stickerGeometry';
import type { MisconceptionLabel } from './protocol';

/* ------------------------------------------------- misconception remedies --- */

export interface Remedy {
  /** i18n key for the explanation shown to the learner. */
  explanation: string;
  /**
   * A sequence to run on the exercise cube, as a demonstration.
   * Null when the point is not something a turn can show.
   */
  demo: string | null;
  /** Where to read more. A route that already exists. */
  route: string | null;
  /** i18n key naming that destination. */
  routeLabel: string | null;
}

/**
 * What to do about each diagnosis.
 *
 * `correct` gets a demonstration too: confirming a right answer by watching it
 * happen is worth more than being told "yes".
 */
export const REMEDIES: Record<MisconceptionLabel, Remedy> = {
  correct: {
    explanation: 'jev.remedy.correct',
    demo: null,
    route: null,
    routeLabel: null,
  },
  'inverse-confusion': {
    // Watch R and R' land back where they started, twenty stickers at a time.
    explanation: 'jev.remedy.inverse',
    demo: "R R'",
    route: '#/course/notation',
    routeLabel: 'lesson.notation.title',
  },
  'sticker-vs-state': {
    explanation: 'jev.remedy.stickerVsState',
    demo: 'U',
    route: '#/course/sticker-map',
    routeLabel: 'lesson.sticker-map.title',
  },
  'notation-direction': {
    // The same face, both ways, so the difference is the only thing moving.
    explanation: 'jev.remedy.direction',
    demo: "R R R R",
    route: '#/course/notation',
    routeLabel: 'lesson.notation.title',
  },
  'any-vs-optimal': {
    explanation: 'jev.remedy.anyVsOptimal',
    demo: null,
    route: '#/solver',
    routeLabel: 'nav.solver',
  },
  'gods-number-human': {
    explanation: 'jev.remedy.godsNumber',
    demo: null,
    route: '#/course/gods-number',
    routeLabel: 'lesson.gods-number.title',
  },
  insufficient: {
    explanation: 'jev.remedy.insufficient',
    demo: null,
    route: null,
    routeLabel: null,
  },
  unrelated: {
    explanation: 'jev.remedy.unrelated',
    demo: null,
    route: null,
    routeLabel: null,
  },
};

/* ---------------------------------------------------------- hint ladder --- */

export interface Hint {
  level: number;
  /** i18n key for the text. */
  key: string;
  /** Interpolation values for that key. */
  params: Record<string, string | number>;
  /** Stickers to light up on the cube and the map, when the rung calls for it. */
  emphasis: number[] | null;
  /** A concept to read, when the rung calls for it. */
  route: string | null;
  routeLabel: string | null;
  /** True only on the last rung, which names the move. */
  revealsMove: boolean;
}

/**
 * Build the four rungs for a position, from a solution the solver has proved.
 *
 * `move` is the first move of a verified optimal solution for the position in
 * front of the learner. Everything below is derived from it arithmetically, so
 * a hint cannot be wrong unless the solver is, and the solver is tested.
 */
export function hintLadder(move: number): Hint[] {
  const face = 'URFDLB'[MOVE_FACE[move]];
  const affected = faceletsAffectedBy(move);
  const quarter = MOVE_POWER[move] !== 2;
  // Quarter turns of F, B, L and R are the only moves that change edge
  // orientation; that is the idea behind the concept hint.
  const flips = quarter && ['F', 'B', 'L', 'R'].includes(face);

  return [
    {
      level: 0,
      key: 'jev.hint.region',
      params: { face: `face.${face}` },
      emphasis: null,
      route: null,
      routeLabel: null,
      revealsMove: false,
    },
    {
      level: 1,
      key: 'jev.hint.highlight',
      params: { n: affected.length },
      emphasis: affected,
      route: null,
      routeLabel: null,
      revealsMove: false,
    },
    {
      level: 2,
      key: flips ? 'jev.hint.conceptOrientation' : 'jev.hint.conceptPermutation',
      params: {},
      emphasis: affected,
      route: flips ? '#/course/heuristics' : '#/course/pieces',
      routeLabel: flips ? 'lesson.heuristics.title' : 'lesson.pieces.title',
      revealsMove: false,
    },
    {
      level: 3,
      key: 'jev.hint.move',
      params: { move: MOVE_NAMES[move] },
      emphasis: affected,
      route: null,
      routeLabel: null,
      revealsMove: true,
    },
  ];
}

/* -------------------------------------------------------- command routes --- */

/** Where each non-mutating command sends the learner. */
export const COMMAND_ROUTES: Record<string, string> = {
  'show-sticker-map': '#/',
  'show-state-space': '#/graph',
  'open-notation-lesson': '#/course/notation',
  'open-training': '#/training',
  'explain-inverse': '#/course/notation',
};
