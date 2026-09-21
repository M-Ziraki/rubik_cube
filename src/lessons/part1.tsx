import { useMemo, useState } from 'react';
import { CubeTask, LessonBody, NumberQuiz, Quiz, TryOnTheCube } from './framework';
import { Callout, Card, Sequence, Stat } from '../components/ui';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets, diagnose, parseFaceletString } from '../cube/facelet';
import { CORNER_NAMES, EDGE_NAMES, FACE_COLOR_NAMES, FACE_NAMES, MOVE_NAMES, SOLVED_FACELETS } from '../cube/defs';
import { describeMove, formatSequence, parseSequence, simplifySequence } from '../cube/notation';
import { T, useI18n } from '../i18n/I18nProvider';
import { ConceptCheck } from '../components/ConceptCheck';
import { report } from '../cube/analysis';

/* ============================================================ 1. notation --- */

export function LessonNotation(): JSX.Element {
  const { t } = useI18n();
  const [moves, setMoves] = useState<number[]>([]);
  const cube = useMemo(() => CubieCube.fromMoves(moves), [moves]);
  const simplified = useMemo(() => simplifySequence(moves), [moves]);

  return (
    <LessonBody>
      <p><T k="l.notation.intro" /></p>

      <h3>{t('l.notation.faces')}</h3>
      <p><T k="l.notation.facesBody" /></p>
      <div className="row tight">
        {FACE_NAMES.map((f) => (
          <span key={f} className="tag">
            <bdi className="mono-ltr">{f}</bdi> {t(`colour.${FACE_COLOR_NAMES[f]}`)}
          </span>
        ))}
      </div>

      <h3>{t('l.notation.endings')}</h3>
      <ul>
        <li><T k="l.notation.cw" /></li>
        <li><T k="l.notation.ccw" /></li>
        <li><T k="l.notation.half" /></li>
      </ul>
      <Callout title={t('l.notation.whyHalf')}>
        <p style={{ marginBottom: 0 }}><T k="l.notation.whyHalfBody" /></p>
      </Callout>

      <Card title={t('l.notation.play')} className="stack">
        <div className="split" style={{ gap: 14 }}>
          <Cube3D facelets={faceletString(toFacelets(cube))} interactive={false} height={260} />
          <div className="stack">
            <MovePad onMove={(m) => setMoves((x) => [...x, m])} keyboard={false} />
            <div className="row tight">
              <button
                className="btn small"
                onClick={() => setMoves((x) => x.slice(0, -1))}
                disabled={!moves.length}
              >
                {t('common.undo')}
              </button>
              <button className="btn small ghost" onClick={() => setMoves([])}>
                {t('common.reset')}
              </button>
            </div>
            <Sequence moves={moves} empty={t('l.notation.pressAButton')} />
            {moves.length !== simplified.length ? (
              <div className="card-note">
                <T
                  k="l.notation.reallyOnly"
                  params={{
                    n: moves.length,
                    m: simplified.length,
                    seq: formatSequence(simplified) || t('lab.simplifiesNothing'),
                  }}
                />
              </div>
            ) : null}
            {moves.length ? (
              <div className="card-note">{describeMove(moves[moves.length - 1], t)}</div>
            ) : null}
          </div>
        </div>
      </Card>

      <h3>{t('l.notation.cancel')}</h3>
      <p>
        <TryOnTheCube sequence="R R'" /> <T k="l.notation.cancel1" />{' '}
        <TryOnTheCube sequence="R R" /> <T k="l.notation.cancel2" />{' '}
        <TryOnTheCube sequence="U D U'" /> <T k="l.notation.cancel3" />
      </p>

      {/* Say it in your own words. Multiple choice can be guessed; an
          explanation cannot, which is why both exercises are here. */}
      <ConceptCheck
        promptId="inverse"
        rubric={['jev.rubric.inverse.1', 'jev.rubric.inverse.2', 'jev.rubric.inverse.3']}
      />

      <Quiz
        id="notation-q1"
        question={<T k="l.notation.q1" />}
        options={["R U R' U'", "F B' F' B", 'L2 R2 L2 R2', "U R U' R'"]
          .map((s, i) => <bdi className="mono-ltr" key={i}>{s}</bdi>)}
        correct={2}
        explain={<p style={{ marginBottom: 0 }}><T k="l.notation.q1why" /></p>}
      />

      <CubeTask
        id="notation-t1"
        title={t('l.notation.task')}
        brief={<p><T k="l.notation.taskBrief" /></p>}
        setup="R U F'"
        parMoves={3}
        check={(c) => (c.isSolved() ? null : t('l.notation.notYet'))}
        hint={<p style={{ margin: 0 }}><T k="l.notation.taskHint" /></p>}
        solution="F U' R'"
      />
    </LessonBody>
  );
}

/* ============================================================== 2. pieces --- */

export function LessonPieces(): JSX.Element {
  const { t } = useI18n();
  const [moves, setMoves] = useState<number[]>([]);
  const cube = useMemo(() => CubieCube.fromMoves(moves), [moves]);
  const r = useMemo(() => report(cube), [cube]);

  return (
    <LessonBody>
      <p><T k="l.pieces.intro" /></p>

      <div className="grid three">
        <Card title={t('l.pieces.corners')}>
          <p style={{ marginBottom: 0 }}>{t('l.pieces.cornersBody')}</p>
        </Card>
        <Card title={t('l.pieces.edges')}>
          <p style={{ marginBottom: 0 }}>{t('l.pieces.edgesBody')}</p>
        </Card>
        <Card title={t('l.pieces.centres')}>
          <p style={{ marginBottom: 0 }}>{t('l.pieces.centresBody')}</p>
        </Card>
      </div>

      <Callout title={t('l.pieces.centresFixed')}>
        <p style={{ marginBottom: 0 }}>{t('l.pieces.centresFixedBody')}</p>
      </Callout>

      <h3>{t('l.pieces.twoThings')}</h3>
      <p>{t('l.pieces.twoThingsBody')}</p>

      <Card title={t('l.pieces.watch')} className="stack">
        <div className="split" style={{ gap: 14 }}>
          <Cube3D facelets={faceletString(toFacelets(cube))} interactive={false} height={260} />
          <div className="stack">
            <MovePad onMove={(m) => setMoves((x) => [...x, m])} keyboard={false} />
            <div className="row tight">
              <button
                className="btn small"
                onClick={() => setMoves((x) => x.slice(0, -1))}
                disabled={!moves.length}
              >
                {t('common.undo')}
              </button>
              <button className="btn small ghost" onClick={() => setMoves([])}>
                {t('common.reset')}
              </button>
            </div>
            <div className="row" style={{ gap: 16 }}>
              <Stat value={`${r.orientedEdges}/12`} label={t('scan.edgesOriented')} />
              <Stat value={`${r.orientedCorners}/8`} label={t('scan.cornersOriented')} />
              <Stat value={`${r.solvedPieces}/20`} label={t('l.pieces.fullyHome')} />
            </div>
            <div className="card-note"><T k="l.pieces.notice" /></div>
          </div>
        </div>
      </Card>

      <h3>{t('l.pieces.naming')}</h3>
      <p><T k="l.pieces.namingBody" /></p>
      <div className="row tight">
        {CORNER_NAMES.map((n) => <span key={n} className="tag mono-ltr">{n}</span>)}
      </div>
      <div className="row tight">
        {EDGE_NAMES.map((n) => <span key={n} className="tag mono-ltr">{n}</span>)}
      </div>

      <Quiz
        id="pieces-q1"
        question={<T k="l.pieces.q1" />}
        options={[t('l.pieces.q1a'), t('l.pieces.q1b'), t('l.pieces.q1c'), t('l.pieces.q1d')]}
        correct={1}
        explain={<p style={{ marginBottom: 0 }}>{t('l.pieces.q1why')}</p>}
      />
    </LessonBody>
  );
}

/* =============================================================== 3. laws --- */

export function LessonLaws(): JSX.Element {
  const { t } = useI18n();
  const [broken, setBroken] = useState<'none' | 'twist' | 'flip' | 'swap'>('none');

  const facelets = useMemo(() => {
    const c = CubieCube.identity();
    c.applyMoves(parseSequence("R U R' F' U2 L D").moves);
    if (broken === 'twist') c.co[0] = (c.co[0] + 1) % 3;
    if (broken === 'flip') c.eo[0] ^= 1;
    if (broken === 'swap') { const held = c.ep[0]; c.ep[0] = c.ep[1]; c.ep[1] = held; }
    return toFacelets(c);
  }, [broken]);

  const check = useMemo(() => diagnose(facelets), [facelets]);

  return (
    <LessonBody>
      <p>{t('l.laws.intro')}</p>

      <h3>{t('l.laws.law1')}</h3>
      <p>{t('l.laws.law1Body')}</p>

      <h3>{t('l.laws.law2')}</h3>
      <p>{t('l.laws.law2Body')}</p>

      <h3>{t('l.laws.law3')}</h3>
      <p>{t('l.laws.law3Body')}</p>

      <Card title={t('l.laws.breakOne')} className="stack">
        <div className="row tight">
          {(['none', 'twist', 'flip', 'swap'] as const).map((k) => (
            <button
              key={k}
              className="btn small"
              aria-pressed={broken === k}
              style={broken === k
                ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                : undefined}
              onClick={() => setBroken(k)}
            >
              {t(`l.laws.break.${k}`)}
            </button>
          ))}
        </div>
        <div className="split" style={{ gap: 14 }}>
          <Cube3D facelets={faceletString(facelets)} interactive={false} height={240} />
          <div className="stack">
            {check.ok ? (
              <Callout title={t('l.laws.reachable')}>
                <p style={{ margin: 0 }}>{t('l.laws.reachableBody')}</p>
              </Callout>
            ) : (
              check.problems.map((p) => (
                <Callout key={p.code} kind="warn" title={t(`error.${p.code}`)}>
                  {p.detail.length ? (
                    <ul style={{ margin: 0 }}>
                      {p.detail.map((d, i) => <li key={i}>{t(d.key, d.params)}</li>)}
                    </ul>
                  ) : null}
                </Callout>
              ))
            )}
            <div className="card-note">
              {t('l.laws.sameCheck')} <a href="#/scan">{t('nav.scan')}</a>
            </div>
          </div>
        </div>
      </Card>

      <NumberQuiz
        id="laws-q1"
        question={<p style={{ marginBottom: 0 }}>{t('l.laws.q1')}</p>}
        answer={43252003274489856000n}
        explain={<p style={{ marginBottom: 0 }}>{t('l.laws.q1why')}</p>}
      />
    </LessonBody>
  );
}

/* ---------------------------------------------------------------- shared --- */

export const SOLVED = parseFaceletString(SOLVED_FACELETS);
export const ALL_MOVE_NAMES = MOVE_NAMES;
