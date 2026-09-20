import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { Callout, Card, Segmented, Sequence, Stat } from '../components/ui';
import { actions, currentCube, currentFacelets, isSolved, useAppState } from '../state/store';
import { requestScramble, solve, solveOptimally } from '../solver/client';
import { simplifySequence } from '../cube/notation';
import { LEARNING_PATH } from '../data/methods';
import { report } from '../cube/analysis';
import { LESSONS } from '../lessons/registry';

interface Challenge {
  id: string;
  distance: number;
  title: string;
  brief: string;
  hint: string;
}

const CHALLENGES: Challenge[] = [
  { id: 'c3', distance: 3, title: 'Three moves out', brief: 'Only three turns separate you from home. Find them without guessing.', hint: 'Work backwards: which single move would leave a two-move position?' },
  { id: 'c5', distance: 5, title: 'Five moves out', brief: 'Still small enough to search in your head, if you look at pieces rather than stickers.', hint: 'Find a piece that is already home; whichever move keeps it there is usually right.' },
  { id: 'c7', distance: 7, title: 'Seven moves out', brief: 'Beyond comfortable brute force. Start reasoning about what each move is for.', hint: 'Count misoriented edges. A move that reduces that count is rarely wasted.' },
  { id: 'c9', distance: 9, title: 'Nine moves out', brief: 'Now you need a plan, not a search. Think in sub-goals.', hint: 'Aim for the middle-slice edges first — that is half of what phase one wants.' },
  { id: 'c11', distance: 11, title: 'Eleven moves out', brief: 'About the deepest a person can reliably reason about move by move.', hint: 'Try to reach G1: every edge and corner oriented, slice edges in the slice.' },
];

export function TrainingPage(): JSX.Element {
  const [tab, setTab] = useState<'challenge' | 'progress' | 'path'>('challenge');
  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Practice</div>
        <h1>Training</h1>
        <p className="lede">
          Efficiency is a skill you can measure. Every attempt here is graded against a solution
          the machine had to work for — and against a proven lower bound, so you know exactly how
          much room was left.
        </p>
        <div style={{ marginTop: 12 }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'challenge', label: 'Challenges' },
              { value: 'progress', label: 'Progress' },
              { value: 'path', label: 'Learning path' },
            ]}
          />
        </div>
      </header>
      {tab === 'challenge' ? <ChallengeRunner /> : tab === 'progress' ? <ProgressView /> : <PathView />}
    </>
  );
}

function ChallengeRunner(): JSX.Element {
  const state = useAppState((s) => s);
  const facelets = useMemo(() => currentFacelets(state), [state.origin, state.cursor, state.moves]);
  const solved = useMemo(() => isSolved(state), [facelets]);
  const [challenge, setChallenge] = useState<Challenge>(CHALLENGES[1]);
  const [target, setTarget] = useState<{ optimal: number; moves: number[]; proven: boolean } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [recorded, setRecorded] = useState<{ used: number; optimal: number } | null>(null);
  const token = useRef(0);

  const used = useMemo(
    () => simplifySequence(state.moves.slice(0, state.cursor)).length,
    [state.moves, state.cursor],
  );

  const start = async (c: Challenge): Promise<void> => {
    const t = ++token.current;
    setChallenge(c);
    setPreparing(true);
    setTarget(null); setShowHint(false); setShowAnswer(false); setRecorded(null);
    try {
      // Walk out from solved and then verify the true distance, so the
      // advertised difficulty is the real one rather than the scramble length.
      let facelets = '';
      let optimal = 0;
      let moves: number[] = [];
      let proven = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        const r = await requestScramble(c.distance, false);
        const check = await solveOptimally(r.facelets, { timeBudgetMs: 12000, maxLength: c.distance });
        if (check.length === c.distance) {
          facelets = r.facelets; optimal = check.length; moves = check.moves; proven = true;
          break;
        }
        if (check.length > 0 && !facelets) {
          facelets = r.facelets; optimal = check.length; moves = check.moves; proven = true;
        }
      }
      if (!facelets) {
        const r = await requestScramble(c.distance, false);
        const s = await solve(r.facelets, { timeBudgetMs: 4000 });
        facelets = r.facelets; optimal = s.length; moves = s.moves; proven = false;
      }
      if (t !== token.current) return;
      actions.setPosition(facelets, []);
      setTarget({ optimal, moves, proven });
    } finally {
      if (t === token.current) setPreparing(false);
    }
  };

  useEffect(() => {
    if (solved && target && used > 0 && !recorded) {
      actions.recordRun(target.optimal, used, target.optimal);
      setRecorded({ used, optimal: target.optimal });
    }
  }, [solved, target, used, recorded]);

  const stateReport = useMemo(() => report(currentCube(state)), [facelets]);

  return (
    <div className="split">
      <div className="stack">
        <Card
          title={challenge.title}
          note={target ? `${target.optimal} moves is the true optimum` : preparing ? 'preparing a position at exactly this distance…' : 'press start'}
        >
          <Cube3D />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => start(challenge)} disabled={preparing || !state.tablesReady}>
              {preparing ? 'Preparing…' : 'New position'}
            </button>
            <button className="btn" onClick={() => actions.rewind()} disabled={!target}>Start over</button>
            <button className="btn ghost" onClick={() => actions.undo()} disabled={state.cursor === 0}>Undo</button>
          </div>
        </Card>

        <Card title="Turn the cube">
          <MovePad onMove={(m) => actions.applyMove(m)} disabled={!target} />
        </Card>
      </div>

      <div className="stack">
        <Card title="Pick a difficulty">
          <div className="stack" style={{ gap: 8 }}>
            {CHALLENGES.map((c) => (
              <button
                key={c.id}
                className="btn block"
                style={{ borderColor: c.id === challenge.id ? 'var(--accent)' : undefined }}
                onClick={() => start(c)}
                disabled={preparing}
              >
                <div>
                  <strong>{c.title}</strong>
                  <div className="card-note">{c.brief}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {target ? (
          <Card title="Your attempt" note={recorded ? 'recorded' : 'in progress'}>
            <div className="row" style={{ gap: 18, marginBottom: 12 }}>
              <Stat value={used} label="your moves" />
              <Stat value={target.optimal} label="optimal" sub={target.proven ? 'proven shortest' : 'best found'} />
              <Stat
                value={used > 0 ? `+${Math.max(0, used - target.optimal)}` : '—'}
                label="moves wasted"
              />
            </div>
            {solved && recorded ? (
              <Callout kind={recorded.used === recorded.optimal ? 'info' : 'warn'}
                title={recorded.used === recorded.optimal ? 'Optimal. Nothing was wasted.' : `Solved in ${recorded.used}, ${recorded.used - recorded.optimal} more than necessary.`}>
                <p style={{ marginBottom: 0 }}>
                  {recorded.used === recorded.optimal
                    ? 'You found a shortest path through the graph — exactly what the optimal search proves is the minimum.'
                    : 'Try the same position again from the start. Knowing the target length is itself a strong hint: it tells you how much you can afford to set up.'}
                </p>
              </Callout>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ gap: 18 }}>
                  <Stat value={`${stateReport.orientedEdges}/12`} label="edges oriented" />
                  <Stat value={`${stateReport.orientedCorners}/8`} label="corners oriented" />
                  <Stat value={`${stateReport.solvedPieces}/20`} label="pieces home" />
                </div>
                <div className="row">
                  <button className="btn small" onClick={() => setShowHint(true)} disabled={showHint}>Hint</button>
                  <button className="btn small ghost" onClick={() => setShowAnswer(true)} disabled={showAnswer}>Show the optimal solution</button>
                </div>
                {showHint ? <Callout title="Hint"><p style={{ margin: 0 }}>{challenge.hint}</p></Callout> : null}
                {showAnswer ? (
                  <div>
                    <div className="card-note" style={{ marginBottom: 4 }}>
                      One shortest route (there are usually several):
                    </div>
                    <Sequence moves={target.moves} />
                  </div>
                ) : null}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <div className="card-note" style={{ marginBottom: 4 }}>Your moves so far</div>
              <Sequence moves={state.moves} cursor={state.cursor} onSeek={(i) => actions.seek(i)} empty="none yet" />
            </div>
          </Card>
        ) : (
          <Callout title="How this works">
            <p style={{ marginBottom: 0 }}>
              Each position is generated and then <em>checked</em> with the optimal solver, so
              "seven moves out" really means seven — not "scrambled with seven turns, which might
              only be five moves from home". That check is why starting a challenge takes a moment.
            </p>
          </Callout>
        )}
      </div>
    </div>
  );
}

function ProgressView(): JSX.Element {
  const progress = useAppState((s) => s.progress);
  const runs = progress.challengeRuns;
  const recent = runs.slice(-24).reverse();
  const perfect = runs.filter((r) => r.used === r.optimal).length;
  const avgWaste = runs.length ? runs.reduce((a, r) => a + (r.used - r.optimal), 0) / runs.length : 0;

  return (
    <div className="grid two">
      <Card title="Where you are">
        <div className="row" style={{ gap: 20, marginBottom: 14 }}>
          <Stat value={`${progress.lessonsDone.length}/${LESSONS.length}`} label="lessons done" />
          <Stat value={runs.length} label="attempts" />
          <Stat value={perfect} label="optimal solves" />
          <Stat value={runs.length ? avgWaste.toFixed(1) : '—'} label="avg. moves wasted" />
        </div>
        {runs.length === 0 ? (
          <p className="card-note" style={{ margin: 0 }}>Nothing recorded yet. Finish a challenge and it will appear here.</p>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead><tr><th className="num">distance</th><th className="num">your best</th><th>gap</th></tr></thead>
              <tbody>
                {Object.entries(progress.bestByDistance)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([d, best]) => (
                    <tr key={d}>
                      <td className="num">{d}</td>
                      <td className="num">{best}</td>
                      <td>
                        {best === Number(d)
                          ? <span className="tag ok">optimal</span>
                          : <span className="tag warn">+{best - Number(d)}</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn small ghost" onClick={() => {
            if (confirm('Erase all recorded lessons and attempts? This cannot be undone.')) actions.resetProgress();
          }}>Reset everything</button>
        </div>
      </Card>

      <Card title="Recent attempts">
        {recent.length === 0 ? (
          <p className="card-note" style={{ margin: 0 }}>No attempts yet.</p>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {recent.map((r, i) => (
              <div key={i} className="row" style={{ justifyContent: 'space-between' }}>
                <span className="card-note">{new Date(r.at).toLocaleString()}</span>
                <span>
                  <strong>{r.used}</strong> moves for a {r.distance}-move position{' '}
                  {r.used === r.optimal ? <span className="tag ok">optimal</span> : <span className="tag warn">+{r.used - r.optimal}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function PathView(): JSX.Element {
  return (
    <div className="stack">
      <Callout title="A realistic route to twenty moves">
        <p style={{ marginBottom: 0 }}>
          Nobody finds twenty-move solutions at the table, and anyone who tells you a few
          algorithms will get you there is selling something. What is genuinely achievable is a
          deep understanding of why those solutions exist, the ability to verify one, the ability
          to execute one on a physical cube, and — with real practice — human solves in the
          forties rather than the hundreds. This is the path.
        </p>
      </Callout>
      <div className="grid two">
        {LEARNING_PATH.map((s, i) => (
          <Card key={s.stage} title={`${i + 1}. ${s.stage}`}>
            <p style={{ marginBottom: 8 }}><strong>Goal:</strong> {s.goal}</p>
            <p style={{ marginBottom: 0 }} className="card-note">{s.why}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
