import type { ComponentType } from 'react';
import { LessonNotation, LessonPieces, LessonLaws } from './part1';
import { LessonGraph, LessonDistance, LessonSearch, LessonHeuristics } from './part2';
import { LessonGroups, LessonLadder, LessonGodsNumber, LessonHumanVsMachine } from './part3';
import { LessonStickerMap } from './stickerLesson';

/**
 * The course, as structure only.
 *
 * Titles and summaries live in the dictionaries under `lesson.<id>.title` and
 * `lesson.<id>.summary`, and part names under `part.<part>`, so the whole
 * syllabus translates without touching this file.
 */
export interface Lesson {
  id: string;
  part: string;
  minutes: number;
  component: ComponentType;
  /**
   * A sequence the lesson can demonstrate on the real cube in the Atlas.
   *
   * Reading about inverse moves and watching twenty stickers come back to
   * where they started are different experiences, and only one of them
   * sticks. `order` is how many times the sequence has to be repeated to
   * return to the solved position - a checkable fact about the cube group,
   * asserted in `registry.test.ts` rather than taken on trust, so a lesson can
   * never claim an order the engine disagrees with.
   */
  demo?: { sequence: string; order: number };
}

export const LESSONS: Lesson[] = [
  {
    id: 'notation', part: 'reading', minutes: 8, component: LessonNotation,
    demo: { sequence: "R U R' U'", order: 6 },
  },
  { id: 'pieces', part: 'reading', minutes: 8, component: LessonPieces },
  { id: 'laws', part: 'reading', minutes: 10, component: LessonLaws },
  {
    id: 'sticker-map', part: 'graph', minutes: 10, component: LessonStickerMap,
    demo: { sequence: 'U', order: 4 },
  },
  {
    id: 'graph', part: 'graph', minutes: 10, component: LessonGraph,
    demo: { sequence: 'R U', order: 105 },
  },
  { id: 'distance', part: 'graph', minutes: 8, component: LessonDistance },
  { id: 'search', part: 'searching', minutes: 12, component: LessonSearch },
  { id: 'heuristics', part: 'searching', minutes: 12, component: LessonHeuristics },
  {
    id: 'groups', part: 'structure', minutes: 12, component: LessonGroups,
    demo: { sequence: "R U R' U'", order: 6 },
  },
  { id: 'ladder', part: 'structure', minutes: 15, component: LessonLadder },
  { id: 'gods-number', part: 'optimality', minutes: 12, component: LessonGodsNumber },
  { id: 'human-vs-machine', part: 'optimality', minutes: 12, component: LessonHumanVsMachine },
];

export const LESSON_PARTS = Array.from(new Set(LESSONS.map((l) => l.part)));

export function lessonIndex(id: string): number {
  return LESSONS.findIndex((l) => l.id === id);
}
