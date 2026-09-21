/**
 * The sticker map, drawn.
 *
 * Nine thin circles and 54 outlined dots, laid out by `stickerMap.ts`. The dots
 * never move; their colours do. When a turn happens the dots that change are
 * animated from where their sticker was to where it is going - along the arc of
 * the band circle when the two lie on the same circle, which is what a face
 * turn does to the twelve stickers around it, and along a short curve otherwise.
 *
 * The band circle a turn rotates is drawn dark while the turn plays, which is
 * the same emphasis the reference animation uses.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FACE_COLORS, FACE_NAMES, MOVE_NAMES } from '../cube/defs';
import {
  MAP_CIRCLES, MAP_EXTENT, STICKER_NODES, bandCircleForMove, faceletsAffectedBy,
  nodeForFacelet, siblingFacelets, sourceOf, type StickerNode,
} from './stickerGeometry';
import { useI18n } from '../i18n/I18nProvider';

export interface StickerMapProps {
  /** 54-character facelet string, the current state. */
  facelets: string;
  /** Play this move as a transition from `facelets`' predecessor. */
  animatingMove?: number | null;
  /** 0..1 progress through `animatingMove`. */
  progress?: number;
  /** The facelet string the animation starts from. */
  previousFacelets?: string;
  /** Dim everything except the stickers this move touches. */
  highlightMove?: number | null;
  selected?: number | null;
  onSelect?: (facelet: number | null) => void;
  onHover?: (facelet: number | null) => void;
  hovered?: number | null;
  /** Show the face letter beside each cluster. */
  showFaceLabels?: boolean;
  /** Draw the state before the current move as faint rings behind the dots. */
  showGhost?: boolean;
}

/**
 * Sizes measured from the reference frames: the coloured fill of a dot has a
 * radius of about 8.5 px against a 65.7 px unit, and the ring around it is a
 * pixel and a half. At that size neighbouring dots in a cluster almost touch,
 * which is what gives the figure its dense, beaded look.
 */
// The ring is drawn centred on the edge, so half of it eats into the fill;
// the radius is raised to compensate and leave 0.129 of visible colour.
const DOT_RADIUS = 0.142;
const DOT_STROKE = 0.026;
const PAD = 0.05;

function arcPoint(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export function StickerMap({
  facelets, animatingMove = null, progress = 1, previousFacelets,
  highlightMove = null, selected = null, onSelect, onHover, hovered = null,
  showFaceLabels = false, showGhost = false,
}: StickerMapProps): JSX.Element {
  const { t } = useI18n();
  const view = MAP_EXTENT + PAD;
  const [localHover, setLocalHover] = useState<number | null>(null);
  const hoverFacelet = hovered ?? localHover;

  const highlighted = useMemo(() => {
    const m = highlightMove ?? (progress < 1 ? animatingMove : null);
    return m === null ? null : new Set(faceletsAffectedBy(m));
  }, [highlightMove, animatingMove, progress]);

  const activeCircle = useMemo(() => {
    const m = highlightMove ?? (progress < 1 ? animatingMove : null);
    return m === null ? null : bandCircleForMove(m).id;
  }, [highlightMove, animatingMove, progress]);

  const focusCircles = useMemo(() => {
    const f = selected ?? hoverFacelet;
    if (f === null) return new Set<number>();
    return new Set(nodeForFacelet(f).circles);
  }, [selected, hoverFacelet]);

  const hoverPiece = useMemo(() => {
    if (hoverFacelet === null) return null;
    return new Set([hoverFacelet, ...siblingFacelets(hoverFacelet)]);
  }, [hoverFacelet]);

  /**
   * Where each dot should be drawn, and what colour, at this instant. During a
   * turn a sticker is drawn travelling from its old slot to its new one.
   */
  const drawn = useMemo(() => {
    const out: { node: StickerNode; x: number; y: number; face: string; moving: boolean }[] = [];
    const mid = animatingMove !== null && progress < 1;
    const from = mid ? sourceOf(animatingMove) : null;
    const start = previousFacelets ?? facelets;

    for (const node of STICKER_NODES) {
      if (!mid || !from) {
        out.push({ node, x: node.x, y: node.y, face: facelets[node.facelet], moving: false });
        continue;
      }
      const src = from[node.facelet];
      if (src === node.facelet) {
        out.push({ node, x: node.x, y: node.y, face: start[node.facelet], moving: false });
        continue;
      }
      const a = nodeForFacelet(src);
      const b = node;
      const shared = a.circles.find((c) => b.circles.includes(c));
      let x: number;
      let y: number;
      if (shared !== undefined) {
        // Both ends sit on one circle, so travel along it the short way round.
        const c = MAP_CIRCLES[shared];
        const a0 = Math.atan2(a.y - c.cy, a.x - c.cx);
        const a1 = Math.atan2(b.y - c.cy, b.x - c.cx);
        let delta = a1 - a0;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        [x, y] = arcPoint(c.cx, c.cy, c.radius, a0 + delta * progress);
      } else {
        // Otherwise bow the path gently away from the middle of the figure.
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const k = 1 + 0.16 / Math.max(0.25, Math.hypot(mx, my));
        const cxq = mx * k;
        const cyq = my * k;
        const t = progress;
        const u = 1 - t;
        x = u * u * a.x + 2 * u * t * cxq + t * t * b.x;
        y = u * u * a.y + 2 * u * t * cyq + t * t * b.y;
      }
      out.push({ node, x, y, face: start[src], moving: true });
    }
    return out;
  }, [facelets, previousFacelets, animatingMove, progress]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const pick = useCallback((e: React.PointerEvent): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * (2 * view) - view;
    const py = view - ((e.clientY - rect.top) / rect.height) * (2 * view);
    let best: number | null = null;
    let bd = DOT_RADIUS + 0.05;
    for (const n of STICKER_NODES) {
      const d = Math.hypot(n.x - px, n.y - py);
      if (d < bd) { bd = d; best = n.facelet; }
    }
    return best;
  }, [view]);

  useEffect(() => {
    if (hovered === undefined) return;
    setLocalHover(null);
  }, [hovered]);

  return (
    <svg
      ref={svgRef}
      viewBox={`${-view} ${-view} ${2 * view} ${2 * view}`}
      style={{ width: '100%', aspectRatio: '1 / 1', display: 'block', touchAction: 'manipulation' }}
      role="img"
      aria-label={t('atlas.map.aria')}
      onPointerMove={(e) => {
        const f = pick(e);
        setLocalHover(f);
        onHover?.(f);
      }}
      onPointerLeave={() => { setLocalHover(null); onHover?.(null); }}
      onPointerDown={(e) => onSelect?.(pick(e))}
    >
      {/* y is flipped so the maths convention used by the layout reads upright */}
      <g transform="scale(1,-1)">
        {MAP_CIRCLES.map((c) => {
          const active = activeCircle === c.id;
          // The two circles a picked sticker sits on are its address, so they
          // are drawn up as well.
          const addressed = focusCircles.has(c.id);
          return (
            <circle
              key={c.id}
              className="map-arc"
              cx={c.cx}
              cy={c.cy}
              r={c.radius}
              fill="none"
              stroke={active || addressed ? 'var(--map-arc-active)' : 'var(--map-arc)'}
              strokeWidth={active ? 0.042 : addressed ? 0.03 : 0.02}
              opacity={active ? 0.95 : addressed ? 0.75 : 0.85}
            />
          );
        })}

        {showGhost && previousFacelets
          ? STICKER_NODES.map((n) => (
            <circle
              key={`ghost-${n.facelet}`}
              cx={n.x}
              cy={n.y}
              r={DOT_RADIUS + 0.075}
              fill="none"
              stroke={FACE_COLORS[previousFacelets[n.facelet] as keyof typeof FACE_COLORS]}
              strokeWidth={0.036}
              opacity={0.5}
            />
          ))
          : null}

        {drawn.map(({ node, x, y, face, moving }) => {
          // A turn in progress fades the bystanders gently; an explicit preview
          // fades them harder, because there the point is the contrast.
          const dim = highlighted !== null && !highlighted.has(node.facelet);
          const dimTo = highlightMove !== null ? 0.2 : 0.36;
          const isSel = selected === node.facelet;
          const inPiece = hoverPiece?.has(node.facelet) ?? false;
          const isHover = hoverFacelet === node.facelet;
          const r = isSel || isHover ? DOT_RADIUS * 1.16 : DOT_RADIUS;
          return (
            <g key={node.facelet} opacity={dim ? dimTo : 1}>
              {isSel || isHover || inPiece ? (
                <circle
                  cx={x}
                  cy={y}
                  r={r + 0.062}
                  fill="none"
                  stroke="var(--map-focus)"
                  strokeWidth={isSel ? 0.036 : 0.024}
                  opacity={isSel || isHover ? 1 : 0.6}
                />
              ) : null}
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={FACE_COLORS[face as keyof typeof FACE_COLORS] ?? '#888'}
                stroke="var(--map-dot-edge)"
                strokeWidth={moving ? DOT_STROKE * 1.3 : DOT_STROKE}
              />
            </g>
          );
        })}
      </g>

      {showFaceLabels
        ? FACE_NAMES.map((name, face) => {
          const ns = STICKER_NODES.filter((n) => n.face === face);
          const cx = ns.reduce((a, n) => a + n.x, 0) / ns.length;
          const cy = ns.reduce((a, n) => a + n.y, 0) / ns.length;
          const out = Math.hypot(cx, cy) || 1;
          const lx = cx + (cx / out) * 0.72;
          const ly = cy + (cy / out) * 0.72;
          return (
            <text
              key={name}
              x={lx}
              y={-ly}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 0.26, fill: 'var(--ink-faint)', fontFamily: 'var(--mono)', fontWeight: 700 }}
            >
              {name}
            </text>
          );
        })
        : null}
    </svg>
  );
}

export function moveLabel(move: number | null): string {
  return move === null ? '—' : MOVE_NAMES[move];
}
