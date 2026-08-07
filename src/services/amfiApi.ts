import {
  MFSearchResult,
  MFDetailResponse,
  PinnedFund,
  GranularNAVRow,
  RankingRow
} from '../types/mf';

const API_BASE = 'https://api.mfapi.in/mf';

export const DEFAULT_SCHEME_CODES: { schemeCode: number; name: string }[] = [];

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

export function calculateAnnualizedReturn(returnPct: number | null, days: number): number | null {
  if (returnPct === null || isNaN(returnPct) || days <= 0) return null;
  const growthFactor = 1 + returnPct / 100;
  if (growthFactor <= 0) return null;
  const ann = (Math.pow(growthFactor, 365 / days) - 1) * 100;
  return Math.round(ann * 100) / 100;
}

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

  try {
    const res = await fetch(`${API_BASE}/${schemeCode}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch scheme details for ${schemeCode}`);
    }

    const json: MFDetailResponse = await res.json();
    const meta = json.meta;
    const rawData = json.data || [];

    // Graceful fallback if API returns empty data for a scheme
    if (rawData.length === 0) {
      console.warn(`Scheme ${schemeCode} returned no NAV data — creating fallback.`);
      const defaultInfo = DEFAULT_SCHEME_CODES.find(d => d.schemeCode === schemeCode);
      const fallback: PinnedFund = {
        schemeCode: meta.scheme_code || schemeCode,
        schemeName: meta.scheme_name || defaultInfo?.name || `Scheme ${schemeCode}`,
        isin: meta.isin_growth || meta.isin_div_reinvestment || '-',
        amc: meta.fund_house || 'Mutual Fund AMC',
        launchDate: '-',
        latestNav: 100,
        navAsOf: '-',
        historicalData: [],
        return7d: 0,
        return15d: 0,
        return30d: 0,
        return7dAnn: 0,
        return15dAnn: 0,
        return30dAnn: 0
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

    const ret7d = calculateReturnForDays(7);
    const ret15d = calculateReturnForDays(15);
    const ret30d = calculateReturnForDays(30);

    const fund: PinnedFund = {
      schemeCode: meta.scheme_code,
      schemeName: meta.scheme_name,
      isin,
      amc: meta.fund_house || 'Mutual Fund AMC',
      launchDate: formatDateDisplay(oldestItem.date),
      latestNav: latestItem.nav,
      navAsOf: formatDateDisplay(latestItem.date),
      historicalData: historical,
      return7d: ret7d,
      return15d: ret15d,
      return30d: ret30d,
      return7dAnn: calculateAnnualizedReturn(ret7d, 7) || 0,
      return15dAnn: calculateAnnualizedReturn(ret15d, 15) || 0,
      return30dAnn: calculateAnnualizedReturn(ret30d, 30) || 0
    };

    fundDetailsCache.set(schemeCode, fund);
    return fund;
  } catch (err) {
    console.warn(`Network/API error loading scheme ${schemeCode}, creating resilient fallback`, err);
    const defaultInfo = DEFAULT_SCHEME_CODES.find(d => d.schemeCode === schemeCode);
    const fallback: PinnedFund = {
      schemeCode: schemeCode,
      schemeName: defaultInfo?.name || `Scheme ${schemeCode}`,
      isin: '-',
      amc: 'Mutual Fund AMC',
      launchDate: '-',
      latestNav: 100,
      navAsOf: '-',
      historicalData: [],
      return7d: 0,
      return15d: 0,
      return30d: 0,
      return7dAnn: 0,
      return15dAnn: 0,
      return30dAnn: 0
    };
    fundDetailsCache.set(schemeCode, fallback);
    return fallback;
  }
}

export function generateAMCNAVRows(fund: PinnedFund, limit: number = 100): GranularNAVRow[] {
  const history = fund.historicalData;
  if (history.length === 0) return [];

  // Build continuous daily map so weekend dates (Saturdays/Sundays) inherit preceding Friday's NAV
  const sortedAsc = [...history].sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
  const dateNavMap = new Map<string, number>();

  sortedAsc.forEach(pt => {
    const yyyy = pt.parsedDate.getFullYear();
    const mm = String(pt.parsedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(pt.parsedDate.getDate()).padStart(2, '0');
    dateNavMap.set(`${yyyy}-${mm}-${dd}`, pt.nav);
  });

  const newestDate = new Date(sortedAsc[sortedAsc.length - 1].parsedDate);
  const oldestDate = new Date(sortedAsc[0].parsedDate);

  const fullDailyData: { dateStr: string; parsedDate: Date; nav: number; isWeekend: boolean }[] = [];
  let curr = new Date(newestDate);
  let lastKnownNav = sortedAsc[sortedAsc.length - 1].nav;

  while (curr.getTime() >= oldestDate.getTime() && fullDailyData.length < (limit * 2)) {
    const yyyy = curr.getFullYear();
    const mm = String(curr.getMonth() + 1).padStart(2, '0');
    const dd = String(curr.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;

    if (dateNavMap.has(key)) {
      lastKnownNav = dateNavMap.get(key)!;
    }

    const dayOfWeek = curr.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    fullDailyData.push({
      dateStr: key,
      parsedDate: new Date(curr),
      nav: lastKnownNav,
      isWeekend
    });

    curr.setDate(curr.getDate() - 1);
  }

  const getPastNavAtDays = (fromIndex: number, days: number): number | null => {
    const fromTime = fullDailyData[fromIndex].parsedDate.getTime();
    const targetTime = fromTime - days * 24 * 60 * 60 * 1000;

    for (let j = fromIndex + 1; j < fullDailyData.length; j++) {
      if (fullDailyData[j].parsedDate.getTime() <= targetTime) {
        return fullDailyData[j].nav;
      }
    }
    return fullDailyData[fullDailyData.length - 1]?.nav || null;
  };

  const rows: GranularNAVRow[] = [];
  const displayLimit = Math.min(fullDailyData.length, limit);

  for (let i = 0; i < displayLimit; i++) {
    const current = fullDailyData[i];
    const prev = fullDailyData[i + 1] || current;

    const closingNav = current.nav;
    const openingNav = prev.nav;
    const delta = Math.round((closingNav - openingNav) * 10000) / 10000;
    const deltaPercent = openingNav > 0 ? Math.round((delta / openingNav) * 100 * 10000) / 10000 : 0;

    const nav7d = getPastNavAtDays(i, 7);
    const nav15d = getPastNavAtDays(i, 15);
    const nav30d = getPastNavAtDays(i, 30);

    const rollingReturn7d = nav7d && nav7d > 0 ? Math.round(((closingNav - nav7d) / nav7d) * 100 * 100) / 100 : 0;
    const rollingReturn15d = nav15d && nav15d > 0 ? Math.round(((closingNav - nav15d) / nav15d) * 100 * 100) / 100 : 0;
    const rollingReturn30d = nav30d && nav30d > 0 ? Math.round(((closingNav - nav30d) / nav30d) * 100 * 100) / 100 : 0;

    const rollingReturn7dAnn = calculateAnnualizedReturn(rollingReturn7d, 7) ?? 0;
    const rollingReturn15dAnn = calculateAnnualizedReturn(rollingReturn15d, 15) ?? 0;
    const rollingReturn30dAnn = calculateAnnualizedReturn(rollingReturn30d, 30) ?? 0;

    const formattedDate = formatDateDisplay(current.parsedDate);

    rows.push({
      id: `${fund.schemeCode}-${current.dateStr}`,
      fundName: fund.schemeName,
      date: formattedDate,
      nav: closingNav,
      openingNav,
      closingNav,
      delta,
      deltaPercent,
      rollingReturn7d,
      rollingReturn15d,
      rollingReturn30d,
      rollingReturn7dAnn,
      rollingReturn15dAnn,
      rollingReturn30dAnn
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

export function interpolateMissingData(
  chartData: any[],
  fundNames: string[]
): any[] {
  if (chartData.length === 0 || fundNames.length === 0) return chartData;

  // We operate on a copy of chartData to avoid direct mutation issues
  const data = chartData.map(row => ({ ...row }));

  fundNames.forEach(name => {
    for (let i = 0; i < data.length; i++) {
      if (data[i][name] === undefined || data[i][name] === null) {
        // Find prev index with value
        let prevIdx = -1;
        for (let j = i - 1; j >= 0; j--) {
          if (data[j][name] !== undefined && data[j][name] !== null) {
            prevIdx = j;
            break;
          }
        }

        // Find next index with value
        let nextIdx = -1;
        for (let j = i + 1; j < data.length; j++) {
          if (data[j][name] !== undefined && data[j][name] !== null) {
            nextIdx = j;
            break;
          }
        }

        if (prevIdx !== -1 && nextIdx !== -1) {
          const prevTime = data[prevIdx].parsedDate.getTime();
          const nextTime = data[nextIdx].parsedDate.getTime();
          const currTime = data[i].parsedDate.getTime();
          const prevVal = data[prevIdx][name];
          const nextVal = data[nextIdx][name];

          if (nextTime === prevTime) {
            data[i][name] = prevVal;
          } else {
            const interpolated = prevVal + (nextVal - prevVal) * (currTime - prevTime) / (nextTime - prevTime);
            data[i][name] = Math.round(interpolated * 10000) / 10000;
          }
        } else if (prevIdx !== -1) {
          data[i][name] = data[prevIdx][name];
        } else if (nextIdx !== -1) {
          data[i][name] = data[nextIdx][name];
        }
      }
    }
  });

  return data;
}

