// Shared, pure calculation helpers. Every page uses these so the same number
// (e.g. "30D return") is computed the same way everywhere.
//
// Conventions (match how AMCs / AMFI report returns):
// - A NAV "on" a date means the latest published NAV on or before that date.
// - Point-to-point returns are measured from the end NAV's actual date.
// - Periods under 1 year are annualised with the SEBI "simple annualised"
//   method: absolute% x 365 / days. Periods of 1 year or more use CAGR.
// - Day counts are the real calendar days between the two NAV dates.

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface NavPoint {
  date: string; // DD-MM-YYYY (as published by AMFI)
  nav: number;
  parsedDate: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in local time (never UTC, so IST mornings don't shift a day). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse YYYY-MM-DD as local midnight. Returns Invalid Date on bad input. */
export function parseISODate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Parse AMFI's DD-MM-YYYY as local midnight. */
export function parseAMFIDate(s: string): Date {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s || '');
  if (!m) return new Date(NaN);
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function shiftISODate(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole calendar days between two local dates (DST-safe). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** End of the given local day, so "on or before 5 Aug" includes 5 Aug. */
export function endOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/** Index of the last point at or before `time` in an ascending series, or -1. */
export function findOnOrBefore(asc: NavPoint[], time: number): number {
  let lo = 0;
  let hi = asc.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (asc[mid].parsedDate.getTime() <= time) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Index of the first point at or after `time` in an ascending series, or -1. */
export function findOnOrAfter(asc: NavPoint[], time: number): number {
  let lo = 0;
  let hi = asc.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (asc[mid].parsedDate.getTime() >= time) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

export const round = (v: number, dp = 2) => {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
};

export function absoluteReturnPct(startNav: number, endNav: number): number | null {
  if (!(startNav > 0) || !(endNav > 0)) return null;
  return ((endNav - startNav) / startNav) * 100;
}

/** Simple annualised return (SEBI convention for periods under 1 year). */
export function simpleAnnualisedPct(absPct: number | null, days: number): number | null {
  if (absPct === null || !isFinite(absPct) || days <= 0) return null;
  return (absPct * 365) / days;
}

/** Compound annual growth rate. */
export function cagrPct(startNav: number, endNav: number, days: number): number | null {
  if (!(startNav > 0) || !(endNav > 0) || days <= 0) return null;
  return (Math.pow(endNav / startNav, 365 / days) - 1) * 100;
}

/** Annualise using the right convention for the period length. */
export function annualisedPct(startNav: number, endNav: number, days: number): number | null {
  if (days >= 365) return cagrPct(startNav, endNav, days);
  return simpleAnnualisedPct(absoluteReturnPct(startNav, endNav), days);
}

export interface PeriodReturn {
  absolute: number;
  annualised: number;
  startNav: number;
  endNav: number;
  startDate: Date;
  endDate: Date;
  days: number;
}

/**
 * Point-to-point return over `lookbackDays` ending on/before `endTime`.
 * Returns null when the fund's history doesn't reach back far enough, rather
 * than silently using a shorter period.
 */
export function periodReturn(asc: NavPoint[], endTime: number, lookbackDays: number): PeriodReturn | null {
  const endIdx = findOnOrBefore(asc, endTime);
  if (endIdx < 0) return null;
  const end = asc[endIdx];
  const startTarget = end.parsedDate.getTime() - lookbackDays * DAY_MS;
  const startIdx = findOnOrBefore(asc, startTarget);
  if (startIdx < 0 || startIdx >= endIdx) return null;
  const start = asc[startIdx];
  // Don't accept a start NAV that is far older than requested (data gaps).
  const days = daysBetween(start.parsedDate, end.parsedDate);
  if (days > lookbackDays + Math.max(7, lookbackDays * 0.1)) return null;
  const absolute = absoluteReturnPct(start.nav, end.nav);
  const annualised = annualisedPct(start.nav, end.nav, days);
  if (absolute === null || annualised === null) return null;
  return {
    absolute,
    annualised,
    startNav: start.nav,
    endNav: end.nav,
    startDate: start.parsedDate,
    endDate: end.parsedDate,
    days
  };
}

/** Return between two arbitrary dates (NAV on/before each). */
export function returnBetween(asc: NavPoint[], fromTime: number, toTime: number): PeriodReturn | null {
  const endIdx = findOnOrBefore(asc, toTime);
  let startIdx = findOnOrBefore(asc, fromTime);
  if (startIdx < 0) startIdx = findOnOrAfter(asc, fromTime); // range starts before first NAV
  if (endIdx < 0 || startIdx < 0 || startIdx >= endIdx) return null;
  const start = asc[startIdx];
  const end = asc[endIdx];
  const days = daysBetween(start.parsedDate, end.parsedDate);
  const absolute = absoluteReturnPct(start.nav, end.nav);
  const annualised = annualisedPct(start.nav, end.nav, days);
  if (absolute === null || annualised === null) return null;
  return { absolute, annualised, startNav: start.nav, endNav: end.nav, startDate: start.parsedDate, endDate: end.parsedDate, days };
}

export interface DailyRow {
  iso: string;
  date: Date;
  /** NAV on/before this day, or undefined before the first published NAV. */
  nav: number | undefined;
  /** True when no NAV was published on this exact day (weekend/holiday carry-forward). */
  carried: boolean;
}

/** Calendar-day series from `fromTime` to `toTime` with NAV carried FORWARD from the previous published day. */
export function dailyCarryForward(asc: NavPoint[], fromTime: number, toTime: number): DailyRow[] {
  const rows: DailyRow[] = [];
  if (asc.length === 0) return rows;
  const from = new Date(fromTime);
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let idx = findOnOrBefore(asc, endOfDay(cur));
  while (cur.getTime() <= toTime) {
    const eod = endOfDay(cur);
    while (idx + 1 < asc.length && asc[idx + 1].parsedDate.getTime() <= eod) idx++;
    const pt = idx >= 0 ? asc[idx] : undefined;
    rows.push({
      iso: toISODate(cur),
      date: new Date(cur),
      nav: pt?.nav,
      carried: !pt || toISODate(pt.parsedDate) !== toISODate(cur)
    });
    cur.setDate(cur.getDate() + 1);
  }
  return rows;
}

export interface RiskStats {
  volatility: number; // annualised std-dev of period returns, %
  maxDrawdown: number; // most negative peak-to-trough, % (<= 0)
  observations: number;
}

/** Volatility and max drawdown over [fromTime, toTime]. */
export function riskStats(asc: NavPoint[], fromTime: number, toTime: number): RiskStats | null {
  const s = findOnOrAfter(asc, fromTime);
  const e = findOnOrBefore(asc, toTime);
  if (s < 0 || e < 0 || e - s < 10) return null;
  const rets: number[] = [];
  let peak = asc[s].nav;
  let mdd = 0;
  for (let i = s + 1; i <= e; i++) {
    const prev = asc[i - 1].nav;
    const cur = asc[i].nav;
    if (prev > 0) rets.push(cur / prev - 1);
    if (cur > peak) peak = cur;
    const dd = (cur / peak - 1) * 100;
    if (dd < mdd) mdd = dd;
  }
  const n = rets.length;
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const years = daysBetween(asc[s].parsedDate, asc[e].parsedDate) / 365;
  const obsPerYear = years > 0 ? n / years : 252;
  return { volatility: Math.sqrt(variance) * Math.sqrt(obsPerYear) * 100, maxDrawdown: mdd, observations: n };
}

export interface CashFlow {
  amount: number; // negative = investment, positive = redemption/value
  date: Date;
}

/** XIRR in % using Newton's method with a bisection fallback. Null if it can't converge. */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasNeg = flows.some(f => f.amount < 0);
  const hasPos = flows.some(f => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  const t0 = flows[0].date.getTime();
  const yrs = flows.map(f => (f.date.getTime() - t0) / (365 * DAY_MS));
  const npv = (r: number) => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, yrs[i]), 0);
  const dnpv = (r: number) => flows.reduce((s, f, i) => s - (yrs[i] * f.amount) / Math.pow(1 + r, yrs[i] + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(r);
    const df = dnpv(r);
    if (!isFinite(f) || !isFinite(df) || Math.abs(df) < 1e-12) break;
    const next = r - f / df;
    if (!isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-9) return next * 100;
    r = next;
  }

  // Bisection fallback
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-10) return mid * 100;
    if (flo * fm < 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return ((lo + hi) / 2) * 100;
}

export interface SipResult {
  installments: number;
  invested: number;
  units: number;
  currentValue: number;
  gain: number;
  absoluteReturn: number;
  xirr: number | null;
  firstDate: Date;
  valueDate: Date;
}

/**
 * Monthly SIP of `amount` on the start date's day-of-month, bought at the
 * first NAV on or after each instalment date, valued at the last NAV on or
 * before `toTime`.
 */
export function simulateSip(asc: NavPoint[], fromTime: number, toTime: number, amount = 10000): SipResult | null {
  if (asc.length === 0 || amount <= 0) return null;
  const endIdx = findOnOrBefore(asc, toTime);
  if (endIdx < 0) return null;
  const valuePt = asc[endIdx];
  const start = new Date(fromTime);
  const dom = start.getDate();
  const flows: CashFlow[] = [];
  let units = 0;
  let firstDate: Date | null = null;
  for (let k = 0; k < 1200; k++) {
    // Clamp day-of-month (e.g. 31st -> 30th/28th) instead of overflowing into next month.
    const y = start.getFullYear();
    const m = start.getMonth() + k;
    const lastDom = new Date(y, m + 1, 0).getDate();
    const inst = new Date(y, m, Math.min(dom, lastDom));
    if (inst.getTime() > valuePt.parsedDate.getTime()) break;
    const idx = findOnOrAfter(asc, inst.getTime());
    if (idx < 0 || idx > endIdx) break;
    const buy = asc[idx];
    units += amount / buy.nav;
    flows.push({ amount: -amount, date: buy.parsedDate });
    if (!firstDate) firstDate = buy.parsedDate;
  }
  if (flows.length < 2 || !firstDate) return null;
  const currentValue = units * valuePt.nav;
  const invested = flows.length * amount;
  flows.push({ amount: currentValue, date: valuePt.parsedDate });
  return {
    installments: flows.length - 1,
    invested,
    units,
    currentValue,
    gain: currentValue - invested,
    absoluteReturn: ((currentValue - invested) / invested) * 100,
    xirr: xirr(flows),
    firstDate,
    valueDate: valuePt.parsedDate
  };
}

/** Standard competition ranking ("1224"): ties share a rank. Higher is better; nulls rank last. */
export function competitionRanks<T>(items: T[], value: (t: T) => number | null, key: (t: T) => number): Map<number, number> {
  const sorted = [...items].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  });
  const map = new Map<number, number>();
  let lastVal: number | null | undefined;
  let lastRank = 0;
  sorted.forEach((it, i) => {
    const v = value(it);
    const r = v !== null && lastVal !== undefined && lastVal !== null && round(v, 4) === round(lastVal, 4) ? lastRank : i + 1;
    map.set(key(it), r);
    lastVal = v;
    lastRank = r;
  });
  return map;
}

// ---------------------------------------------------------------------------
// Chart alignment
// ---------------------------------------------------------------------------
// Different schemes publish on different days: liquid/overnight funds publish
// every calendar day, equity funds only on business days, and holidays differ.
// Plotting them together naively leaves holes. Instead every series is put on
// one shared date grid (the union of all published dates) and a missing day
// takes the scheme's last published NAV — which is the NAV an investor would
// actually transact at. Days before a scheme's first NAV stay empty.

export interface AlignedSeriesInput {
  key: string;
  asc: NavPoint[];
}

export interface AlignedRow {
  t: number;
  [key: string]: number | boolean | undefined;
}

/** Flag column: true when the fund published no NAV on that date. */
export const carriedKey = (key: string) => `${key}__c`;
/** Value column including carried-forward days (for tooltips / hover panels). */
export const valueKey = (key: string) => `${key}__v`;

/**
 * Builds rows on the union of published dates in [fromTime, toTime].
 *
 * row[key]           value only on days the fund really published -> the line is
 *                    drawn through real NAVs only (use connectNulls), so it flows
 *                    smoothly Friday -> Monday instead of showing flat weekend shelves.
 * row[valueKey(key)] value on every date, carrying the last NAV forward -> what the
 *                    tooltip shows for a weekend/holiday (flagged by carriedKey).
 * mode 'nav'     -> the NAV itself
 * mode 'rebased' -> NAV / NAV-on-range-start x 100 (same base date for all)
 * mode 'rolling' -> rolling N-day simple annualised return ending on that date
 */
export function alignSeries(
  series: AlignedSeriesInput[],
  fromTime: number,
  toTime: number,
  mode: 'nav' | 'rebased' | 'rolling' = 'nav',
  rollingDays = 30
): AlignedRow[] {
  const dates = new Set<number>();
  series.forEach(s => {
    const a = findOnOrAfter(s.asc, fromTime);
    if (a < 0) return;
    for (let i = a; i < s.asc.length && s.asc[i].parsedDate.getTime() <= toTime; i++) dates.add(s.asc[i].parsedDate.getTime());
  });
  const grid = Array.from(dates).sort((x, y) => x - y);
  if (grid.length === 0) return [];

  const rows: AlignedRow[] = grid.map(t => ({ t }));
  series.forEach(s => {
    if (s.asc.length === 0) return;
    // Common base: NAV on/before the range start, else the fund's first NAV in range.
    let baseIdx = findOnOrBefore(s.asc, fromTime);
    if (baseIdx < 0) baseIdx = findOnOrAfter(s.asc, fromTime);
    const base = baseIdx >= 0 ? s.asc[baseIdx].nav : NaN;
    const ck = carriedKey(s.key);
    let p = findOnOrBefore(s.asc, grid[0] - 1);
    rows.forEach(row => {
      const t = row.t;
      while (p + 1 < s.asc.length && s.asc[p + 1].parsedDate.getTime() <= t) p++;
      if (p < 0) return; // before this fund's first NAV
      const pt = s.asc[p];
      const carried = pt.parsedDate.getTime() !== t;
      let v: number | null;
      if (mode === 'nav') v = pt.nav;
      else if (mode === 'rebased') v = base > 0 ? (pt.nav / base) * 100 : null;
      else v = periodReturn(s.asc, endOfDay(new Date(t)), rollingDays)?.annualised ?? null;
      if (v === null || !isFinite(v)) return;
      const rounded = Math.round(v * 10000) / 10000;
      if (!carried) row[s.key] = rounded;
      row[valueKey(s.key)] = rounded;
      row[ck] = carried;
    });
  });
  return rows;
}

/** Evenly spaced, day-aligned ticks for a time axis. */
export function timeTicks(min: number, max: number, count = 6): number[] {
  if (!isFinite(min) || !isFinite(max) || max <= min) return isFinite(min) ? [min] : [];
  const step = (max - min) / (count - 1);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(min + step * i);
    out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
  }
  return Array.from(new Set(out));
}
