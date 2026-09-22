/**
 * What a drag across a sticker should turn.
 *
 * The bug this exists to stop came back as "the cube only turns one way": a
 * drag on the U, R or F layers gave the inverse of what the pointer asked for,
 * while D, L and B were right, so it looked like the direction was ignored
 * rather than reversed. It survived because the direction was four hand-derived
 * signs multiplied together and nothing checked the product.
 *
 * So nothing here trusts the same reasoning twice. The expected answer is
 * recovered from the engine's own move tables: apply the move `dragMove`
 * chose, find where the grabbed piece actually went, and measure which way it
 * went round. That is the thing the learner sees, and it is computed by a
 * different route from the one under test.
 */

import { describe, expect, it } from 'vitest';
import { CORNER_FACELET, EDGE_FACELET, MOVE_FACE, MOVE_NAMES, MOVE_POWER } from './defs';
import { CubieCube } from './cubie';
import { FACE_NORMAL, dragMove, faceletNormal, faceletPosition, type Vec3 } from './geometry';

/** The cubie coordinate of each corner and edge slot. */
const CORNER_POS = CORNER_FACELET.map((t) => faceletPosition(t[0]));
const EDGE_POS = EDGE_FACELET.map((t) => faceletPosition(t[0]));

/** Which piece slot a facelet belongs to, or null for a centre. */
function slotOf(facelet: number): { kind: 'corner' | 'edge'; index: number } | null {
  const c = CORNER_FACELET.findIndex((t) => t.includes(facelet));
  if (c >= 0) return { kind: 'corner', index: c };
  const e = EDGE_FACELET.findIndex((t) => t.includes(facelet));
  if (e >= 0) return { kind: 'edge', index: e };
  return null;
}

/** Where the piece now in slot `index` ends up when `move` is applied. */
function slotAfter(move: number, kind: 'corner' | 'edge', index: number): Vec3 {
  const cube = new CubieCube().applyMove(move);
  const perm = kind === 'corner' ? cube.cp : cube.ep;
  const landed = [...perm].findIndex((piece) => piece === index);
  expect(landed).toBeGreaterThanOrEqual(0);
  return kind === 'corner' ? CORNER_POS[landed] : EDGE_POS[landed];
}

const axisName = ['x', 'y', 'z'];
const name = (move: number): string => (move < 0 ? '(none)' : MOVE_NAMES[move]);

describe('drag to move', () => {
  it('refuses exactly the drags that name no face turn', () => {
    for (let facelet = 0; facelet < 54; facelet++) {
      const normal = faceletNormal(facelet);
      const pos = faceletPosition(facelet);
      const normalAxis = normal.findIndex((c) => c !== 0);
      for (let axis = 0; axis < 3; axis++) {
        for (const sign of [1, -1]) {
          const turnAxis = 3 - normalAxis - axis;
          // Dragging along the sticker's own normal is not a direction across
          // it; a zero coordinate means the grabbed layer is a middle slice,
          // which no face turn moves.
          const impossible = axis === normalAxis || pos[turnAxis] === 0;
          const where = `facelet ${facelet} along ${axisName[axis]}${sign > 0 ? '+' : '-'}`;
          expect(`${where}: ${dragMove(normal, pos, axis, sign) < 0}`)
            .toBe(`${where}: ${impossible}`);
        }
      }
    }
  });

  it('turns a layer that actually contains the sticker you grabbed', () => {
    for (let facelet = 0; facelet < 54; facelet++) {
      const normal = faceletNormal(facelet);
      const pos = faceletPosition(facelet);
      for (let axis = 0; axis < 3; axis++) {
        for (const sign of [1, -1]) {
          const move = dragMove(normal, pos, axis, sign);
          if (move < 0) continue;
          const f = FACE_NORMAL[MOVE_FACE[move]];
          const inLayer = (f[0] !== 0 && f[0] === pos[0])
            || (f[1] !== 0 && f[1] === pos[1])
            || (f[2] !== 0 && f[2] === pos[2]);
          expect(`${facelet}/${axisName[axis]}${sign}: ${name(move)} ${inLayer}`)
            .toBe(`${facelet}/${axisName[axis]}${sign}: ${name(move)} true`);
          // A drag is a quarter turn. Half turns have no direction to get wrong
          // and are never what a drag means.
          expect(MOVE_POWER[move]).not.toBe(2);
        }
      }
    }
  });

  it('carries the grabbed sticker the way the pointer pulled it', () => {
    let checked = 0;
    for (let facelet = 0; facelet < 54; facelet++) {
      const normal = faceletNormal(facelet);
      const pos = faceletPosition(facelet);
      const normalAxis = normal.findIndex((c) => c !== 0);
      const slot = slotOf(facelet);
      for (let axis = 0; axis < 3; axis++) {
        for (const sign of [1, -1]) {
          const move = dragMove(normal, pos, axis, sign);
          if (move < 0 || !slot) continue;

          /*
           * Work in the plane the layer turns in, whose two axes are the drag
           * axis and the sticker's own normal. The sense of the turn is the 2D
           * cross product of where the piece was with where it landed, which
           * for a quarter turn is never zero - unlike the straight-line
           * displacement, which vanishes on the corners that move diagonally.
           */
          const landed = slotAfter(move, slot.kind, slot.index);
          const sense = Math.sign(pos[axis] * landed[normalAxis] - pos[normalAxis] * landed[axis]);

          /*
           * A turn of that sense starts the sticker moving at (-m, a) in the
           * same plane, so its speed along the drag axis is -sense * m. The
           * pointer asked for `sign`, so that is what it has to come to.
           */
          const speedAlongDrag = -sense * pos[normalAxis];
          const where = `${MOVE_NAMES[move]} from facelet ${facelet} dragged `
            + `${axisName[axis]}${sign > 0 ? '+' : '-'}`;
          expect(`${where}: ${Math.sign(speedAlongDrag)}`).toBe(`${where}: ${sign}`);
          checked += 1;
        }
      }
    }
    /*
     * 24 corner stickers can be dragged across either of their two in-plane
     * axes, both ways: 96. The 24 edge stickers lie in a middle slice on one
     * of theirs, so only the other one turns a face: 48. Centres lie in a
     * middle slice on both and contribute nothing.
     */
    expect(checked).toBe(144);
  });

  it('matches turns worked out by hand on the default view', () => {
    // The URF corner, grabbed on its R sticker and pulled up: the front layer
    // is what carries it, and a clockwise F would take it downwards.
    expect(name(dragMove([1, 0, 0], [1, 1, 1], 1, 1))).toBe("F'");
    expect(name(dragMove([1, 0, 0], [1, 1, 1], 1, -1))).toBe('F');
    // The same corner on its U sticker, pushed away from the viewer.
    expect(name(dragMove([0, 1, 0], [1, 1, 1], 2, -1))).toBe('R');
    expect(name(dragMove([0, 1, 0], [1, 1, 1], 2, 1))).toBe("R'");
    // The ULF corner on its F sticker, pulled up: the left layer, turning the
    // other way round because it is the face on the negative side.
    expect(name(dragMove([0, 0, 1], [-1, 1, 1], 1, 1))).toBe("L'");
    // The DRB corner on its R sticker, pulled up.
    expect(name(dragMove([1, 0, 0], [1, -1, -1], 1, 1))).toBe('B');
  });

  it('gives opposite drags opposite turns, everywhere', () => {
    for (let facelet = 0; facelet < 54; facelet++) {
      const normal = faceletNormal(facelet);
      const pos = faceletPosition(facelet);
      for (let axis = 0; axis < 3; axis++) {
        const forward = dragMove(normal, pos, axis, 1);
        const back = dragMove(normal, pos, axis, -1);
        if (forward < 0) { expect(back).toBe(-1); continue; }
        expect(MOVE_FACE[back]).toBe(MOVE_FACE[forward]);
        expect(MOVE_POWER[forward] + MOVE_POWER[back]).toBe(4);
      }
    }
  });
});
