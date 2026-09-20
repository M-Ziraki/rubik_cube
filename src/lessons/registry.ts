import type { ComponentType } from 'react';
import { LessonNotation, LessonPieces, LessonLaws } from './part1';
import { LessonGraph, LessonDistance, LessonSearch, LessonHeuristics } from './part2';
import { LessonGroups, LessonLadder, LessonGodsNumber, LessonHumanVsMachine } from './part3';

export interface Lesson {
  id: string;
  part: string;
  title: string;
  summary: string;
  minutes: number;
  component: ComponentType;
}

export const LESSONS: Lesson[] = [
  {
    id: 'notation',
    part: 'Reading the cube',
    title: 'Notation and moves',
    summary: 'Six letters, three endings, and the metric that God’s number is stated in.',
    minutes: 8,
    component: LessonNotation,
  },
  {
    id: 'pieces',
    part: 'Reading the cube',
    title: 'Pieces, not stickers',
    summary: 'Twenty moving pieces, two independent properties each: where it is and which way it faces.',
    minutes: 8,
    component: LessonPieces,
  },
  {
    id: 'laws',
    part: 'Reading the cube',
    title: 'The three laws',
    summary: 'Why only one arrangement in twelve can actually be reached, and where the 43 quintillion comes from.',
    minutes: 10,
    component: LessonLaws,
  },
  {
    id: 'graph',
    part: 'The graph',
    title: 'Positions as vertices',
    summary: 'The central idea, stated precisely — and why the rings grow thirteenfold, not eighteenfold.',
    minutes: 10,
    component: LessonGraph,
  },
  {
    id: 'distance',
    part: 'The graph',
    title: 'Distance and diameter',
    summary: 'Where the cube actually lives: almost everything is 17 or 18 moves from home.',
    minutes: 8,
    component: LessonDistance,
  },
  {
    id: 'search',
    part: 'Searching',
    title: 'How to look for a path',
    summary: 'Breadth-first, depth-first, iterative deepening — and what each one costs on a graph this size.',
    minutes: 12,
    component: LessonSearch,
  },
  {
    id: 'heuristics',
    part: 'Searching',
    title: 'Lower bounds and pattern databases',
    summary: 'The one trick that makes deep search possible: forget enough of the puzzle to solve it completely.',
    minutes: 12,
    component: LessonHeuristics,
  },
  {
    id: 'groups',
    part: 'Structure',
    title: 'The cube group',
    summary: 'Composition, order, subgroups and cosets — the vocabulary every solver is written in.',
    minutes: 12,
    component: LessonGroups,
  },
  {
    id: 'ladder',
    part: 'Structure',
    title: 'The subgroup ladder',
    summary: 'Thistlethwaite’s idea and Kociemba’s refinement, with the first rung to climb yourself.',
    minutes: 15,
    component: LessonLadder,
  },
  {
    id: 'gods-number',
    part: 'Optimality',
    title: 'God’s number, and how it was proved',
    summary: 'Cosets, 35 CPU-years, and the same proof carried out here on a puzzle small enough to finish.',
    minutes: 12,
    component: LessonGodsNumber,
  },
  {
    id: 'human-vs-machine',
    part: 'Optimality',
    title: 'Humans and machines',
    summary: 'Why 55 moves and 18 moves are different activities, and what is realistically achievable.',
    minutes: 12,
    component: LessonHumanVsMachine,
  },
];

export const LESSON_PARTS = Array.from(new Set(LESSONS.map((l) => l.part)));

export function lessonIndex(id: string): number {
  return LESSONS.findIndex((l) => l.id === id);
}
