/**
 * Distance shells: one ring per distance from solved, drawn so you can see
 * where the mass of the puzzle actually lives.
 *
 * For the 3x3x3 the counts are the published ones; for the 2x2x2 they are
 * counted in your browser. Either way the shape is the striking part - almost
 * every position sits at distance 17 or 18, and the famous 20-move positions
 * are a vanishing sliver at the edge.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shellLayout, type ShellSpec } from './layout';
import { formatApprox } from '../components/ui';

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const RING_COLORS = ['--u', '--f', '--r', '--b', '--d', '--l'];

export function ShellCanvas({ spec, height = 420, highlight, onHighlight, subtitle }: {
  spec: ShellSpec[];
  height?: number;
  highlight?: number | null;
  onHighlight?: (distance: number | null) => void;
  subtitle?: string;
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => setTick((t) => t + 1);
    mq.addEventListener('change', onChange);
    return () => { obs.disconnect(); mq.removeEventListener('change', onChange); };
  }, []);

  const layout = useMemo(() => shellLayout(spec, 300), [spec]);
  const active = highlight ?? hover;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wrap.clientWidth;
    canvas.width = w * dpr; canvas.height = height * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);

    const graphite = cssVar('--graphite', '#8a8574');
    const ink = cssVar('--ink', '#2d2b24');
    const paper = cssVar('--paper-raised', '#fbfaf5');
    const accent = cssVar('--accent', '#1c6b3f');

    const scale = Math.min(w, height) / (2 * layout.maxRadius + 56);
    const cx = w / 2;
    const cy = height / 2;

    for (const shell of layout.shells) {
      const isActive = active === shell.distance;
      ctx.beginPath();
      ctx.arc(cx, cy, shell.radius * scale, 0, Math.PI * 2);
      ctx.strokeStyle = isActive ? accent : graphite;
      ctx.globalAlpha = isActive ? 0.8 : 0.26;
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const color = cssVar(RING_COLORS[shell.distance % RING_COLORS.length], '#888');
      for (const d of shell.dots) {
        ctx.beginPath();
        ctx.arc(cx + d.x * scale, cy + d.y * scale, isActive ? 4.5 : 3.2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = isActive ? 1 : 0.85;
        ctx.fill();
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = paper;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Centre marker: the solved state.
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.strokeStyle = paper;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (active !== null && active !== undefined) {
      const shell = layout.shells.find((s) => s.distance === active);
      if (shell) {
        const label = `${shell.distance} move${shell.distance === 1 ? '' : 's'} · ${formatApprox(shell.count)} positions${shell.exact ? '' : ' (estimate)'}`;
        ctx.font = `500 12px ${cssVar('--sans', 'sans-serif')}`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = paper;
        ctx.strokeStyle = cssVar('--line-strong', '#bdb8a5');
        ctx.lineWidth = 1;
        const bx = Math.max(6, cx - tw / 2 - 9);
        ctx.beginPath();
        ctx.roundRect?.(bx, 8, tw + 18, 24, 7);
        if (!ctx.roundRect) ctx.rect(bx, 8, tw + 18, 24);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = ink;
        ctx.fillText(label, bx + 9, 24);
      }
    }
  }, [layout, height, active, tick]);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = Math.min(rect.width, height) / (2 * layout.maxRadius + 56);
          const dx = e.clientX - rect.left - rect.width / 2;
          const dy = e.clientY - rect.top - height / 2;
          const r = Math.hypot(dx, dy) / scale;
          let best: number | null = null;
          let bestD = 18;
          for (const s of layout.shells) {
            const d = Math.abs(s.radius - r);
            if (d < bestD) { bestD = d; best = s.distance; }
          }
          setHover(best);
          onHighlight?.(best);
        }}
        onPointerLeave={() => { setHover(null); onHighlight?.(null); }}
      />
      {subtitle ? <div className="card-note" style={{ marginTop: 6 }}>{subtitle}</div> : null}
    </div>
  );
}
