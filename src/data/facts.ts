/**
 * Published facts about the 3x3x3 cube.
 *
 * These are not computed here - they cannot be, in a browser. They come from
 * the distributed proof completed by Tomas Rokicki, Herbert Kociemba, Morley
 * Davidson and John Dethridge in 2010, which settled God's number at 20 in the
 * face-turn metric by grouping the 43 quintillion positions into two billion
 * cosets and solving them all on donated Google hardware. Counts up to
 * distance 15 are exact; the rest are the published estimates.
 *
 * The app is careful to label which numbers are proved and which are measured
 * in your own browser. The 2x2x2 figures elsewhere in the app are the latter.
 */

export interface DistanceRow {
  distance: number;
  count: number;      // as a float, since these exceed Number.MAX_SAFE_INTEGER
  exact: boolean;
}

export const HTM_DISTANCE_DISTRIBUTION: DistanceRow[] = [
  { distance: 0, count: 1, exact: true },
  { distance: 1, count: 18, exact: true },
  { distance: 2, count: 243, exact: true },
  { distance: 3, count: 3240, exact: true },
  { distance: 4, count: 43239, exact: true },
  { distance: 5, count: 574908, exact: true },
  { distance: 6, count: 7618438, exact: true },
  { distance: 7, count: 100803036, exact: true },
  { distance: 8, count: 1332343288, exact: true },
  { distance: 9, count: 17596479795, exact: true },
  { distance: 10, count: 232248063316, exact: true },
  { distance: 11, count: 3063288809012, exact: true },
  { distance: 12, count: 40374425656248, exact: true },
  { distance: 13, count: 531653418284628, exact: true },
  { distance: 14, count: 6989320578825358, exact: true },
  { distance: 15, count: 91365146187124313, exact: true },
  { distance: 16, count: 1.1e18, exact: false },
  { distance: 17, count: 1.2e19, exact: false },
  { distance: 18, count: 2.9e19, exact: false },
  { distance: 19, count: 1.5e18, exact: false },
  { distance: 20, count: 4.9e8, exact: false },
];

export const TOTAL_STATES = 43252003274489856000;
export const GODS_NUMBER_HTM = 20;
export const GODS_NUMBER_QTM = 26;

/** Roughly what fraction of all positions sit at each distance. */
export function distanceShare(row: DistanceRow): number {
  return row.count / TOTAL_STATES;
}

export const METRIC_NOTES = [
  {
    name: 'Face-turn metric (HTM)',
    rule: 'Any turn of one face counts as one move, whether it is 90° or 180°.',
    godsNumber: 20,
    note: 'The metric this app counts in, and the one "God’s number is 20" refers to.',
  },
  {
    name: 'Quarter-turn metric (QTM)',
    rule: 'Only 90° turns count as one move; a 180° turn counts as two.',
    godsNumber: 26,
    note: 'Proved in 2014. The hardest position in this metric is not the superflip.',
  },
  {
    name: 'Slice-turn metric (STM)',
    rule: 'Middle-slice turns also count as one move.',
    godsNumber: 18,
    note: 'Not yet proved exactly at the time of writing; 18 is the best known bound.',
  },
];

export const NOTABLE_POSITIONS: { name: string; scramble: string; note: string; distance?: number }[] = [
  {
    name: 'Superflip',
    scramble: "R L U2 F U' D F2 R2 B2 L U2 F' B' U R2 D F2 U R2 U",
    note: 'Every edge flipped in place, everything else home. The first position ever proved to need 20 moves, and it is its own inverse.',
    distance: 20,
  },
  {
    name: 'Superflip composed with four spots',
    scramble: "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
    note: 'One of the positions used in the 2010 proof as a 20-move worst case.',
    distance: 20,
  },
  {
    name: 'Checkerboard',
    scramble: 'U2 D2 F2 B2 L2 R2',
    note: 'Six half turns, all commuting. A pretty pattern that is only six moves from solved.',
    distance: 6,
  },
  {
    name: 'Four spots',
    scramble: "F2 B2 U D' R2 L2 U D'",
    note: 'Looks scrambled, is not. A good reminder that visual disorder is a poor guide to distance.',
  },
  {
    name: 'Sune',
    scramble: "R U R' U R U2 R'",
    note: 'A classic seven-move algorithm that twists three corners and leaves everything else alone.',
  },
  {
    name: 'T-permutation',
    scramble: "R U R' U' R' F R2 U' R' U' R U R' F'",
    note: 'Swaps two corners and two edges. The workhorse of human last-layer methods - and wildly inefficient as a route through the graph.',
  },
];
