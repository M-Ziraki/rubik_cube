# How Cube Atlas works

The design, the mathematics, the optional AI integration and the tests, in
detail. For what the project is and how to run it, see the
[README](../README.md).

- [The design system](#the-design-system)
- [How it is arranged](#how-it-is-arranged)
- [Finding your way around](#finding-your-way-around)
- [Animation and playback](#animation-and-playback)
- [The sticker map, and how it was recovered](#the-sticker-map-and-how-it-was-recovered)
- [How the mathematics is implemented](#how-the-mathematics-is-implemented)
- [The optional Jev integration](#the-optional-jev-integration)
- [Bilingual support](#bilingual-support)
- [Honesty about claims](#honesty-about-claims)
- [Tests](#tests)
- [Development scripts](#development-scripts)

## The design system

Identity and restraint pull against each other in an application like this, so
one rule settles it: **identity scales inversely with density.** The welcome
card, a lesson header and an empty state carry the cube; the Atlas and the
training runner carry almost none of it. There are exactly two pieces of cube
iconography in the product - the isometric mark, and a nine-cell grid that
fills as the solver builds its tables - and everything else that makes it feel
like one product comes from geometry and a reserved palette.

Three directions were weighed. *Minimal mathematical laboratory* was close to
what was already there, which was the problem: there was no identity to lose.
*Expressive learning environment* was the richest and the most likely to end in
a workspace nobody can read. **Modular cube system** was chosen: structure
taken from the cube itself, with the expressive typography allowed on reading
pages only and the restraint enforced in the workspaces.

- **Scale.** Every spacing and radius step is a multiple of three, because the
  cube is three. It replaced about a dozen unrelated pixel values.
- **Colour.** Two layers: a palette that components never touch, and a semantic
  layer that is all they may use. Dark mode redefines the semantic layer, so a
  component cannot be right in one theme and wrong in the other. The six
  sticker colours are the engine's own values and appear only where they carry
  meaning; a swatch in the inspector is the same colour as the sticker it names.
- **Contrast.** Every text colour is measured against the surface it sits on,
  and `npm run verify:contrast` re-measures all of them in both themes, three
  viewports and both languages. It found about 1,890 failures in the palette
  this replaced; it now reports none.
- **Motion.** One curve, borrowed from a face turn: fast, then settling. It is
  used for panels and disclosures, and for nothing that pretends to be a cube.

## How it is arranged

Four sections and a setup page, where there used to be nine destinations.
Nothing was removed: every page is still here, as a tab inside the section it
belongs to, and all nine old addresses still resolve to the right tab.

| Section | Tabs | What it answers |
|---|---|---|
| **Learn** | Lessons · Your record | What is this, and where am I in it |
| **The cube** | Workspace · Sequences | Turn it, watch it, take a sequence apart |
| **Practise** | Challenges · Your cube · Learning path | Give me something to do |
| **Explore** | State space · Solvers | The mathematics, when you are ready for it |
| **Setup** | General · How Jev is tested | The switches, and the evidence behind one |

The merges are the ones the code was already asking for: the Atlas and the
Cube lab were two addresses for the same cube state, and the Solvers page
imported a component from the Cube lab. Progress left its tab on Training,
because "what have I learned" was hidden one level down inside "give me
something to do". The AI Learning Lab is documentation about the integration,
so it sits beside the switch that turns the integration on rather than
competing with the cube for a place in the navigation.

Renaming something should not make it unfindable by the name you learned it
under, so the palette still answers to "atlas", "cube lab", "training",
"course" and "AI learning lab".

## Finding your way around

**Study help** is one affordance in the same corner of every page. It knows
which page it is on and offers what that page can do: a recommendation of what
to study next from anywhere, and shortcuts into the tools the page already has
— the hint ladder in a challenge, the demonstration on a lesson. For anything
typed it sends you to the one input, `Ctrl K`, rather than keeping a box of its
own. It works with no key, saying so plainly, and every answer carries a label
saying whether it was computed or judged.

**A workspace puts its controls where the work is.** The cube workspace's page bar
carries scramble, solve and reset; playback is docked directly under the two
views; the move pad, move list and sticker inspector collapse into one panel
that remembers whether you left it open. Space plays and pauses, the arrow keys
step a move, Home restarts.

**`Ctrl K` goes anywhere, and does anything** — every section, tab and lesson,
and the actions of the page you are on, matched by substring. That part is a
plain text match, not a judgment, and it works with no key. A sentence that
matches nothing is handled as described in [One input](#one-input).

**A lesson can hand you the cube and take it back.** Lessons with a sequence
worth watching have a "Try it in the Atlas" button: it loads the sequence,
queued rather than applied, and leaves a way back to the lesson you came from.
The sequences and the number of repetitions each needs to come home are
asserted against the engine in `src/lessons/registry.test.ts`.

**On a phone** there is a tab bar for the four main destinations and a sheet
for the rest, a slim top bar carrying the language, and the study panel opens
as a bottom sheet that stops above the tab bar rather than covering it.

## Animation and playback

Everything that moves is driven by one clock (`src/state/turnClock.ts`) and one
playback controller (`src/state/player.ts`), and both read the same store.

- **The store is the only source of truth.** It holds a starting position, a
  move list and a cursor. A turn is committed to the store *before* it is
  animated, so an animation is a picture of a change that has already happened
  and can never leave the cube half-turned.
- **One clock, two views.** The 3D scene and the sticker map both subscribe to
  the same turn, with the same progress value and the same duration, so they
  cannot drift apart. Half turns get 1.35× the time because they sweep twice as
  far — the same figure in both views.
- **Playback waits.** The player advances one move, waits for the clock to
  report that the turn has been committed, pauses for a readable beat and only
  then advances again. It never schedules the next move on a timer and hopes.
- **Six speeds**, from 2000 ms a turn down to no animation at all, changeable
  mid-solution without restarting it. The default is 900 ms, which is slow
  enough to follow a twenty-move solution move by move.
- **Full transport**: play, pause, resume, step forward, step back, restart and
  stop, plus the current move, the move number, the total, how many remain and
  the whole sequence with the current move marked. Stop keeps your place;
  restart rewinds without discarding the sequence; a hand-turn during playback
  stops the player rather than racing it.

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

### Turning a face by dragging

Grabbing a sticker and dragging it has to turn the layer that sticker is on, in
the direction the pointer went. The renderer only answers the part that needs a
camera - which of the sticker's two in-plane directions the drag followed on
screen, and which way. `dragMove()` in `src/cube/geometry.ts` does the rest
with no view in it: the turn axis is whichever axis is left over, the layer is
the one containing the grabbed piece, and the direction is settled by asking
which way a clockwise turn would carry that sticker - one cross product. A
centre sticker, or an edge dragged across its middle slice, names no face turn
and does nothing.

`src/cube/drag.test.ts` checks all 144 draggable sticker-and-direction pairs
against the engine's own move tables: apply the move that was chosen, find where
the piece landed, and measure which way round it went.

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

## The optional Jev integration

Cube Atlas is complete without it. Every lesson, solver, visualisation and
exercise works with no API key, no server and no network access, and with the
integration off **nothing is ever sent to TypeSafe** — including no background
check. Turning it on adds an adaptive tutor.

### Setting it up

Two ways, with different security properties.

**A key on the server** (recommended). The key stays in the Node process and
never reaches the browser:

```bash
cp .env.example .env         # then put your key in TYPESAFE_API_KEY
npm run build && npm run serve   # http://127.0.0.1:5173
```

`npm run dev` mounts the same endpoint as Vite middleware, so development
behaves identically.

**A key in the browser** (bring your own). Open **Settings → Jev AI
integration**, paste a key and switch it on. It is held in `sessionStorage`
for that tab only, never written to disk, and sent to this application's own
server as a header rather than a body field. It has to be entered again after
a refresh — deliberately, because a credential in persistent storage outlives
the session that needed it. The server-side key is the safer arrangement.

Either way, the switch is off until a key exists, and `npm run jev:eval --
--dry` prints exactly what a request would contain without sending one.

### Why there is a server at all

The TypeSafe SDK refuses to run in a browser unless you pass
`dangerouslyAllowBrowser`, and it is right to: a key in a bundle is a key
anyone can read. Cube Atlas was a static site, so the integration adds the
smallest thing that fixes that — one `node:http` handler in `server/`, no
framework.

It is deliberately not a proxy. The browser names a **task**, not a question:

```
POST /api/jev/ask   { "task": "misconception", "promptId": "inverse", ... }
```

The questions live in `src/jev/questions.ts` and cannot be supplied, altered
or added to by a caller, so the endpoint cannot be used to spend a key on
anything else. Every field is validated and bounded before use, requests are
rate-limited per client and per key source, and `GET /api/jev/status` reports
whether a key exists without making an upstream call.

### What Jev decides, and what it never touches

Jev is a System One model: it returns typed, calibrated judgments —
`Choice`, `Score`, `Noul` — rather than text. That is exactly the right shape
for reading an explanation and the wrong shape for anything about the cube,
which the engine already computes exactly. A probability is a worse answer
than a proof.

| Question | Answered by |
|---|---|
| What does a turn do to the 54 stickers? | the cube engine |
| Is this cube physically possible? | the cube engine |
| Is this solution the shortest? | the optimal solver |
| How many moves did I use, and how many were wasted? | arithmetic |
| What does this written explanation show? | **Jev** (`Choice`) |
| Which activity would help most now? | **Jev** (`Choice`, from a list the prerequisite filter approved) |
| How much help should this hint give? | **Jev** (`Score`; the hint's *content* is computed) |
| What did this sentence ask for? | **Jev** (`Choice` + `Noul`) |

Four features use it:

- **Explain it in your own words.** Writing an explanation and comparing it
  against a worked answer is a study technique in its own right, so the
  exercise exists in both modes. Jev adds the *reading*: it classifies the
  answer against a fixed list of misconceptions so the application can show
  the explanation that addresses it. Every explanation was written by a person
  and checked against the engine; a wrong diagnosis shows the wrong *correct*
  explanation, not a false statement. The learner can always disagree, which
  opens the full material.
- **What to do next.** Prerequisites are enforced in code first, so an
  activity the learner is not ready for is never a candidate. The
  deterministic recommendation is computed every time and shown when the two
  disagree.
- **Progressive hints.** Four rungs — the face to look at, the twenty stickers
  a turn would move, the concept behind that kind of turn, the move itself —
  all derived from a solution the solver has proved. Jev chooses the rung, can
  only ever raise it, and can never take help away: a learner who asks for the
  answer gets it.
- **Instructions in plain words.** Typed into `Ctrl K`, and not a chatbot: a
  fixed list of actions, all of which already existed as buttons. Anything that
  would turn a face asks first, every time.

Every judgment is labelled in the interface as an AI judgment, an AI judgment
the application declined to act on, or a computed result — with the
confidence, when there is one.

### The study plan, and describing a difficulty

Two of the four features ask several questions at once. The documentation is
explicit that independent questions about the same state should go in one
request: they run in parallel, they cannot see one another's answers, and one
round trip costs one latency.

**What to do next** is therefore a plan rather than a pick. One request asks
three things about the same record - which activity helps most now, whether
reading has stopped paying and practice would pay more, and how much
scaffolding the work should carry - and code composes them into two ordered
steps under a rule you can read in `planSecondStep`. The model is never asked
"what should the plan be", a question with no checkable answer; it is asked
three narrow ones whose answers combine.

**What are you stuck on?** is the one thing here no rule could do. "I can get
the first layer and then I'm just guessing" is specific and useful, and no
keyword in it maps to an activity. The description goes to the model; the list
of places it may send them is computed from their prerequisites first; and two
further judgments decide between routing, asking for more detail, and saying
plainly that the course does not cover it. A vague sentence gets a request for
more rather than a confident route to the wrong lesson, and a sentence about
the weather is declined. It is the only feature that disappears entirely
without a key, because a keyword matcher pretending to read a sentence would
be worse than saying this part needs a model.

### An exercise made to order

The clearest division of labour in the application, and the reason the feature
is worth having. Jev chooses the *shape* - how hard, and what kind of hard -
and the cube engine builds a position to that shape and proves it. The
difficulty is a judgment; the distance is a proof, checked with the optimal
solver before the learner sees it, and the attempt is graded against that
proof exactly as a challenge off the list is.

The two kinds of hard are properties the engine can check, not adjectives:
*orientation* means enough pieces are facing the wrong way to notice, and
*placement* means every piece is already oriented and the work is entirely in
moving them - which is membership of the subgroup the lessons call G1. When no
position with the requested property turns up inside the budget, the learner
is told so and gets an ordinary one rather than a position quietly pretending
to have a property it does not have.

With no key it still works: the rules pick the difficulty from the record, the
generator does identical work, and the badge says the choice was computed.

### One input

There were three: the palette, which navigated; a command box in the study
panel, which carried out instructions; and a box for describing a difficulty,
which routed to an activity. Three inputs that take a sentence and do
different things with it is not three features, it is a guessing game about
which box to type in.

`Ctrl K` is now the only one, and the order it resolves in is the point.
Deterministic first: a substring match against translated names, aliases and
the current page's actions, which costs nothing, cannot be wrong, and works
with no key. When nothing matches, the keyword router is tried at once - it is
deterministic too - and then, once the typing has paused for 900 ms, the
sentence is read: the instruction and the difficulty are two independent
questions about the same sentence, so they are asked together.

There is no button to ask. A button to ask puts a question about the tool in
front of the question the person has, and asks them to predict whether the
model will help before they have seen an answer. What comes back joins the same
list as everything else, under its own heading, marked ◇ for a judgment or ∑
for a computed route, and is chosen with the same keys. Nothing acts by itself,
and changing the cube still takes a second, explicit yes. So the fast path stays
fast, the offline path stays complete, and the model is a fallback rather than
the front door.

### When it is off, or fails

The integration is off unless a key exists *and* the switch is on. In every
other case, and on every failure — no key, rejected key, rate limit, timeout,
network error, malformed response, a response that arrives after the learner
has moved on — the deterministic path runs and the interface says which one it
used. A failure is never fatal, because there is always a deterministic
answer:

| Feature | Without Jev |
|---|---|
| Next step | priority rules over the eligible activities |
| Explain it | the worked answer and a marking rubric, self-assessed |
| Hints | one rung per request |
| Instructions (`Ctrl K`) | keyword matching, English and Persian |

Nothing is ever fabricated to stand in for a model answer.

### Calibration

`evals/dataset.ts` holds the cases the thresholds in
`src/jev/questions.ts` were chosen against — including a right answer phrased
badly, a confidently wrong one, nonsense, and the same content in both
languages. `npm run jev:eval` runs them and reports exact matches,
abstentions and errors, separately for English and Persian, because the
published documentation makes no claim about non-English performance and it
therefore has to be measured. The same set runs in the browser from the AI
Learning Lab, against the learner's own key.

## Bilingual support

English is the source of truth (`src/i18n/en.ts`); Persian (`src/i18n/fa.ts`)
falls back to it key by key, so a missing translation shows readable English
rather than a raw key. `npm run i18n:report` prints coverage and fails the build
if any user-visible English has been left hardcoded in a component.

Direction is handled at the document level — `dir="rtl"` on `<html>` — so the
sidebar, navigation, list markers, table alignment and every logical margin
mirror, rather than the text merely right-aligning. What deliberately does *not*
mirror is the mathematics:

- move notation, sequences and formulae are wrapped in `.mono-ltr`, which sets
  `direction: ltr` and `unicode-bidi: isolate`. `R U R' U'` reads in that order
  inside a Persian paragraph and means the same thing;
- the `<T>` component finds runs of notation inside translated prose and
  isolates them automatically, so a translator never has to think about it;
- numerals stay Latin, because they have to line up with the notation and with
  every computed figure on the page;
- the cube itself, the sticker map and the state-space graph are never mirrored.

Switching language changes only which dictionary is read and the document
direction. It does not touch the cube, the move list, lesson progress, solver
results or an animation in flight, and the choice persists across a refresh.

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

It also covers the parts that used to be timing bugs rather than maths bugs
(`src/state/playback.test.ts`): that a turn is drawn from the position before
it, that the clock snaps rather than animating when the cursor jumps, that
playback never begins a move before the previous one has been committed, that
pause, stop, step-back and restart each leave the cube exactly where they
should, that a speed change mid-playback does not restart the sequence, and
that forty rapid interactions neither drop nor duplicate a move.

`src/cube/drag.test.ts` checks that dragging a sticker turns the layer it is
on, in the direction it was pulled, for every sticker and both directions -
measured against the engine's move tables rather than the reasoning under test.

`src/i18n/i18n.test.ts` checks the translation contract: every key present in
both languages, every `{placeholder}` preserved, no move symbol translated, and
numerals written in Latin digits so they match the notation.

`server/jevHandler.test.ts` and `src/jev/jev.test.ts` cover the integration
without a key, a network or a request: the behaviour with no key configured,
every threshold and fallback, a malformed or missing answer from the model, an
answer naming a label the question could not have elicited, each failure mode
mapped onto its code, rate limiting per client and per key source, a learner
key never reaching `localStorage` or a request body, and — the one that only
shows up under timing you cannot reproduce by hand — a late answer being
discarded rather than applied to the exercise the learner moved on to.

`npm run verify:jev` drives the whole integration in a browser in three modes.
With no key: every section still works, the AI controls show a configuration
state, and *no request reaches TypeSafe* — every request the page makes is
recorded, so that is an assertion rather than a claim. Against
`scripts/stub-server.mjs`, which swaps only the object that would talk to
TypeSafe and keeps all the shipping code between it and the browser: the
diagnosis, the demonstration, disagreeing with a diagnosis, the side-by-side
comparison and the confirmation before an ambiguous command. And against the
same stub set to fail every call: the tutor still recommends, the cube is
never changed, and the failure is named.

`npm run verify` drives the built app in a real browser and checks the things
that can only be seen there. It reads what the renderer has actually painted
(`CubeScene.inspect()`) and compares it against the model, sticker by sticker,
so "the colours went missing" is a failing assertion rather than a judgement
call. It covers manual rotation, scramble-and-solve, interrupting playback,
rapid interaction, switching language without disturbing the cube, both
languages at desktop, tablet and phone widths, and the regression check that the
sticker map still has its 54 dots and nine circles and the state-space graph is
still its own page.

`scripts/acceptance.mjs` remains the check against the reference figure: 54 dots
and nine arcs, six clean groups when solved, twenty stickers lit by a move
preview, a turn and its inverse restoring the map, four quarter turns restoring
it, picking a dot naming the right sticker, and a drag on the cube turning a
face one way and the opposite drag turning it back.

`npm run verify:contrast` measures the WCAG 2.2 contrast ratio of every piece
of text against the background actually painted behind it, in twelve
combinations of theme, viewport and language, and reports horizontal overflow
while it is there. It exists because a review by eye had missed roughly 160
failures per page in both themes - one token, wrong, in about nineteen hundred
places.

`npm run verify:ux` tests the interface as journeys rather than as components,
because a page can render every one of its parts and still be unusable. A first
visit that starts from one of the four doors, finishes a lesson and is sent to
the next; a scramble, a solve, a pause part-way and a step back, then the same
transport driven from the keyboard; a lesson handing the cube to the Atlas and
taking it back with its progress intact; every standard feature with no key,
including a check that study help is present, in the same place, and one
interaction away in every section; the whole essential workflow by touch at
390×844 with an assertion that nothing fixed covers a control; and a language
switch mid-solution that keeps the position, the queue, the cursor and the
speed. It also records the measurements that motivated the redesign — where the
primary controls land relative to the fold, how many interactions study help
takes — so they cannot quietly regress.

## Development scripts

```bash
npm run bench        # solve 40 random positions, improving for the whole budget
npm run bench:20     # how long it takes to reach a solution within God's number
npm run bench:hard   # solve the two hardest known positions, with a long budget
npm run smoke        # drive the built app in a real browser (needs `npm run preview` first)
npm run verify       # the full browser verification suite (needs `npm run preview` first)
npm run acceptance   # check the sticker map against the reference figure
npm run i18n:report  # translation coverage, and any English left hardcoded
npm run verify:jev   # the Jev integration, with and without a key
npm run verify:ux    # the user journeys, the measurements and the phone layout
npm run verify:contrast  # text contrast in both themes, three widths, both languages
npm run jev:eval     # run the evaluation set against the live API
npm run jev:eval -- --dry   # print what a request would contain, and send nothing
npm run serve        # the production server, which holds the optional API key
```

The README's demo and screenshots are recorded from the real production build,
so they can be regenerated after a visible change (with `npm run preview`
running):

```bash
OUT=demo-out node scripts/record-demo.mjs && OUT=demo-out scripts/make-demo-gif.sh   # docs/demo.gif, needs ffmpeg
node scripts/readme-screenshots.mjs                                                  # docs/screenshots/
```

`npm run bench` is how the figures quoted above were measured; rerun it after
touching anything in `src/solver/`.
