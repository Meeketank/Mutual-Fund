import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Crosshair, Lock, X } from 'lucide-react';
import { DAY_MS } from '../services/calc';
import { formatDateDisplay, formatDateShort } from '../services/amfiApi';

// Shared interaction layer for every time-series chart in the app:
//  - point selection: hover shows live values; click/tap locks a point, which
//    can then be stepped one data point at a time (buttons or arrow keys)
//  - date scaling: range slider, drag-to-zoom, zoom in/out around the selected
//    point, pan, presets and reset
//  - fine detail: daily ticks when zoomed in, dots on real points, and a
//    start -> end / high / low summary for the visible window

export interface TimeRow {
  t: number;
  [k: string]: any;
}

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
  /** Value for the panel (defaults to row[key]); can include carried-forward values. */
  getValue?: (row: TimeRow) => number | undefined;
  /** True when the value on this row was carried forward (no NAV that day). */
  isCarried?: (row: TimeRow) => boolean;
  format: (v: number) => string;
  /** How to express the change between two points. */
  change: 'pct' | 'pp' | 'abs-pct';
}

const MIN_POINTS = 3;

export function useChartZoom<T extends TimeRow>(data: T[], resetKey: string) {
  const last = Math.max(0, data.length - 1);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [locked, setLocked] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragTo, setDragTo] = useState<number | null>(null);
  const dragged = useRef(false);
  // Refs hold the live drag positions; mouse events can fire faster than React re-renders.
  const fromRef = useRef<number | null>(null);
  const toRef = useRef<number | null>(null);

  useEffect(() => {
    setRange(null);
    setLocked(null);
    setHover(null);
    setDragFrom(null);
    setDragTo(null);
  }, [resetKey]);

  const lo = range ? Math.max(0, Math.min(range[0], last)) : 0;
  const hi = range ? Math.max(lo, Math.min(range[1], last)) : last;
  const visible = useMemo(() => data.slice(lo, hi + 1), [data, lo, hi]);
  const isZoomed = lo > 0 || hi < last;

  const clampRange = useCallback(
    (a: number, b: number): [number, number] => {
      let s = Math.max(0, Math.min(a, b));
      let e = Math.min(last, Math.max(a, b));
      if (e - s < MIN_POINTS - 1) {
        const need = MIN_POINTS - 1 - (e - s);
        s = Math.max(0, s - Math.ceil(need / 2));
        e = Math.min(last, s + MIN_POINTS - 1);
        s = Math.max(0, e - (MIN_POINTS - 1));
      }
      return [s, e];
    },
    [last]
  );

  const setWindow = (a: number, b: number) => {
    const [s, e] = clampRange(a, b);
    setRange(s === 0 && e === last ? null : [s, e]);
  };

  /** Show the last `days` calendar days of data. */
  const showLastDays = (days: number) => {
    if (!data.length) return;
    const from = data[last].t - days * DAY_MS;
    const idx = data.findIndex(r => r.t >= from);
    setWindow(Math.max(0, idx), last);
  };

  const zoom = (factor: number) => {
    const size = hi - lo + 1;
    const newSize = Math.max(MIN_POINTS, Math.round(size * factor));
    const center = locked ?? Math.round((lo + hi) / 2);
    const s = Math.round(center - (newSize - 1) * ((center - lo) / Math.max(1, hi - lo)));
    setWindow(s, s + newSize - 1);
  };

  const pan = (dir: -1 | 1) => {
    const size = hi - lo;
    const shift = Math.max(1, Math.round(size / 2)) * dir;
    const s = Math.max(0, Math.min(last - size, lo + shift));
    setWindow(s, s + size);
  };

  const step = (dir: -1 | 1) => {
    const cur = locked ?? hover ?? (dir > 0 ? lo - 1 : hi + 1);
    const next = Math.max(0, Math.min(last, cur + dir));
    setLocked(next);
    if (next < lo || next > hi) {
      const size = hi - lo;
      const s = next < lo ? next : next - size;
      setWindow(s, s + size);
    }
  };

  // Recharts mouse handlers (indices from Recharts are relative to `visible`).
  const indexOf = (e: any): number | null => (e && typeof e.activeTooltipIndex === 'number' ? lo + e.activeTooltipIndex : null);
  const handlers = {
    onMouseDown: (e: any) => {
      const i = indexOf(e);
      dragged.current = false;
      fromRef.current = i;
      toRef.current = null;
      setDragFrom(i);
      setDragTo(null);
    },
    onMouseMove: (e: any) => {
      const i = indexOf(e);
      if (i === null) return;
      setHover(i);
      if (fromRef.current !== null && i !== fromRef.current) {
        dragged.current = true;
        toRef.current = i;
        setDragTo(i);
      }
    },
    onMouseUp: () => {
      const a = fromRef.current;
      const b = toRef.current;
      if (a !== null && b !== null && Math.abs(b - a) >= 1) setWindow(a, b);
      fromRef.current = null;
      toRef.current = null;
      setDragFrom(null);
      setDragTo(null);
    },
    onMouseLeave: () => {
      setHover(null);
      fromRef.current = null;
      toRef.current = null;
      setDragFrom(null);
      setDragTo(null);
    },
    onClick: (e: any) => {
      if (dragged.current) {
        dragged.current = false;
        return;
      }
      const i = indexOf(e);
      if (i === null) return;
      setLocked(prev => (prev === i ? null : i));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === '+' || e.key === '=') zoom(0.5);
    else if (e.key === '-') zoom(2);
    else if (e.key === 'Escape') setLocked(null);
    else return;
    e.preventDefault();
  };

  const activeIdx = locked ?? hover;
  const dragArea =
    dragFrom !== null && dragTo !== null && data[dragFrom] && data[dragTo] ? ([data[dragFrom].t, data[dragTo].t] as [number, number]) : null;

  return {
    data,
    lo,
    hi,
    last,
    visible,
    isZoomed,
    locked,
    activeIdx,
    activeRow: activeIdx !== null ? data[activeIdx] : null,
    prevRow: activeIdx !== null && activeIdx > 0 ? data[activeIdx - 1] : null,
    dragArea,
    handlers,
    onKeyDown,
    setWindow,
    showLastDays,
    zoom,
    pan,
    step,
    reset: () => setRange(null),
    clearLock: () => setLocked(null)
  };
}

export type ChartZoom = ReturnType<typeof useChartZoom>;

/** Ticks that adapt to the visible span: every day when zoomed in close. */
export function smartTicks(rows: TimeRow[], maxTicks = 7): number[] {
  if (rows.length === 0) return [];
  const min = rows[0].t;
  const max = rows[rows.length - 1].t;
  const spanDays = Math.round((max - min) / DAY_MS);
  if (spanDays <= maxTicks) return rows.map(r => r.t); // one tick per data point
  const out: number[] = [];
  const step = (max - min) / (maxTicks - 1);
  for (let i = 0; i < maxTicks; i++) {
    const d = new Date(min + step * i);
    out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
  }
  return Array.from(new Set(out));
}

export function spanTickFormatter(rows: TimeRow[]) {
  const span = rows.length > 1 ? (rows[rows.length - 1].t - rows[0].t) / DAY_MS : 0;
  return (t: number) => {
    const d = new Date(t);
    if (span > 400) return `${formatDateShort(d).slice(3)} ${String(d.getFullYear()).slice(2)}`;
    return formatDateShort(d);
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function changeText(s: SeriesDef, cur: number, prev: number): { text: string; sign: number } {
  const diff = cur - prev;
  if (s.change === 'pp') return { text: `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} pp`, sign: diff };
  const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : 0;
  if (s.change === 'pct') return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(3)}%`, sign: pct };
  return { text: `${diff >= 0 ? '+' : ''}${diff.toFixed(4)} (${pct >= 0 ? '+' : ''}${pct.toFixed(3)}%)`, sign: diff };
}

const val = (s: SeriesDef, row: TimeRow | null | undefined) => {
  if (!row) return undefined;
  const v = s.getValue ? s.getValue(row) : row[s.key];
  return typeof v === 'number' && isFinite(v) ? v : undefined;
};

/** Detail panel for the hovered or locked point, plus a summary of the visible window. */
export const PointPanel: React.FC<{ zoom: ChartZoom; series: SeriesDef[] }> = ({ zoom, series }) => {
  const row = zoom.activeRow;
  const prev = zoom.prevRow;
  const first = zoom.visible[0];
  const lastRow = zoom.visible[zoom.visible.length - 1];

  // Range summary starts expanded on wide screens, collapsed on phones.
  const [summaryOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(min-width: 901px)').matches);

  const summary = useMemo(
    () =>
      series
        .map(s => {
          const vals = zoom.visible.map(r => val(s, r)).filter((v): v is number => v !== undefined);
          if (vals.length === 0) return null;
          const start = vals[0];
          const end = vals[vals.length - 1];
          return { s, start, end, min: Math.min(...vals), max: Math.max(...vals), ch: changeText(s, end, start) };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [series, zoom.visible]
  );

  return (
    <div className="point-panel">
      <div className="point-panel-head">
        <div className="point-panel-date">
          {zoom.locked !== null ? <Lock size={12} /> : <Crosshair size={12} />}
          {row ? (
            <>
              {WEEKDAYS[new Date(row.t).getDay()]}, {formatDateDisplay(new Date(row.t))}
              {zoom.locked !== null && <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>Selected</span>}
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Hover, or tap a point to select it</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="icon-btn sm" onClick={() => zoom.step(-1)} aria-label="Previous point" title="Previous point (←)">
            <ChevronLeft size={16} />
          </button>
          <button className="icon-btn sm" onClick={() => zoom.step(1)} aria-label="Next point" title="Next point (→)">
            <ChevronRight size={16} />
          </button>
          {zoom.locked !== null && (
            <button className="icon-btn sm" onClick={zoom.clearLock} aria-label="Clear selection" title="Clear selection (Esc)">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {row && (
        <div className="point-panel-grid">
          {series.map(s => {
            const v = val(s, row);
            if (v === undefined) return null;
            const p = val(s, prev);
            const carried = s.isCarried?.(row);
            const ch = p !== undefined ? changeText(s, v, p) : null;
            return (
              <div key={s.key} className="point-panel-item">
                <span className="chart-hover-dot" style={{ backgroundColor: s.color }} />
                <span className="point-panel-name" title={s.name}>{s.name}</span>
                <span className="point-panel-value">
                  {s.format(v)}
                  {carried && <span title="No NAV published this day; previous NAV carried forward" style={{ color: 'var(--text-muted)', fontWeight: 400 }}> *</span>}
                </span>
                {ch && (
                  <span className={`point-panel-change ${carried ? 'val-muted' : ch.sign >= 0 ? 'val-positive' : 'val-negative'}`} title="Change from the previous point">
                    {ch.text}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {summary.length > 0 && first && lastRow && (
        <details className="point-panel-summary" open={summaryOpen}>
          <summary>
            Visible range: {formatDateDisplay(new Date(first.t))} → {formatDateDisplay(new Date(lastRow.t))} · {zoom.visible.length} points ·{' '}
            {Math.round((lastRow.t - first.t) / DAY_MS)} days
          </summary>
          <div className="table-wrapper" style={{ margin: '8px 0 0', boxShadow: 'none', maxHeight: 'none' }}>
            <table className="financial-table">
              <thead>
                <tr>
                  <th>Series</th>
                  <th style={{ textAlign: 'right' }}>Start</th>
                  <th style={{ textAlign: 'right' }}>End</th>
                  <th style={{ textAlign: 'right' }}>Change</th>
                  <th style={{ textAlign: 'right' }}>High</th>
                  <th style={{ textAlign: 'right' }}>Low</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(({ s, start, end, min, max, ch }) => (
                  <tr key={s.key}>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.name}>
                      <span className="chart-hover-dot" style={{ backgroundColor: s.color, display: 'inline-block', marginRight: 6 }} />
                      {s.name}
                    </td>
                    <td style={{ textAlign: 'right' }}>{s.format(start)}</td>
                    <td style={{ textAlign: 'right' }}>{s.format(end)}</td>
                    <td style={{ textAlign: 'right' }} className={ch.sign >= 0 ? 'val-positive' : 'val-negative'}>{ch.text}</td>
                    <td style={{ textAlign: 'right' }}>{s.format(max)}</td>
                    <td style={{ textAlign: 'right' }}>{s.format(min)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
};

/** Date-scaling controls: presets, zoom in/out, pan, reset and a two-handle range slider. */
export const ZoomBar: React.FC<{ zoom: ChartZoom; presets?: { label: string; days: number }[] }> = ({ zoom, presets }) => {
  const { data, lo, hi, last } = zoom;
  if (data.length < MIN_POINTS) return null;
  const pct = (i: number) => (last > 0 ? (i / last) * 100 : 0);
  return (
    <div className="zoom-bar">
      <div className="zoom-bar-row">
        {presets && presets.length > 0 && (
          <div className="segmented">
            {presets.map(p => {
              const from = data[last].t - p.days * DAY_MS;
              const idx = Math.max(0, data.findIndex(r => r.t >= from));
              const active = lo === idx && hi === last;
              return (
                <button key={p.label} className={active ? 'active' : ''} onClick={() => zoom.showLastDays(p.days)}>
                  {p.label}
                </button>
              );
            })}
            <button className={!zoom.isZoomed ? 'active' : ''} onClick={zoom.reset}>All</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button className="icon-btn sm" onClick={() => zoom.pan(-1)} disabled={lo === 0} aria-label="Pan back in time" title="Pan back">
            <ChevronLeft size={16} />
          </button>
          <button className="icon-btn sm" onClick={() => zoom.zoom(0.5)} disabled={hi - lo + 1 <= MIN_POINTS} aria-label="Zoom in" title="Zoom in (+)">
            <ZoomIn size={16} />
          </button>
          <button className="icon-btn sm" onClick={() => zoom.zoom(2)} disabled={!zoom.isZoomed} aria-label="Zoom out" title="Zoom out (−)">
            <ZoomOut size={16} />
          </button>
          <button className="icon-btn sm" onClick={zoom.reset} disabled={!zoom.isZoomed} aria-label="Reset zoom" title="Show everything">
            <Maximize2 size={14} />
          </button>
          <button className="icon-btn sm" onClick={() => zoom.pan(1)} disabled={hi === last} aria-label="Pan forward in time" title="Pan forward">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="zoom-bar-dates">
        <span>{formatDateDisplay(new Date(data[lo].t))}</span>
        <span>{formatDateDisplay(new Date(data[hi].t))}</span>
      </div>
      <div className="dual-slider-track">
        <div className="dual-slider-fill" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input
          type="range"
          min={0}
          max={last}
          value={lo}
          onChange={e => zoom.setWindow(Math.min(Number(e.target.value), hi - (MIN_POINTS - 1)), hi)}
          className="dual-slider-input"
          aria-label="Range start"
        />
        <input
          type="range"
          min={0}
          max={last}
          value={hi}
          onChange={e => zoom.setWindow(lo, Math.max(Number(e.target.value), lo + (MIN_POINTS - 1)))}
          className="dual-slider-input"
          aria-label="Range end"
        />
      </div>
      <div className="zoom-bar-hint">Drag across the chart to zoom into dates · tap a point to select it · ← → step · + − zoom</div>
    </div>
  );
};
