import { useMemo, useState } from 'react';
import { CubeTask, LessonBody, Quiz } from './framework';
import { Callout, Card, Stat } from '../components/ui';
import { StickerMap } from '../graph/StickerMap';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';
import { parseSequence } from '../cube/notation';
import { FACE_NAMES } from '../cube/defs';
import { MAP_CIRCLES, faceletsAffectedBy, nodeForFacelet } from '../graph/stickerGeometry';
import { T, useI18n } from '../i18n/I18nProvider';
import { ConceptCheck } from '../components/ConceptCheck';

/**
 * The lesson that introduces the reference figure and, just as importantly,
 * separates it from the configuration graph people usually mean when they say
 * "the Rubik's cube graph".
 */
export function LessonStickerMap(): JSX.Element {
  const { t } = useI18n();
  const [moves, setMoves] = useState<number[]>([]);
  const [preview, setPreview] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const cube = useMemo(() => CubieCube.fromMoves(moves), [moves]);
  const facelets = useMemo(() => faceletString(toFacelets(cube)), [cube]);
  const prevFacelets = useMemo(
    () => faceletString(toFacelets(CubieCube.fromMoves(moves.slice(0, -1)))),
    [moves],
  );

  const circles = selected === null ? [] : nodeForFacelet(selected).circles.map((c) => MAP_CIRCLES[c]);

  return (
    <LessonBody>
      <p>{t('l.map.intro')}</p>

      <Callout title={t('l.map.twoPictures')}>
        <ul style={{ marginBottom: 0 }}>
          <li>{t('l.map.stickerMap')}</li>
          <li>{t('l.map.configGraph')}</li>
        </ul>
      </Callout>

      <h3>{t('l.map.howBuilt')}</h3>
      <p>{t('l.map.howBuiltBody')}</p>

      <Card title={t('l.map.turnAndWatch')} className="stack">
        <div className="split" style={{ gap: 14 }}>
          <div style={{ background: 'var(--map-paper)', borderRadius: 'var(--radius-s)', padding: 2 }}>
            <StickerMap
              facelets={facelets}
              previousFacelets={prevFacelets}
              highlightMove={preview}
              selected={selected}
              onSelect={(f) => setSelected((c) => (c === f ? null : f))}
              showFaceLabels
            />
          </div>
          <div className="stack">
            <Cube3D facelets={facelets} interactive={false} height={230} />
            <div>
              <div className="card-note" style={{ marginBottom: 6 }}>
                {t('l.map.hoverATurn')}
              </div>
              <MovePad
                onMove={(m) => setMoves((x) => [...x, m])}
                onPreview={setPreview}
                header="letter"
                keyboard={false}
                hint={false}
              />
            </div>
            <div className="row tight">
              <button
                className="btn small"
                onClick={() => setMoves((x) => x.slice(0, -1))}
                disabled={!moves.length}
              >
                {t('common.undo')}
              </button>
              <button
                className="btn small ghost"
                onClick={() => { setMoves([]); setSelected(null); setPreview(null); }}
              >
                {t('common.reset')}
              </button>
            </div>
            <div className="row" style={{ gap: 16 }}>
              <Stat value={moves.length} label={t('l.map.turnsMade')} />
              <Stat
                value={preview === null ? '—' : faceletsAffectedBy(preview).length}
                label={t('l.map.stickersThatMove')}
                sub={t('l.map.eightPlusTwelve')}
              />
            </div>
            {selected !== null ? (
              <div className="card-note">
                {t('l.map.picked', {
                  slot: faceletName(selected),
                  a: circles[0]?.layer ?? '',
                  famA: circles[0]?.family.id ?? '',
                  b: circles[1]?.layer ?? '',
                  famB: circles[1]?.family.id ?? '',
                })}
              </div>
            ) : (
              <div className="card-note">{t('l.map.clickADot')}</div>
            )}
          </div>
        </div>
      </Card>

      <h3>{t('l.map.circlesAreLayers')}</h3>
      <p>{t('l.map.circlesAreLayersBody')}</p>

      <ConceptCheck
        promptId="map-vs-graph"
        rubric={['jev.rubric.map.1', 'jev.rubric.map.2', 'jev.rubric.map.3']}
      />

      <Quiz
        id="sticker-q1"
        question={t('l.map.q1')}
        options={[t('l.map.q1a'), t('l.map.q1b'), t('l.map.q1c'), t('l.map.q1d')]}
        correct={1}
        explain={<p style={{ marginBottom: 0 }}>{t('l.map.q1why')}</p>}
      />

      <CubeTask
        id="sticker-t1"
        title={t('l.map.task')}
        brief={<p>{t('l.map.taskBrief')}</p>}
        setup="R"
        parMoves={1}
        check={(c) => (c.isSolved() ? null : t('l.map.notBackYet'))}
        hint={<p style={{ margin: 0 }}><T k="l.map.taskHint" /></p>}
        solution="R'"
      />

      <h3>{t('l.map.cannotTell')}</h3>
      <p>{t('l.map.cannotTellBody')}</p>

      <Callout kind="warn" title={t('l.map.sourceNote')}>
        <p style={{ marginBottom: 0 }}>{t('l.map.sourceNoteBody')}</p>
      </Callout>
    </LessonBody>
  );
}

export function faceletName(f: number): string {
  return `${FACE_NAMES[Math.floor(f / 9)]}${(f % 9) + 1}`;
}

export { parseSequence };
