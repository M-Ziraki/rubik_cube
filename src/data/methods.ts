/**
 * How people actually solve cubes, and how that compares to what a computer
 * does. Move counts are typical figures in the face-turn metric for an
 * average random scramble; individual solves vary.
 */

export interface SolvingMethod {
  name: string;
  kind: 'human' | 'hybrid' | 'machine';
  typicalMoves: number;
  algorithmsToLearn: string;
  howItWorks: string;
  whyNotOptimal: string;
}

export const METHODS: SolvingMethod[] = [
  {
    name: 'Beginner layer-by-layer',
    kind: 'human',
    typicalMoves: 110,
    algorithmsToLearn: '5–7 sequences',
    howItWorks:
      'Solve the bottom cross, then the bottom corners, then the middle edges, then orient and permute the top layer. Each stage is protected by algorithms that put everything back where they found it.',
    whyNotOptimal:
      'Almost every move is spent keeping finished work intact. The method never considers whether a completely different route would be shorter, because a human cannot see far enough ahead to know.',
  },
  {
    name: 'CFOP (Fridrich)',
    kind: 'human',
    typicalMoves: 55,
    algorithmsToLearn: '~78 last-layer cases, plus F2L intuition',
    howItWorks:
      'Cross, then the first two layers in four corner-edge pairs, then orient the last layer in one algorithm, then permute it in another.',
    whyNotOptimal:
      'The last layer is solved by look-up rather than search. Recognising a case and firing a memorised sequence is fast for a human but spends 10–20 moves on what a search would often do in 7.',
  },
  {
    name: 'Roux',
    kind: 'human',
    typicalMoves: 48,
    algorithmsToLearn: '~42, plus heavy block-building intuition',
    howItWorks:
      'Build two 1×2×3 blocks, solve six corners with a small algorithm set, then finish the remaining six edges with slice moves.',
    whyNotOptimal:
      'Block building is genuinely close to what a computer does, which is why the move count is low. It still solves in fixed stages rather than searching the whole graph.',
  },
  {
    name: "Thistlethwaite's algorithm",
    kind: 'hybrid',
    typicalMoves: 45,
    algorithmsToLearn: 'four lookup tables, not memorisable by hand',
    howItWorks:
      'Climb a ladder of four nested subgroups. Each rung restricts which turns are still allowed, and each is small enough to solve by table lookup: orient the edges, then the corners and slice, then the piece orbits, then the half-turn group.',
    whyNotOptimal:
      'Each rung is solved optimally in isolation, but the ladder itself forces detours. It was the 1981 breakthrough that showed 52 moves always suffice — and the direct ancestor of the two-phase algorithm.',
  },
  {
    name: "Kociemba's two-phase",
    kind: 'machine',
    typicalMoves: 19,
    algorithmsToLearn: 'about 7 MB of tables',
    howItWorks:
      'Collapse the ladder to two rungs: get into G1 = ⟨U, D, L², R², F², B²⟩, then solve inside it. Search both halves with IDA*, then keep trying longer first halves that leave shorter second halves.',
    whyNotOptimal:
      'Two locally good halves need not add up to a globally shortest whole. It reliably finds 20 or fewer; it cannot certify that 19 was impossible.',
  },
  {
    name: 'Optimal search',
    kind: 'machine',
    typicalMoves: 18,
    algorithmsToLearn: 'gigabytes of pattern databases',
    howItWorks:
      'Iterative-deepening A* over the real cube group. Rule out every length below the answer by exhaustive search, guided by pattern databases that give provable lower bounds.',
    whyNotOptimal:
      'It is optimal — that is the point. The cost is that a random position takes a serious computer minutes to hours, and proving the bound for every position took a distributed effort of around 35 CPU-years.',
  },
];

export const LEARNING_PATH = [
  {
    stage: 'Read the cube',
    goal: 'Name every piece and every move without hesitating.',
    why: 'Nothing else works until notation and piece identity are automatic. A corner is a piece, not three stickers.',
  },
  {
    stage: 'Solve it at all',
    goal: 'Get through a full solve with a layer method, around 110 moves.',
    why: 'You need a working solve before efficiency means anything. This is the only stage where memorising algorithms is the right move.',
  },
  {
    stage: 'Think in invariants',
    goal: 'Look at a cube and say how many edges are misoriented, and whether the slice edges are home.',
    why: 'These are the quantities every serious method and every solver actually tracks. They are learnable by eye with practice.',
  },
  {
    stage: 'Build blocks, not layers',
    goal: 'Solve a 2×2×3 block without algorithms, planning six moves ahead.',
    why: 'This is the skill that separates 55-move solves from 40-move ones, and it is real search, done in your head.',
  },
  {
    stage: 'Climb the subgroup ladder',
    goal: 'Orient all the edges deliberately, then reach G1, then finish with only U, D and half turns.',
    why: 'You are now doing by hand what the two-phase algorithm does. Expect 35–45 moves and a much better feel for why the cube is structured the way it is.',
  },
  {
    stage: 'Execute a computed optimum',
    goal: 'Take a ≤20-move solution from this app and perform it on your physical cube.',
    why: 'The honest truth: no human finds these at the table. Understanding why they exist, being able to check one, and being able to execute one is the realistic goal.',
  },
];
