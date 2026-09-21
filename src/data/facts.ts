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

export interface MetricNote {
  id: string;
  godsNumber: number;
  /** Whether that number is proved, or the best bound known. */
  proved: boolean;
}

/** Names, rules and notes live in the dictionaries under `metric.<id>.*`. */
export const METRIC_NOTES: MetricNote[] = [
  { id: 'htm', godsNumber: 20, proved: true },
  { id: 'qtm', godsNumber: 26, proved: true },
  { id: 'stm', godsNumber: 18, proved: false },
];

export interface NotablePosition {
  id: string;
  scramble: string;
  distance?: number;
}

/** Names and notes live in the dictionaries under `notable.<id>.*`. */
export const NOTABLE_POSITIONS: NotablePosition[] = [
  { id: 'superflip', scramble: "R L U2 F U' D F2 R2 B2 L U2 F' B' U R2 D F2 U R2 U", distance: 20 },
  { id: 'superflip-spots', scramble: "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2", distance: 20 },
  { id: 'checkerboard', scramble: 'U2 D2 F2 B2 L2 R2', distance: 6 },
  { id: 'four-spots', scramble: "F2 B2 U D' R2 L2 U D'" },
  { id: 'sune', scramble: "R U R' U R U2 R'" },
  { id: 't-perm', scramble: "R U R' U' R' F R2 U' R' U' R U R' F'" },
];
