/**
 * Canvas rendering of a state-graph slice, in the visual language of the
 * reference animation: thin graphite arcs, dots in the cube's own colours,
 * each ring one move further from where you started.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FACE_COLORS, FACE_NAMES, MOVE_NAMES } from '../cube/defs';
import type { GraphPayload } from '../solver/protocol';
import { radialLayout, type LaidOutNode, type Layout } from './layout';

export interface GraphCanvasProps {
  graph: GraphPayload | null;
  /** Node ids forming a highlighted route, in order. */
  path?: number[];
  selected?: number | null;
  onSelect?: (node: LaidOutNode) => void;
  onHover?: (node: LaidOutNode | null) => void;
  height?: number;
  showLabels?: boolean;
  ringGap?: number;
  caption?: string;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function GraphCanvas({
  graph, path = [], selected = null, onSelect, onHover,
  height = 460, showLabels = true, ringGap = 96, caption,
}: GraphCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<LaidOutNode | null>(null);
  const [view, setView] = useState({ scale: 1, ox: 0, oy: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [themeTick, setThemeTick] = useState(0);

  const layout: Layout | null = useMemo(
    () => (graph ? radialLayout(graph, ringGap) : null),
    [graph, ringGap],
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => setThemeTick((t) => t + 1);
    mq.addEventListener('change', onChange);
    const obs = new MutationObserver(onChange);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener('change', onChange); obs.disconnect(); };
  }, []);

  const pathSet = useMemo(() => new Set(path), [path]);
  const pathEdges = useMemo(() => {
    const s = new Set<string>();
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      s.add(a < b ? `${a}:${b}` : `${b}:${a}`);
    }
    return s;
  }, [path]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !layout) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wrap.clientWidth;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const ink = cssVar('--ink', '#2d2b24');
    const faint = cssVar('--ink-faint', '#8d8878');
    const graphite = cssVar('--graphite', '#8a8574');
    const paper = cssVar('--paper-raised', '#fbfaf5');
    const accent = cssVar('--accent', '#1c6b3f');

    const fit = layout.maxRadius > 0 ? Math.min(w, h) / (2 * layout.maxRadius + 44) : 1;
    const scale = fit * view.scale;
    const cx = w / 2 + view.ox;
    const cy = h / 2 + view.oy;
    const px = (n: { x: number; y: number }): [number, number] => [cx + n.x * scale, cy + n.y * scale];

    // Concentric distance rings.
    ctx.save();
    ctx.strokeStyle = graphite;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1;
    layout.rings.forEach((r) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();

    // Edges. Non-tree edges bow towards the middle, which is what gives the
    // picture its woven look - and what shows that many routes meet again.
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    ctx.lineCap = 'round';
    for (const e of layout.edges) {
      const a = byId.get(e.a);
      const b = byId.get(e.b);
      if (!a || !b) continue;
      const key = e.a < e.b ? `${e.a}:${e.b}` : `${e.b}:${e.a}`;
      const onPath = pathEdges.has(key);
      const [ax, ay] = px(a);
      const [bx, by] = px(b);
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      if (e.tree) {
        // Bow each spoke very slightly sideways. Perfectly straight spokes read
        // as a grey fan; a gentle arc keeps the strands distinguishable, which
        // is what gives the reference animation its woven look.
        const nx = -(by - ay);
        const ny = bx - ax;
        const len = Math.hypot(nx, ny) || 1;
        const bow = Math.min(18, len * 0.13);
        ctx.quadraticCurveTo(mx + (nx / len) * bow, my + (ny / len) * bow, bx, by);
      } else {
        ctx.quadraticCurveTo(cx + (mx - cx) * 0.55, cy + (my - cy) * 0.55, bx, by);
      }
      if (onPath) { ctx.strokeStyle = accent; ctx.globalAlpha = 0.95; ctx.lineWidth = 2.4; }
      else if (e.tree) { ctx.strokeStyle = graphite; ctx.globalAlpha = 0.34; ctx.lineWidth = 0.75; }
      else { ctx.strokeStyle = graphite; ctx.globalAlpha = 0.13; ctx.lineWidth = 0.7; }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Nodes. Dots are sized to the room available on their own ring, so a
    // crowded outer ring stays readable instead of turning into a solid band.
    const ringRadius = layout.ringCounts.map((count, d) => {
      if (d === 0) return 8;
      const circumference = 2 * Math.PI * layout.rings[d - 1] * scale;
      return Math.max(1.4, Math.min(6, (circumference / Math.max(1, count)) * 0.34));
    });
    for (const n of layout.nodes) {
      const [x, y] = px(n);
      const isRoot = n.depth === 0;
      const onPath = pathSet.has(n.id);
      const isSelected = selected === n.id;
      const isHover = hover?.id === n.id;
      const base = ringRadius[n.depth] ?? 4;
      const r = isRoot ? 8 : isSelected || isHover ? Math.max(base, 6.5) : onPath ? Math.max(base, 5) : base;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isRoot
        ? ink
        : n.face >= 0 ? FACE_COLORS[FACE_NAMES[n.face]] : faint;
      ctx.fill();
      if (r > 2.2 || isSelected || isHover || onPath) {
        ctx.lineWidth = isSelected || isHover ? 2.4 : Math.min(1.6, r * 0.45);
        ctx.strokeStyle = isSelected || onPath ? accent : paper;
        ctx.stroke();
      }
    }

    if (showLabels) {
      ctx.font = `600 10px ${cssVar('--mono', 'monospace')}`;
      ctx.fillStyle = faint;
      ctx.textAlign = 'center';
      layout.rings.forEach((r, i) => {
        const count = layout.ringCounts[i + 1] ?? 0;
        ctx.fillText(`${i + 1} · ${count}`, cx, cy - r * scale - 7);
      });
    }

    if (hover) {
      const [x, y] = px(hover);
      const label = hover.depth === 0
        ? 'start'
        : `${MOVE_NAMES[hover.viaMove]} · ${hover.depth} move${hover.depth === 1 ? '' : 's'} away`;
      ctx.font = `500 12px ${cssVar('--sans', 'sans-serif')}`;
      const tw = ctx.measureText(label).width;
      const bx = Math.min(Math.max(x - tw / 2 - 8, 4), w - tw - 20);
      const by = Math.max(y - 32, 4);
      ctx.fillStyle = paper;
      ctx.strokeStyle = cssVar('--line-strong', '#bdb8a5');
      ctx.lineWidth = 1;
      roundRect(ctx, bx, by, tw + 16, 22, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.textAlign = 'left';
      ctx.fillText(label, bx + 8, by + 15);
    }
  }, [layout, view, hover, pathSet, pathEdges, selected, height, showLabels, themeTick]);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const nodeAt = (clientX: number, clientY: number): LaidOutNode | null => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !layout) return null;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const fit = layout.maxRadius > 0 ? Math.min(w, h) / (2 * layout.maxRadius + 44) : 1;
    const scale = fit * view.scale;
    const cx = w / 2 + view.ox;
    const cy = h / 2 + view.oy;
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    let best: LaidOutNode | null = null;
    let bestD = 13;
    for (const n of layout.nodes) {
      const d = Math.hypot(cx + n.x * scale - mx, cy + n.y * scale - my);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: dragRef.current ? 'grabbing' : hover ? 'pointer' : 'grab', touchAction: 'none' }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          dragRef.current = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
        }}
        onPointerMove={(e) => {
          if (dragRef.current) {
            const d = dragRef.current;
            setView((v) => ({ ...v, ox: d.ox + (e.clientX - d.x), oy: d.oy + (e.clientY - d.y) }));
            return;
          }
          const n = nodeAt(e.clientX, e.clientY);
          if (n?.id !== hover?.id) { setHover(n); onHover?.(n); }
        }}
        onPointerUp={(e) => {
          const moved = dragRef.current && Math.hypot(e.clientX - dragRef.current.x, e.clientY - dragRef.current.y) > 4;
          dragRef.current = null;
          if (!moved) {
            const n = nodeAt(e.clientX, e.clientY);
            if (n) onSelect?.(n);
          }
        }}
        onPointerLeave={() => { setHover(null); onHover?.(null); dragRef.current = null; }}
        onWheel={(e) => {
          e.preventDefault();
          setView((v) => ({ ...v, scale: Math.max(0.35, Math.min(6, v.scale * (e.deltaY > 0 ? 0.9 : 1.1))) }));
        }}
      />
      <div className="row tight" style={{ marginTop: 6, alignItems: 'center' }}>
        <button className="btn small ghost" onClick={() => setView({ scale: 1, ox: 0, oy: 0 })}>Reset view</button>
        {caption ? <span className="card-note">{caption}</span> : null}
        {layout?.truncated ? <span className="tag warn">truncated</span> : null}
      </div>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
