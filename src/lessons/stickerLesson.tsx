import { useMemo, useState } from 'react';
import { CubeTask, LessonBody, Quiz } from './framework';
import { Callout, Card, Stat } from '../components/ui';
import { StickerMap } from '../graph/StickerMap';
import { Cube3D } from '../components/Cube3D';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';
import { parseSequence } from '../cube/notation';
import { FACE_NAMES, MOVE_NAMES } from '../cube/defs';
import { MAP_CIRCLES, faceletsAffectedBy, nodeForFacelet } from '../graph/stickerMap';

/**
 * The lesson that introduces the reference figure and, just as importantly,
 * separates it from the configuration graph people usually mean when they say
 * "the Rubik's cube graph".
 */
export function LessonStickerMap(): JSX.Element {
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
      <p>
        There are two completely different pictures that both get called "the graph of the Rubik's
        cube", and confusing them makes everything else muddled. This lesson is about the first
        one, which is the picture in the animation that started this project.
      </p>

      <Callout title="Two pictures, two sizes">
        <ul style={{ marginBottom: 0 }}>
          <li>
            <strong>The sticker map</strong> has <strong>54 dots</strong>, one per sticker. It is a
            picture of <em>one</em> cube. Turning a face repaints the dots; it never moves them.
          </li>
          <li>
            <strong>The configuration graph</strong> has{' '}
            <strong>43,252,003,274,489,856,000 vertices</strong>, one per arrangement of the whole
            cube. A single dot on that graph corresponds to an entire sticker map.
          </li>
        </ul>
      </Callout>

      <h3>How the map is built</h3>
      <p>
        Three families of circles, their centres 120° apart, three circles in each family. The dots
        are the points where circles from <em>different</em> families cross — and there are exactly
        54 of those, with none left over. It is not a coincidence: each family stands for one axis
        of the cube and each circle for one layer along it, so a crossing point pins down a cubie
        and a direction, which is exactly what a sticker is.
      </p>

      <Card title="Turn a face and watch" className="stack">
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
                Hover a turn to see the twenty stickers it touches; click to apply it.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}
                onMouseLeave={() => setPreview(null)}>
                {[0, 1, 2, 3, 4, 5].map((face) => (
                  <div key={face} style={{ display: 'grid', gap: 3 }}>
                    {[0, 1, 2].map((p) => {
                      const m = face * 3 + p;
                      return (
                        <button
                          key={m}
                          className="move-chip"
                          style={{ width: '100%' }}
                          onMouseEnter={() => setPreview(m)}
                          onClick={() => setMoves((x) => [...x, m])}
                        >
                          {MOVE_NAMES[m]}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="row tight">
              <button className="btn small" onClick={() => setMoves((x) => x.slice(0, -1))} disabled={!moves.length}>Undo</button>
              <button className="btn small ghost" onClick={() => { setMoves([]); setSelected(null); }}>Reset</button>
            </div>
            <div className="row" style={{ gap: 16 }}>
              <Stat value={moves.length} label="turns made" />
              <Stat value={preview === null ? '—' : faceletsAffectedBy(preview).length} label="stickers that move" sub="8 on the face, 12 around it" />
            </div>
            {selected !== null ? (
              <div className="card-note">
                Picked {FACE_NAMES[Math.floor(selected / 9)]}{(selected % 9) + 1}. It sits where
                layer {circles[0]?.layer} of the {circles[0]?.family.id} family crosses layer{' '}
                {circles[1]?.layer} of the {circles[1]?.family.id} family — those two circles are
                drawn up so you can see the address.
              </div>
            ) : (
              <div className="card-note">Click a dot to see which two circles give it its address.</div>
            )}
          </div>
        </div>
      </Card>

      <h3>The circles are the cube's layers</h3>
      <p>
        Each circle threads exactly twelve dots, and those twelve are always one complete band
        around the cube. For the outer six circles that band is precisely the set of twelve
        stickers a face turn carries round — which is why a turn slides dots a quarter of the way
        along one circle rather than scattering them.
      </p>

      <Quiz
        id="sticker-q1"
        question={<>Turning a face changes the colour of twenty dots on the map. Why twenty and not twenty-seven?</>}
        options={[
          'Because seven stickers are hidden underneath',
          'Because the face has nine stickers but its centre never moves, so eight move, plus twelve around the band',
          'Because only two layers are involved',
          'Because the corners do not count',
        ]}
        correct={1}
        explain={
          <p style={{ marginBottom: 0 }}>
            8 + 12 = 20. The centre of the turned face spins where it stands, and the other five
            centres are nowhere near the action. Finding the six dots that never change is a good
            way to learn to read the map.
          </p>
        }
      />

      <CubeTask
        id="sticker-t1"
        title="Send a sticker home"
        brief={
          <p>
            One quarter turn put the front-up-right corner sticker out of place. Put it back, and
            notice on the map that undoing a turn walks the dots back around the same circle.
          </p>
        }
        setup="R"
        parMoves={1}
        check={(c) => (c.isSolved() ? null : 'not back yet')}
        hint={<p style={{ margin: 0 }}>The inverse of <code>R</code> is <code>R&rsquo;</code>.</p>}
        solution="R'"
      />

      <h3>What the map cannot tell you</h3>
      <p>
        The map shows one position beautifully and says nothing at all about <em>distance</em>. You
        cannot look at it and see whether you are three moves from solved or eighteen. For that you
        need the other picture — the one whose vertices are whole configurations — and that is the
        subject of the next few lessons.
      </p>

      <Callout kind="warn" title="A note on the source animation">
        <p style={{ marginBottom: 0 }}>
          This figure is reconstructed from the animation that inspired the app, measured off the
          video frame by frame: the circle geometry here reproduces it to within a third of a
          pixel. The video's <em>motion</em>, though, is decorative rather than a real cube — in a
          genuine cube six dots can never change colour, and in the clip only four hold still. So
          the geometry is the reference's; the movement is the cube's.
        </p>
      </Callout>
    </LessonBody>
  );
}

export function faceletName(f: number): string {
  return `${FACE_NAMES[Math.floor(f / 9)]}${(f % 9) + 1}`;
}

export { parseSequence };
