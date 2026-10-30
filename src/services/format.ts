// Display helpers. All of them render "—" for missing values so a fund
// without enough history never shows a fake 0.00%.

export const DASH = '—';

export function fmtPct(v: number | null | undefined, dp = 2, sign = true): string {
  if (v === null || v === undefined || !isFinite(v)) return DASH;
  const s = v.toFixed(dp);
  if (sign && v > 0 && Number(s) !== 0) return `+${s}%`;
  return `${Number(s) === 0 ? (0).toFixed(dp) : s}%`;
}

export function fmtNav(v: number | null | undefined, dp = 4): string {
  if (v === null || v === undefined || !isFinite(v) || v <= 0) return DASH;
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export function fmtINR(v: number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || !isFinite(v)) return DASH;
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export function pctClass(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return 'val-muted';
  return v >= 0 ? 'val-positive' : 'val-negative';
}

/** Short fund label for chips/legends: drops plan/option suffixes. */
export function shortName(name: string, max = 34): string {
  const base = name.split(/\s+-\s+/)[0].trim() || name;
  return base.length > max ? `${base.slice(0, max - 1)}…` : base;
}

export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (c: string | number | null | undefined) => {
    if (c === null || c === undefined) return '';
    const s = String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
