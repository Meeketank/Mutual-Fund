import {
  MFSearchResult,
  MFDetailResponse,
  PinnedFund,
  GranularNAVRow,
  RankingRow
} from '../types/mf';

const API_BASE = 'https://api.mfapi.in/mf';

export const DEFAULT_SCHEME_CODES = [
  { schemeCode: 120503, name: 'Aditya Birla Sun Life Money Manager Fund - Growth - Direct Plan' },
  { schemeCode: 147820, name: 'Axis Money Market Fund - Direct Plan - Growth Option' },
  { schemeCode: 120716, name: 'Bandhan Money Manager Fund - Direct Plan - Growth' },
  { schemeCode: 120594, name: 'ICICI Prudential Money Market Fund - Direct Plan - Growth' },
  { schemeCode: 120194, name: 'Kotak Money Market Scheme - Direct Plan - Growth' },
  { schemeCode: 119800, name: 'Nippon India Money Market Fund - Direct Plan Growth Option' },
  { schemeCode: 120739, name: 'UTI Money Market Fund - Direct Plan - Growth Option' },
  { schemeCode: 120349, name: 'HSBC Liquid Fund - Direct Plan - Growth' },
  { schemeCode: 119253, name: 'Baroda BNP Paribas Liquid Fund - Direct Plan - Growth' }
];

export function parseAMFIDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return new Date(dateStr);
}

export function formatDateDisplay(dateStrOrObj: string | Date): string {
  const d = typeof dateStrOrObj === 'string' ? parseAMFIDate(dateStrOrObj) : dateStrOrObj;
  if (isNaN(d.getTime())) return typeof dateStrOrObj === 'string' ? dateStrOrObj : '';
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

let allSchemesCache: MFSearchResult[] | null = null;
const fundDetailsCache: Map<number, PinnedFund> = new Map();

export async function fetchAllSchemes(): Promise<MFSearchResult[]> {
  if (allSchemesCache) return allSchemesCache;
  try {
    const res = await fetch(`${API_BASE}`);
    if (!res.ok) throw new Error('Failed to fetch scheme directory');
    const data = await res.json();
    allSchemesCache = data.map((item: any) => ({
      schemeCode: item.schemeCode,
      schemeName: item.schemeName
    }));
    return allSchemesCache || [];
  } catch (err) {
    console.error('Error fetching scheme list:', err);
    return DEFAULT_SCHEME_CODES.map(d => ({ schemeCode: d.schemeCode, schemeName: d.name }));
  }
}

export async function searchSchemes(query: string): Promise<MFSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const isNumeric = /^\d+$/.test(q);

  try {
    // If input is numeric (e.g. 120503), try direct lookup first
    if (isNumeric) {
      try {
        const detail = await fetchFundDetail(Number(q));
        if (detail) {
          return [{ schemeCode: detail.schemeCode, schemeName: detail.schemeName }];
        }
      } catch (e) {
        // Direct fetch failed, fallback
      }
    }

    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.slice(0, 50).map((item: any) => ({
          schemeCode: item.schemeCode,
          schemeName: item.schemeName
        }));
      }
    }
  } catch (e) {
    console.warn('Live API search failed, falling back to cached directory search', e);
  }

  const list = await fetchAllSchemes();
  return list.filter(s => {
    if (isNumeric) {
      return String(s.schemeCode).includes(q);
    }
    return s.schemeName.toLowerCase().includes(q);
  }).slice(0, 50);
}

export async function fetchFundDetail(schemeCode: number): Promise<PinnedFund> {
  if (fundDetailsCache.has(schemeCode)) {
    return fundDetailsCache.get(schemeCode)!;
  }

  const res = await fetch(`${API_BASE}/${schemeCode}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch scheme details for ${schemeCode}`);
  }

  const json: MFDetailResponse = await res.json();
  const meta = json.meta;
  const rawData = json.data || [];

  // Graceful fallback if API returns empty data for a scheme
  if (rawData.length === 0) {
    console.warn(`Scheme ${schemeCode} returned no NAV data — may be discontinued or unavailable.`);
    const fallback: PinnedFund = {
      schemeCode: meta.scheme_code || schemeCode,
      schemeName: meta.scheme_name || `Scheme ${schemeCode}`,
      isin: meta.isin_growth || meta.isin_div_reinvestment || '-',
      amc: meta.fund_house || '-',
      launchDate: '-',
      latestNav: 0,
      navAsOf: '-',
      historicalData: [],
      return7d: 0,
      return15d: 0,
      return30d: 0
    };
    fundDetailsCache.set(schemeCode, fallback);
    return fallback;
  }

  // Parse and sort historical data newest-first
  const historical = rawData.map(d => ({
    date: d.date,
    nav: parseFloat(d.nav) || 0,
    parsedDate: parseAMFIDate(d.date)
  })).sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());

  const latestItem = historical[0];
  const oldestItem = historical[historical.length - 1];

  const isin = meta.isin_growth || meta.isin_div_reinvestment || '-';

  const calculateReturnForDays = (days: number): number => {
    if (historical.length < 2) return 0;
    const latestTime = latestItem.parsedDate.getTime();
    const targetTime = latestTime - (days * 24 * 60 * 60 * 1000);

    let targetIndex = -1;
    for (let i = 0; i < historical.length; i++) {
      if (historical[i].parsedDate.getTime() <= targetTime) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex === -1) targetIndex = historical.length - 1;

    const pastNav = historical[targetIndex].nav;
    if (pastNav === 0) return 0;

    const returnPct = ((latestItem.nav - pastNav) / pastNav) * 100;
    return Math.round(returnPct * 100) / 100;
  };

  const fund: PinnedFund = {
    schemeCode: meta.scheme_code,
    schemeName: meta.scheme_name,
    isin,
    amc: meta.fund_house || 'Mutual Fund AMC',
    launchDate: formatDateDisplay(oldestItem.date),
    latestNav: latestItem.nav,
    navAsOf: formatDateDisplay(latestItem.date),
    historicalData: historical,
    return7d: calculateReturnForDays(7),
    return15d: calculateReturnForDays(15),
    return30d: calculateReturnForDays(30)
  };

  fundDetailsCache.set(schemeCode, fund);
  return fund;
}

export function generateAMCNAVRows(fund: PinnedFund, limit: number = 100): GranularNAVRow[] {
  const history = fund.historicalData;
  const rows: GranularNAVRow[] = [];

  for (let i = 0; i < Math.min(history.length, limit); i++) {
    const current = history[i];
    const prev = history[i + 1];

    const closingNav = current.nav;
    const openingNav = prev ? prev.nav : current.nav;
    const delta = Math.round((closingNav - openingNav) * 10000) / 10000;
    const deltaPercent = openingNav > 0 ? Math.round((delta / openingNav) * 100 * 10000) / 10000 : 0;

    const getPastNavAtDays = (days: number): number | null => {
      const currentTime = current.parsedDate.getTime();
      const targetTime = currentTime - (days * 24 * 60 * 60 * 1000);
      for (let j = i + 1; j < history.length; j++) {
        if (history[j].parsedDate.getTime() <= targetTime) {
          return history[j].nav;
        }
      }
      return history[history.length - 1]?.nav || null;
    };

    const nav7d = getPastNavAtDays(7);
    const nav15d = getPastNavAtDays(15);
    const nav30d = getPastNavAtDays(30);

    const rollingReturn7d = nav7d && nav7d > 0 ? Math.round(((closingNav - nav7d) / nav7d) * 100 * 100) / 100 : null;
    const rollingReturn15d = nav15d && nav15d > 0 ? Math.round(((closingNav - nav15d) / nav15d) * 100 * 100) / 100 : null;
    const rollingReturn30d = nav30d && nav30d > 0 ? Math.round(((closingNav - nav30d) / nav30d) * 100 * 100) / 100 : null;

    rows.push({
      id: `${fund.schemeCode}-${current.date}`,
      fundName: fund.schemeName,
      date: formatDateDisplay(current.date),
      nav: closingNav,
      openingNav,
      closingNav,
      delta,
      deltaPercent,
      rollingReturn7d,
      rollingReturn15d,
      rollingReturn30d
    });
  }

  return rows;
}

export function calculateRankings(pinnedFunds: PinnedFund[]): RankingRow[] {
  if (pinnedFunds.length === 0) return [];

  const sortedByReturn = [...pinnedFunds].sort((a, b) => b.return30d - a.return30d);
  const returnRankMap = new Map<number, number>();
  sortedByReturn.forEach((f, idx) => returnRankMap.set(f.schemeCode, idx + 1));

  const rowsWithScores = pinnedFunds.map(fund => {
    const returnRank = returnRankMap.get(fund.schemeCode) || pinnedFunds.length;
    const score = returnRank;

    return {
      schemeCode: fund.schemeCode,
      fundName: fund.schemeName,
      isin: fund.isin,
      amc: fund.amc,
      latestNav: fund.latestNav,
      navAsOf: fund.navAsOf,
      return30d: fund.return30d,
      returnRank,
      overallScore: Math.round(score * 100) / 100,
      overallRank: 0
    };
  });

  rowsWithScores.sort((a, b) => a.overallScore - b.overallScore);
  rowsWithScores.forEach((r, idx) => {
    r.overallRank = idx + 1;
  });

  return rowsWithScores;
}

// Target date historical lookup helper
// targetDate is a YYYY-MM-DD string from the date picker
export function getNavOnDate(fund: PinnedFund, targetDate: string): { nav: number; date: string } | null {
  if (!targetDate || fund.historicalData.length === 0) return null;

  // Parse YYYY-MM-DD as local date (not UTC) to avoid off-by-one timezone issues
  const [year, month, day] = targetDate.split('-').map(Number);
  const targetLocal = new Date(year, month - 1, day);
  const targetTime = targetLocal.getTime();

  if (isNaN(targetTime)) return null;

  // historical is sorted newest-first — find the closest date ON or BEFORE targetDate
  for (let i = 0; i < fund.historicalData.length; i++) {
    const item = fund.historicalData[i];
    if (item.parsedDate.getTime() <= targetTime) {
      return { nav: item.nav, date: formatDateDisplay(item.date) };
    }
  }

  return null;
}
