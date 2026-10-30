import { MFSearchResult, MFDetailResponse, PinnedFund, GranularNAVRow, NavHistoryPoint } from '../types/mf';
import {
  DAY_MS,
  daysBetween,
  dailyCarryForward,
  endOfDay,
  findOnOrBefore,
  parseAMFIDate,
  parseISODate,
  periodReturn,
  riskStats,
  cagrPct,
  round
} from './calc';

export { parseAMFIDate } from './calc';

const API_BASE = 'https://api.mfapi.in/mf';
const CACHE_TTL_MS = 15 * 60 * 1000; // NAVs update once a day; 15 min is plenty fresh

export const DEFAULT_SCHEME_CODES: { schemeCode: number; name: string }[] = [];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "05 Aug 2026". Accepts a Date, DD-MM-YYYY or YYYY-MM-DD. */
export function formatDateDisplay(input: string | Date): string {
  let d: Date;
  if (input instanceof Date) d = input;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) d = parseISODate(input);
  else d = parseAMFIDate(input);
  if (isNaN(d.getTime())) return typeof input === 'string' ? input : '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "05 Aug" — compact label for chart axes. */
export function formatDateShort(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

async function fetchJSON(url: string, timeoutMs = 20000, retries = 1): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
}

let allSchemesCache: MFSearchResult[] | null = null;
const fundDetailsCache = new Map<number, { fund: PinnedFund; at: number }>();

export async function fetchAllSchemes(): Promise<MFSearchResult[]> {
  if (allSchemesCache) return allSchemesCache;
  try {
    const data = await fetchJSON(API_BASE, 30000);
    allSchemesCache = (data as any[]).map(item => ({ schemeCode: item.schemeCode, schemeName: item.schemeName }));
    return allSchemesCache;
  } catch (err) {
    console.error('Error fetching scheme list:', err);
    return [];
  }
}

export async function searchSchemes(query: string): Promise<MFSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const isNumeric = /^\d+$/.test(q);

  if (isNumeric) {
    const detail = await fetchFundDetail(Number(q)).catch(() => null);
    if (detail && !detail.loadError) return [{ schemeCode: detail.schemeCode, schemeName: detail.schemeName }];
  }

  try {
    const data = await fetchJSON(`${API_BASE}/search?q=${encodeURIComponent(query.trim())}`, 15000, 0);
    if (Array.isArray(data) && data.length > 0) {
      return data.slice(0, 50).map((item: any) => ({ schemeCode: item.schemeCode, schemeName: item.schemeName }));
    }
  } catch (e) {
    console.warn('Live search failed, falling back to full directory', e);
  }

  // Fallback: every word must appear somewhere in the name.
  const words = q.split(/\s+/);
  const list = await fetchAllSchemes();
  return list
    .filter(s => (isNumeric ? String(s.schemeCode).includes(q) : words.every(w => s.schemeName.toLowerCase().includes(w))))
    .slice(0, 50);
}

function errorFund(schemeCode: number, message: string, name?: string): PinnedFund {
  return {
    schemeCode,
    schemeName: name || `Scheme ${schemeCode}`,
    isin: '-',
    amc: '-',
    category: '-',
    schemeType: '-',
    launchDate: '-',
    latestNav: 0,
    navAsOf: '-',
    latestNavDate: null,
    prevNav: null,
    dayChange: null,
    dayChangePct: null,
    isStale: false,
    historicalData: [],
    historyAsc: [],
    return7d: null,
    return15d: null,
    return30d: null,
    return7dAnn: null,
    return15dAnn: null,
    return30dAnn: null,
    return3m: null,
    return6m: null,
    return1y: null,
    return3y: null,
    return5y: null,
    returnSinceStart: null,
    volatility1y: null,
    maxDrawdown1y: null,
    loadError: message
  };
}

/** Turn a raw mfapi response into a fully computed fund. Exported for tests. */
export function buildFund(json: MFDetailResponse, schemeCode: number, now = new Date()): PinnedFund {
  const meta = json.meta || ({} as MFDetailResponse['meta']);
  const rawData = Array.isArray(json.data) ? json.data : [];

  // Parse, drop bad/zero NAVs, de-duplicate dates (keep the last one listed).
  const byDate = new Map<string, NavHistoryPoint>();
  for (const d of rawData) {
    const nav = parseFloat(d.nav);
    const parsedDate = parseAMFIDate(d.date);
    if (!(nav > 0) || isNaN(parsedDate.getTime())) continue;
    if (!byDate.has(d.date)) byDate.set(d.date, { date: d.date, nav, parsedDate });
  }
  const historyAsc = Array.from(byDate.values()).sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

  if (historyAsc.length === 0) {
    return errorFund(schemeCode, 'AMFI returned no NAV history for this scheme', meta.scheme_name);
  }

  const historicalData = [...historyAsc].reverse();
  const latest = historyAsc[historyAsc.length - 1];
  const prev = historyAsc.length > 1 ? historyAsc[historyAsc.length - 2] : null;
  const first = historyAsc[0];
  const endT = latest.parsedDate.getTime();

  const pr = (days: number) => periodReturn(historyAsc, endT, days);
  const r7 = pr(7);
  const r15 = pr(15);
  const r30 = pr(30);
  const r1y = pr(365);
  const r3y = pr(365 * 3);
  const r5y = pr(365 * 5);
  const sinceDays = daysBetween(first.parsedDate, latest.parsedDate);
  const risk = riskStats(historyAsc, endT - 365 * DAY_MS, endT);

  const r2 = (v: number | null | undefined) => (v === null || v === undefined ? null : round(v, 2));

  return {
    schemeCode: meta.scheme_code || schemeCode,
    schemeName: meta.scheme_name || `Scheme ${schemeCode}`,
    isin: meta.isin_growth || meta.isin_div_reinvestment || '-',
    amc: meta.fund_house || '-',
    category: meta.scheme_category || '-',
    schemeType: meta.scheme_type || '-',
    launchDate: formatDateDisplay(first.parsedDate),
    latestNav: latest.nav,
    navAsOf: formatDateDisplay(latest.parsedDate),
    latestNavDate: latest.parsedDate,
    prevNav: prev ? prev.nav : null,
    dayChange: prev ? round(latest.nav - prev.nav, 4) : null,
    dayChangePct: prev ? r2(((latest.nav - prev.nav) / prev.nav) * 100) : null,
    isStale: daysBetween(latest.parsedDate, now) > 5,
    historicalData,
    historyAsc,
    return7d: r2(r7?.absolute),
    return15d: r2(r15?.absolute),
    return30d: r2(r30?.absolute),
    return7dAnn: r2(r7?.annualised),
    return15dAnn: r2(r15?.annualised),
    return30dAnn: r2(r30?.annualised),
    return3m: r2(pr(91)?.absolute),
    return6m: r2(pr(182)?.absolute),
    return1y: r2(r1y?.absolute),
    return3y: r2(r3y?.annualised),
    return5y: r2(r5y?.annualised),
    returnSinceStart: sinceDays >= 365 ? r2(cagrPct(first.nav, latest.nav, sinceDays)) : null,
    volatility1y: r2(risk?.volatility),
    maxDrawdown1y: r2(risk?.maxDrawdown)
  };
}

/** Fetch & compute a fund. Results are cached for 15 minutes; pass force=true to bypass. */
export async function fetchFundDetail(schemeCode: number, force = false): Promise<PinnedFund> {
  const cached = fundDetailsCache.get(schemeCode);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS && !cached.fund.loadError) {
    return cached.fund;
  }
  try {
    const json: MFDetailResponse = await fetchJSON(`${API_BASE}/${schemeCode}`);
    const fund = buildFund(json, schemeCode);
    fundDetailsCache.set(schemeCode, { fund, at: Date.now() });
    return fund;
  } catch (err: any) {
    console.warn(`Failed to load scheme ${schemeCode}`, err);
    // Keep showing the last good copy if we have one.
    if (cached && !cached.fund.loadError) return cached.fund;
    return errorFund(schemeCode, err?.name === 'AbortError' ? 'Request timed out' : 'Network error while loading');
  }
}

/** Daily rows (weekends/holidays carry the previous NAV) with rolling returns. Newest first. */
export function generateAMCNAVRows(fund: PinnedFund, limit = 100): GranularNAVRow[] {
  const asc = fund.historyAsc;
  if (asc.length === 0 || !fund.latestNavDate) return [];
  const toT = endOfDay(fund.latestNavDate);
  // One extra day so the oldest displayed row still has an "opening" NAV.
  const fromT = toT - limit * DAY_MS;
  const days = dailyCarryForward(asc, fromT, toT).filter(d => d.nav !== undefined);

  const rows: GranularNAVRow[] = [];
  for (let i = days.length - 1; i >= 1 && rows.length < limit; i--) {
    const cur = days[i];
    const prev = days[i - 1];
    const closing = cur.nav!;
    const opening = prev.nav!;
    const delta = round(closing - opening, 4);
    const t = endOfDay(cur.date);
    const r7 = periodReturn(asc, t, 7);
    const r15 = periodReturn(asc, t, 15);
    const r30 = periodReturn(asc, t, 30);
    const r2 = (v: number | undefined) => (v === undefined ? null : round(v, 2));
    rows.push({
      id: `${fund.schemeCode}-${cur.iso}`,
      fundName: fund.schemeName,
      date: formatDateDisplay(cur.date),
      iso: cur.iso,
      isCarried: cur.carried,
      nav: closing,
      openingNav: opening,
      closingNav: closing,
      delta,
      deltaPercent: opening > 0 ? round(((closing - opening) / opening) * 100, 4) : 0,
      rollingReturn7d: r2(r7?.absolute),
      rollingReturn15d: r2(r15?.absolute),
      rollingReturn30d: r2(r30?.absolute),
      rollingReturn7dAnn: r2(r7?.annualised),
      rollingReturn15dAnn: r2(r15?.annualised),
      rollingReturn30dAnn: r2(r30?.annualised)
    });
  }
  return rows;
}

/** NAV on or before a YYYY-MM-DD date. */
export function getNavOnDate(fund: PinnedFund, targetISO: string): { nav: number; date: string; parsedDate: Date } | null {
  if (!targetISO || fund.historyAsc.length === 0) return null;
  const target = parseISODate(targetISO);
  if (isNaN(target.getTime())) return null;
  const idx = findOnOrBefore(fund.historyAsc, endOfDay(target));
  if (idx < 0) return null;
  const pt = fund.historyAsc[idx];
  return { nav: pt.nav, date: formatDateDisplay(pt.parsedDate), parsedDate: pt.parsedDate };
}
