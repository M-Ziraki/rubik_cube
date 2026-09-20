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

**The Atlas** — the reference picture, made live: a 3D cube beside the graph of
everything reachable from it, plus the published distance distribution of the
whole puzzle.

**The Course** — eleven lessons from notation to God's number, each with
interactive widgets and a question that is only answerable if you understood it.

**Cube lab** — a full 3D cube you can drag, scramble, analyse and solve, with a
scrubbable move history.

**State space** — three views of the graph: the exact neighbourhood of any
position, the *complete* graph of the 2×2×2, and the shape of the 3×3×3 in
summary.

**Solvers** — Kociemba's two-phase algorithm and a provably-optimal IDA* search,
side by side, each labelled with what it can actually promise.

**Your cube** — enter the colours of a physical cube, have them validated
against the three conservation laws, and be walked through a solution of twenty
moves or fewer with a reason given for every move.

**Training** — positions generated at a verified exact distance, graded against
the true optimum.

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

Measured on this machine, 40 uniformly random positions with a 10-second budget:
mean 18.98 moves, maximum 20, none longer. The superflip — the hardest position
there is — reaches exactly 20 given 150 seconds.

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
brute-force breadth-first search, and the complete 2×2×2 distance distribution.

## Development scripts

```bash
npm run bench        # solve 40 uniformly random positions and report the spread
npm run bench:hard   # solve the two hardest known positions, with a long budget
npm run smoke        # drive the built app in a real browser (needs `npm run preview` first)
```

`npm run bench` is how the figures quoted above were measured; rerun it after
touching anything in `src/solver/`.
