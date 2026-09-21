# Cube Atlas

An interactive laboratory for understanding the Rubik's Cube as a shortest-path
problem in a graph with 43,252,003,274,489,856,000 vertices.

It is built around one idea, taken from the animation that prompted it: every
arrangement of the cube is a vertex, every face turn is an edge, and solving is
walking home. Everything else — the 3D cube, the graph drawings, the lessons,
the solvers — exists to make that idea concrete, and to be honest about where
it stops being easy.

## Running it

```bash
npm install
npm run dev      # development server
npm run build    # production build into dist/
npm run preview  # serve the production build
npm test         # engine and solver test suite
```

No network access is needed at runtime. Everything, including every solver
table, is computed in the browser.

## What is in it

**The Atlas** — the reference figure, rebuilt and made interactive: a 3D cube
beside a map of its 54 stickers, both driven by one shared state, with
transport controls for stepping, playing, previewing and comparing turns.

**The Course** — eleven lessons from notation to God's number, each with
interactive widgets and a question that is only answerable if you understood it.

**Cube lab** — a full 3D cube you can drag, scramble, analyse and solve, with a
scrubbable move history.

**State space** — the *other* graph, the one whose vertices are whole
configurations: the exact neighbourhood of any position, the *complete* graph
of the 2×2×2, and the shape of the 3×3×3 in summary.

**Solvers** — Kociemba's two-phase algorithm and a provably-optimal IDA* search,
side by side, each labelled with what it can actually promise.

**Your cube** — enter the colours of a physical cube, have them validated
against the three conservation laws, and be walked through a solution of twenty
moves or fewer with a reason given for every move.

**Training** — positions generated at a verified exact distance, graded against
the true optimum.

## The sticker map, and how it was recovered

The animation this project started from was measured rather than guessed at.
Extracting frames and locating every dot shows:

- every frame holds exactly **54 dots, nine of each colour**;
- the dots **never move** — mean displacement between the first and last frame
  is 0.32 px — only their colours change.

So the figure is a map of the 54 stickers, not a graph of cube configurations.
The skeleton is an exact construction: **three families of circles** with their
centres 120° apart at distance 1 from the middle, **three concentric circles
per family** at radii 1.3918, 1.7700 and 2.1482, and the 54 dots are precisely
the intersections of circles from *different* families — 3 family pairs × 3 × 3
× 2 points, with nothing left over. Fitting those seven parameters to the
measured dots gives an RMS error of **0.33 px**, so this is the construction the
animator used rather than an approximation of it.

It is also a cube. Each family stands for one axis and each circle for one
layer, so a dot — lying on two circles and on one side of the third family —
is exactly a (cubie, facing) pair, that is, a facelet. The nine dots of a face
form its 3×3 grid drawn on arcs, and every circle threads the twelve facelets of
one layer band. For the six outer circles that band is precisely the set of
stickers a face turn carries round, which is why a turn slides dots a quarter of
the way along one drawn circle. `src/graph/stickerGeometry.ts` builds all of
this from the seven recovered numbers; `referenceNodes.json` holds the measured dot
positions so the test suite can check the reconstruction against the video.

**What is deliberately not copied.** The video's *motion* is decorative. In a
real cube the six centre stickers can never change colour, so six dots would
have to hold their colour throughout; in the clip only four do, and they are two
orange and two green. Settled frames are not permutations of a legal cube
either. The brief asked to prioritise correct sticker permutations over
decorative fidelity, so the geometry here is the reference's and the movement is
the cube's, driven by the same `CubieCube` the solvers use.

## How the mathematics is implemented

### Representation

Two representations are maintained and converted between (`src/cube/`):

- **facelets** — 54 stickers, what you see and what you type in;
- **cubies** — 8 corners and 12 edges, each with a permutation index and an
  orientation. Moves are group elements acting on this, which is what makes the
  whole thing a Cayley graph.

Piece and facelet numbering follows Kociemba's conventions so the solver tables
match the published literature. Whole-cube rotations are derived from the actual
3D geometry (`src/cube/geometry.ts`) rather than hand-typed, and the derivation
is checked by tests.

### Validation

`diagnose()` in `src/cube/facelet.ts` checks the three conservation laws that
every reachable position obeys — corner twist ≡ 0 (mod 3), edge flip ≡ 0
(mod 2), and matching permutation parity — and reports *all* violations rather
than stopping at the first, because a mis-scanned cube usually breaks several.

### Lookup tables

Built once in a Web Worker (`src/solver/tables.ts`), about 12 MB:

| table | size | diameter |
|---|---|---|
| corner twist × slice | 1,082,565 | 9 |
| edge flip × slice | 1,013,760 | 9 |
| edge flip × corner twist | 4,478,976 | 9 |
| phase-2 corner permutation × slice order | 967,680 | 14 |
| phase-2 edge permutation × slice order | 967,680 | 12 |

Each is the *exact* shortest distance in a simplified version of the puzzle,
found by breadth-first search from solved. Because forgetting information can
only make a puzzle easier, each is a guaranteed lower bound on the real
distance — which is what lets a search discard branches without risking the
answer.

### Two-phase solver

`src/solver/twophase.ts` implements Kociemba's algorithm: reach the subgroup
G1 = ⟨U, D, L², R², F², B²⟩, then solve inside it, each half by IDA*. Three
choices do most of the work:

1. **Phase 2 is capped.** There are so many routes into G1 that rejecting one
   with a long tail and trying another is cheaper than searching that tail.
2. **Six starting points.** The cube is searched with three different axes
   pointing up, each forwards and inverted. Positions that are awkward about one
   axis are usually easy about another. Identical viewpoints — the superflip
   looks the same from all six — are detected and skipped.
3. **A ratcheting limit.** The search accepts a mediocre answer early and then
   tightens, because any answer prunes the rest of the search hard.

Measured on this machine over 30 uniformly random positions:

- asked for a solution within God's number, it delivers one every time, with a
  median of **223 ms** and a worst case of 6.4 seconds (`npm run bench:20`);
- left to keep improving for 10 seconds per position, it averages **18.98**
  moves with a maximum of 20 (`npm run bench`);
- the superflip — the hardest position there is, and the one fixed by every
  symmetry, so the six viewpoints collapse to one — reaches exactly 20 given
  150 seconds (`npm run bench:hard`).

### Optimal solver

`src/solver/optimal.ts` is IDA* over the real group with no phase
decomposition, guided by six admissible pattern databases including two
five-edge databases tracking position *and* orientation. When it returns an
answer, every shorter length has been searched to exhaustion, so the answer is
provably shortest. When it runs out of budget it still returns something worth
having: a **proven lower bound**, because every completed depth is a theorem.

It reaches roughly a dozen moves comfortably. It does not reach 18, and the app
says so — that wall is the honest shape of the problem, and the reason the 2010
proof of God's number needed about 35 CPU-years.

### The 2×2×2, proved from scratch

`src/solver/pocket.ts` enumerates all 7!·3⁶ = 3,674,160 positions of the pocket
cube by breadth-first search, in well under a second in the browser. That gives
a complete distance table: provably optimal solutions with no search at all, the
exact distance distribution, and a proof that God's number for the 2×2×2 is
**11** — obtained by exactly the method Rokicki, Kociemba, Davidson and
Dethridge used on the 3×3×3, just thirteen orders of magnitude smaller.

### Sub-goal solvers

`src/solver/stages.ts` solves three rungs of the ladder optimally by complete
table lookup: orienting all twelve edges (2,048 states, diameter 7), building
the bottom cross (190,080 states, diameter 8), and reaching G1 (diameter 12).

## Honesty about claims

The application distinguishes three claims everywhere it makes one:

- **a solution** — any route home;
- **within God's number** — at most 20 moves, which the two-phase solver
  reliably delivers but cannot certify as shortest;
- **provably shortest** — every shorter length exhaustively ruled out.

No answer is ever labelled optimal unless the algorithm that produced it can
actually prove it. Published figures (the 3×3×3 distance distribution, God's
number itself) are labelled as published; everything computed in the browser is
labelled as such.

## Tests

`npm test` covers the engine and the solvers: move-table order and parity,
facelet round-trips, all three validation laws, known identities (the superflip,
the 105-move order of `R U`, T-perm piece counts), coordinate round-trips,
move-table agreement against real cube operations, pruning-table consistency,
random-state solving within God's number, optimal-solver agreement with
brute-force breadth-first search, the complete 2×2×2 distance distribution, and
the sticker map — that it covers all 54 facelets once, that every circle is a
genuine cube band, that a turn advances a band by three places, that a move and
its inverse cancel, and that the generated geometry lands on the dots measured
from the reference video.

`npm run smoke` and `scripts/acceptance.mjs` drive the built app in a real
browser and check the acceptance criteria end to end: 54 dots and nine arcs,
six clean groups when solved, twenty stickers lit by a move preview, a turn and
its inverse restoring the map, four quarter turns restoring it, scramble and
solve staying synchronised, and picking a dot naming the right sticker.

## Development scripts

```bash
npm run bench        # solve 40 random positions, improving for the whole budget
npm run bench:20     # how long it takes to reach a solution within God's number
npm run bench:hard   # solve the two hardest known positions, with a long budget
npm run smoke        # drive the built app in a real browser (needs `npm run preview` first)
```

`npm run bench` is how the figures quoted above were measured; rerun it after
touching anything in `src/solver/`.
