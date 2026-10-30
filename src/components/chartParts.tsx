import React from 'react';
import { carriedKey } from '../services/calc';
import { formatDateShort } from '../services/amfiApi';

/**
 * Line dot that only renders on days the scheme actually published a NAV.
 * Carried-forward days (weekends/holidays) are part of the line but get no dot,
 * so real data points stay distinguishable.
 */
export function realDot(dataKey: string, color: string, r = 2.5) {
  return (props: any) => {
    const { cx, cy, payload, index } = props;
    if (cx === undefined || cy === undefined || !payload || payload[carriedKey(dataKey)]) {
      return <g key={`d-${dataKey}-${index}`} />;
    }
    return <circle key={`d-${dataKey}-${index}`} cx={cx} cy={cy} r={r} fill={color} stroke="none" />;
  };
}

/** Tick label for a time axis: "05 Aug", or "Aug 26" for multi-year spans. */
export function timeTickFormatter(spanDays: number) {
  return (t: number) => {
    const d = new Date(t);
    return spanDays > 400 ? `${formatDateShort(d).slice(3)} ${String(d.getFullYear()).slice(2)}` : formatDateShort(d);
  };
}
