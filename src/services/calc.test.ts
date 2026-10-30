import { describe, it, expect } from 'vitest';
import elss from './__fixtures__/120503.json';
import liquid from './__fixtures__/119800.json';
import { buildFund, generateAMCNAVRows, getNavOnDate, formatDateDisplay } from './amfiApi';
import {
  NavPoint,
  parseAMFIDate,
  parseISODate,
  toISODate,
  periodReturn,
  dailyCarryForward,
  xirr,
  simulateSip,
  competitionRanks,
  endOfDay,
  riskStats
} from './calc';

const NOW = new Date(2026, 9, 30);
const elssFund = buildFund(elss as any, 120503, NOW);
const liquidFund = buildFund(liquid as any, 119800, NOW);

const pts = (rows: [string, number][]): NavPoint[] =>
  rows.map(([d, nav]) => ({ date: d, nav, parsedDate: parseAMFIDate(d) }));

describe('date helpers', () => {
  it('parses dates as local midnight (no UTC shift)', () => {
    const d = parseISODate('2026-08-05');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 7, 5, 0]);
    expect(toISODate(parseAMFIDate('05-08-2026'))).toBe('2026-08-05');
    expect(formatDateDisplay('05-08-2026')).toBe('05 Aug 2026');
    expect(formatDateDisplay('2026-08-05')).toBe('05 Aug 2026');
    expect(isNaN(parseISODate('garbage').getTime())).toBe(true);
  });
});

describe('buildFund on real AMFI data (values cross-checked independently)', () => {
  it('reads metadata and latest NAV', () => {
    expect(liquidFund.schemeName).toMatch(/SBI LIQUID/i);
    expect(liquidFund.category).toBe('Debt Scheme - Liquid Fund');
    expect(liquidFund.latestNav).toBeCloseTo(4472.2004, 4);
    expect(liquidFund.navAsOf).toBe('29 Oct 2026');
    expect(liquidFund.isStale).toBe(false);
    expect(elssFund.category).toMatch(/ELSS/);
  });

  it('computes point-to-point returns', () => {
    expect(liquidFund.return7d).toBeCloseTo(0.12, 2);
    expect(liquidFund.return7dAnn).toBeCloseTo(6.31, 2);
    expect(liquidFund.return15dAnn).toBeCloseTo(4.63, 2);
    expect(liquidFund.return30d).toBeCloseTo(0.45, 2);
    expect(liquidFund.return30dAnn).toBeCloseTo(5.51, 2);
    expect(liquidFund.return1y).toBeCloseTo(6.44, 2);
    expect(elssFund.return7d).toBeCloseTo(2.05, 2);
    expect(elssFund.return30d).toBeCloseTo(0.75, 2);
    expect(elssFund.return1y).toBeCloseTo(-5.14, 2);
  });

  it('returns null (not 0) when history is too short', () => {
    // fixtures hold < 5 years of data
    expect(liquidFund.return5y).toBeNull();
    expect(elssFund.return5y).toBeNull();
  });

  it('computes day change from the previous published NAV', () => {
    expect(elssFund.prevNav).toBeCloseTo(105.4599, 4);
    expect(elssFund.dayChangePct).toBeCloseTo(1.11, 2);
  });

  it('marks empty history as a load error', () => {
    const f = buildFund({ meta: { scheme_code: 1, scheme_name: 'X', fund_house: 'Y' }, data: [], status: 'SUCCESS' }, 1);
    expect(f.loadError).toBeTruthy();
  });
});

describe('periodReturn', () => {
  const s = pts([
    ['01-01-2026', 100],
    ['02-01-2026', 101],
    ['05-01-2026', 102], // Monday after a weekend
    ['08-01-2026', 103]
  ]);
  it('uses the NAV on or before the start date', () => {
    // 08 Jan minus 7 days = 01 Jan
    const r = periodReturn(s, endOfDay(parseISODate('2026-01-08')), 7)!;
    expect(r.startNav).toBe(100);
    expect(r.absolute).toBeCloseTo(3, 6);
    expect(r.annualised).toBeCloseTo((3 * 365) / 7, 6);
  });
  it('is null when history is too short', () => {
    expect(periodReturn(s, endOfDay(parseISODate('2026-01-08')), 30)).toBeNull();
  });
});

describe('dailyCarryForward', () => {
  it('fills weekends with the PREVIOUS trading day NAV, never the next one', () => {
    const s = pts([
      ['02-01-2026', 101], // Friday
      ['05-01-2026', 102] // Monday
    ]);
    const rows = dailyCarryForward(s, parseISODate('2026-01-01').getTime(), endOfDay(parseISODate('2026-01-05')));
    const byIso = Object.fromEntries(rows.map(r => [r.iso, r]));
    expect(byIso['2026-01-01'].nav).toBeUndefined(); // before first NAV
    expect(byIso['2026-01-03'].nav).toBe(101); // Saturday = Friday
    expect(byIso['2026-01-04'].nav).toBe(101); // Sunday = Friday
    expect(byIso['2026-01-04'].carried).toBe(true);
    expect(byIso['2026-01-05'].nav).toBe(102);
    expect(byIso['2026-01-05'].carried).toBe(false);
  });

  it('AMC rows on real data carry Friday NAV over the weekend', () => {
    const rows = generateAMCNAVRows(elssFund, 30);
    const sat = rows.find(r => r.iso === '2026-10-24')!; // Saturday
    const fri = rows.find(r => r.iso === '2026-10-23')!;
    expect(sat.closingNav).toBe(fri.closingNav);
    expect(sat.isCarried).toBe(true);
    expect(rows[0].iso).toBe('2026-10-29');
    expect(rows).toHaveLength(30);
  });
});

describe('getNavOnDate', () => {
  it('returns latest NAV on or before date', () => {
    expect(getNavOnDate(elssFund, '2026-10-25')!.nav).toBeCloseTo(103.4993, 4); // Sunday -> Friday 23rd
    expect(getNavOnDate(elssFund, '2026-10-29')!.nav).toBeCloseTo(106.6254, 4);
    expect(getNavOnDate(elssFund, '2000-01-01')).toBeNull();
  });
});

describe('xirr & SIP', () => {
  it('matches a known XIRR', () => {
    // Invest 1000, get 1100 exactly one year later -> 10%
    const r = xirr([
      { amount: -1000, date: new Date(2025, 0, 1) },
      { amount: 1100, date: new Date(2026, 0, 1) }
    ])!;
    expect(r).toBeCloseTo(10, 4);
  });
  it('flat NAV SIP has ~0% XIRR', () => {
    const flat: NavPoint[] = [];
    for (let i = 0; i < 400; i++) {
      const d = new Date(2025, 0, 1 + i);
      flat.push({ date: '', nav: 10, parsedDate: d });
    }
    const sip = simulateSip(flat, flat[0].parsedDate.getTime(), flat[399].parsedDate.getTime(), 5000)!;
    expect(sip.installments).toBe(14);
    expect(sip.invested).toBe(70000);
    expect(sip.currentValue).toBeCloseTo(70000, 6);
    expect(sip.xirr).toBeCloseTo(0, 4);
  });
  it('liquid fund SIP XIRR is in a sane range', () => {
    const asc = liquidFund.historyAsc;
    const sip = simulateSip(asc, parseISODate('2025-10-29').getTime(), endOfDay(parseISODate('2026-10-29')))!;
    expect(sip.xirr!).toBeGreaterThan(4);
    expect(sip.xirr!).toBeLessThan(8);
  });
});

describe('risk & ranks', () => {
  it('liquid fund is far less volatile than equity', () => {
    expect(liquidFund.volatility1y!).toBeLessThan(2);
    expect(elssFund.volatility1y!).toBeGreaterThan(8);
    expect(elssFund.maxDrawdown1y!).toBeLessThan(0);
    const r = riskStats(liquidFund.historyAsc, 0, Date.now())!;
    expect(r.maxDrawdown).toBeLessThanOrEqual(0);
  });
  it('ties share a rank and nulls go last', () => {
    const items = [
      { k: 1, v: 5 },
      { k: 2, v: 7 },
      { k: 3, v: 5 },
      { k: 4, v: null as number | null }
    ];
    const m = competitionRanks(items, i => i.v, i => i.k);
    expect([m.get(2), m.get(1), m.get(3), m.get(4)]).toEqual([1, 2, 2, 4]);
  });
});
