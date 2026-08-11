import React, { useMemo, useState, useEffect } from 'react';
import { Award, Trophy, Sparkles, TrendingUp, Crown, HelpCircle, Bot, AlertCircle, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { PinnedFund } from '../types/mf';
import { getNavOnDate, formatDateDisplay } from '../services/amfiApi';
import { generateGroqSummary } from '../services/groqApi';

interface Page4Props {
  pinnedFunds: PinnedFund[];
  isLoading: boolean;
  pastDate: string;
  apiKey: string;
  summary: string;
  onUpdateSummary: (newSummary: string) => Promise<void>;
}

// Grouping/Classification helper functions
const getMFDType = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('direct') || n.includes('- dir')) return 'Direct Plan';
  return 'Regular Plan (MFD)';
};

const getPlanType = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('dividend') || n.includes('idcw') || n.includes('payout') || n.includes('reinvestment')) return 'Dividend / IDCW Plan';
  return 'Growth Plan';
};

// ---------------------------------------------------------------------------
// Fund category classification (Liquid / Debt / Equity / Hybrid / etc.)
// ---------------------------------------------------------------------------
// AMFI's own NAV feed already tags every scheme with an official category
// (e.g. "Debt Scheme - Money Market Fund"). That is the real source of truth
// and requires zero guesswork, so it's always checked FIRST. Only when a
// fund object has no such field attached do we fall back to inferring the
// category from the scheme name — and even then, matching is done on a
// normalized/aliased token basis (not rigid hardcoded phrases), so naming
// variants like "Money Manager Fund" or "MMF" resolve to the same bucket as
// "Money Market Fund" without needing a dedicated rule for every AMC's
// house-style wording.
const CATEGORY_ALIASES: Record<string, string[]> = {
  'Overnight Fund': ['overnight'],
  'Liquid Fund': ['liquid'],
  // Every alias below is a *synonym* AMCs use for the same SEBI category
  // (Money Market Fund) — new synonyms can just be appended here.
  'Money Market Fund': ['money market', 'money manager', 'mmf', 'cash management', 'cash fund', 'treasury advantage'],
  'Ultra Short Duration Fund': ['ultra short'],
  'Low Duration Fund': ['low duration'],
  'Short Duration Fund': ['short term', 'short duration'],
  'Medium Duration Fund': ['medium term', 'medium duration'],
  'Medium to Long Duration Fund': ['medium to long'],
  'Long Duration Fund': ['long duration'],
  'Dynamic Bond Fund': ['dynamic bond'],
  'Corporate Bond Fund': ['corporate bond'],
  'Credit Risk Fund': ['credit risk', 'credit opportunities'],
  'Banking & PSU Fund': ['banking and psu', 'banking & psu', 'psu debt', 'banking psu'],
  'Gilt Fund': ['gilt'],
  'Floater Fund': ['floating rate', 'floater'],
  'Debt Fund (Other)': ['debt', 'bond fund', 'income fund'],

  'Index Fund / ETF': ['index', 'etf', 'nifty', 'sensex'],
  'ELSS (Tax Saver)': ['elss', 'tax saver', 'tax saving'],
  'Large & Mid Cap Fund': ['large and mid cap', 'large & mid cap'],
  'Large Cap Fund': ['large cap', 'bluechip'],
  'Mid Cap Fund': ['mid cap'],
  'Small Cap Fund': ['small cap'],
  'Multi Cap Fund': ['multi cap'],
  'Flexi Cap Fund': ['flexi cap'],
  'Focused Fund': ['focused'],
  'Value / Contra Fund': ['value fund', 'contra'],
  'Dividend Yield Fund': ['dividend yield'],
  'Sectoral / Thematic Fund': ['sector', 'thematic', 'infrastructure', 'pharma', 'technology fund', 'consumption', 'energy fund', 'psu fund', 'manufactur', 'digital'],
  'ESG Fund': ['esg'],

  'Arbitrage Fund': ['arbitrage'],
  'Equity Savings Fund': ['equity savings'],
  'Multi Asset Allocation Fund': ['multi asset'],
  'Balanced Advantage / Dynamic Asset Allocation': ['balanced advantage', 'dynamic asset'],
  'Aggressive Hybrid Fund': ['aggressive hybrid'],
  'Conservative Hybrid Fund': ['conservative hybrid'],
  'Balanced / Hybrid Fund': ['balanced fund', 'hybrid'],

  'Gold / Silver / Commodity Fund': ['gold', 'silver', 'commodit'],
  'Fund of Funds': ['fund of fund', 'fof'],
  'Retirement / Solution Oriented Fund': ['retirement', "children's fund", 'childrens fund'],
  'Equity Fund (Other)': ['equity']
};

// Category labels ordered most-specific-first so, e.g., "Ultra Short" is
// checked before the generic "Debt Fund (Other)" catch-all.
const CATEGORY_MATCH_ORDER = Object.keys(CATEGORY_ALIASES);

const classifyByName = (name: string): string => {
  // Normalize: lowercase, collapse punctuation/extra spaces so phrasing
  // differences ("Money-Manager", "Money  Manager") don't break matches.
  const normalized = name.toLowerCase().replace(/[^a-z0-9&\s]/g, ' ').replace(/\s+/g, ' ').trim();

  for (const label of CATEGORY_MATCH_ORDER) {
    const aliases = CATEGORY_ALIASES[label];
    if (aliases.some(alias => normalized.includes(alias))) {
      return label;
    }
  }
  return 'Other / Uncategorized';
};

const getFundCategory = (fund: PinnedFund): string => {
  // Prefer the official AMFI/scheme category if the fund object carries one
  // (however it may be named upstream) — this is the non-hardcoded path.
  const anyFund = fund as any;
  const officialCategory: unknown =
    anyFund.category ?? anyFund.schemeCategory ?? anyFund.amfiCategory ?? anyFund.categoryName ?? anyFund.fundCategory;
  if (typeof officialCategory === 'string' && officialCategory.trim().length > 0) {
    return officialCategory.trim();
  }
  // Fall back to inferring it from the scheme name.
  return classifyByName(fund.schemeName);
};

// Annualizes a simple period return given the actual number of days elapsed.
// Uses a CAGR-style compounding formula: ((endNav / startNav) ^ (365/days)) - 1
const annualizeReturn = (startNav: number, endNav: number, actualDays: number): number => {
  if (startNav <= 0 || endNav <= 0 || actualDays <= 0) return 0;
  const ratio = endNav / startNav;
  const annualized = (Math.pow(ratio, 365 / actualDays) - 1) * 100;
  return Math.round(annualized * 100) / 100;
};

export const Page4ConclusionRanking: React.FC<Page4Props> = ({
  pinnedFunds,
  isLoading,
  pastDate,
  apiKey,
  summary,
  onUpdateSummary
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Segregation & Grouping state
  const [segregationMode, setSegregationMode] = useState<'none' | 'mfd' | 'amc' | 'plan' | 'category' | 'custom'>('none');
  const [customGroups, setCustomGroups] = useState<Record<number, string>>({});

  // Pre-populate custom grouping suggestions based on MFD types initially
  useEffect(() => {
    const updated = { ...customGroups };
    let changed = false;
    pinnedFunds.forEach(fund => {
      if (updated[fund.schemeCode] === undefined) {
        updated[fund.schemeCode] = getMFDType(fund.schemeName);
        changed = true;
      }
    });
    if (changed) {
      setCustomGroups(updated);
    }
  }, [pinnedFunds]);

  // Determine if a custom past date is selected (different from today)
  const isPastDateSelected = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return pastDate !== todayStr;
  }, [pastDate]);

  // Compute rankings dynamically based on the selected date's metrics
  const rankings = useMemo(() => {
    if (pinnedFunds.length === 0) return [];

    // Map each fund to its metrics on the target pastDate
    const fundsWithPastMetrics = pinnedFunds.map(fund => {
      const pastNavData = getNavOnDate(fund, pastDate);
      const targetNav = pastNavData ? pastNavData.nav : fund.latestNav;

      // Returns the ANNUALIZED return for a given lookback window (in days),
      // based on the actual number of calendar days between the two NAV points used.
      const getPastReturnForDays = (days: number): number => {
        const history = fund.historicalData;
        if (history.length < 2) return 0;

        const targetTime = pastNavData ? new Date(pastNavData.date).getTime() : new Date().getTime();
        const pastTime = targetTime - (days * 24 * 60 * 60 * 1000);

        let targetIdx = -1;
        let pastIdx = -1;

        for (let i = 0; i < history.length; i++) {
          if (history[i].parsedDate.getTime() <= targetTime) {
            targetIdx = i;
            break;
          }
        }
        if (targetIdx === -1) targetIdx = 0;

        for (let j = targetIdx + 1; j < history.length; j++) {
          if (history[j].parsedDate.getTime() <= pastTime) {
            pastIdx = j;
            break;
          }
        }
        if (pastIdx === -1) pastIdx = history.length - 1;

        const currentNav = history[targetIdx]?.nav || 0;
        const pastNav = history[pastIdx]?.nav || 0;
        const currentDateVal = history[targetIdx]?.parsedDate.getTime() || targetTime;
        const pastDateVal = history[pastIdx]?.parsedDate.getTime() || pastTime;

        // Actual elapsed calendar days between the two data points (min 1 to avoid divide-by-zero blowups)
        const actualDays = Math.max(1, Math.round((currentDateVal - pastDateVal) / (24 * 60 * 60 * 1000)));

        if (pastNav === 0) return 0;

        return annualizeReturn(pastNav, currentNav, actualDays);
      };

      return {
        fund,
        targetNav,
        navAsOf: pastNavData ? pastNavData.date : fund.navAsOf,
        targetReturn7d: getPastReturnForDays(7),
        targetReturn15d: getPastReturnForDays(15),
        targetReturn30d: getPastReturnForDays(30)
      };
    });

    // Compute ranks based on target metrics (now annualized)
    const sortedByReturn30d = [...fundsWithPastMetrics].sort((a, b) => b.targetReturn30d - a.targetReturn30d);
    const rank30dMap = new Map<number, number>();
    sortedByReturn30d.forEach((item, idx) => rank30dMap.set(item.fund.schemeCode, idx + 1));

    const sortedByReturn15d = [...fundsWithPastMetrics].sort((a, b) => b.targetReturn15d - a.targetReturn15d);
    const rank15dMap = new Map<number, number>();
    sortedByReturn15d.forEach((item, idx) => rank15dMap.set(item.fund.schemeCode, idx + 1));

    const sortedByReturn7d = [...fundsWithPastMetrics].sort((a, b) => b.targetReturn7d - a.targetReturn7d);
    const rank7dMap = new Map<number, number>();
    sortedByReturn7d.forEach((item, idx) => rank7dMap.set(item.fund.schemeCode, idx + 1));

    const scored = fundsWithPastMetrics.map(item => {
      const return30dRank = rank30dMap.get(item.fund.schemeCode) || pinnedFunds.length;
      const return15dRank = rank15dMap.get(item.fund.schemeCode) || pinnedFunds.length;
      const return7dRank = rank7dMap.get(item.fund.schemeCode) || pinnedFunds.length;

      // Composite rank score (50% 30D Return, 30% 15D Return, 20% 7D Return) — all annualized
      const score = (return30dRank * 0.5) + (return15dRank * 0.3) + (return7dRank * 0.2);

      return {
        schemeCode: item.fund.schemeCode,
        fundName: item.fund.schemeName,
        isin: item.fund.isin,
        amc: item.fund.amc,
        category: getFundCategory(item.fund),
        latestNav: item.targetNav,
        navAsOf: item.navAsOf,
        return7d: item.targetReturn7d,
        return15d: item.targetReturn15d,
        return30d: item.targetReturn30d,
        return7dRank,
        return15dRank,
        return30dRank,
        overallScore: Math.round(score * 100) / 100,
        overallRank: 0
      };
    });

    // Final Overall Rank
    scored.sort((a, b) => a.overallScore - b.overallScore);
    scored.forEach((item, idx) => {
      item.overallRank = idx + 1;
    });

    return scored;
  }, [pinnedFunds, pastDate]);

  // Grouped rankings based on chosen segregationMode
  const groupedRankings = useMemo(() => {
    if (segregationMode === 'none') return null;

    const groups: Record<string, typeof rankings> = {};
    rankings.forEach(row => {
      let gName = '';
      if (segregationMode === 'mfd') {
        gName = getMFDType(row.fundName);
      } else if (segregationMode === 'amc') {
        gName = row.amc;
      } else if (segregationMode === 'plan') {
        gName = getPlanType(row.fundName);
      } else if (segregationMode === 'category') {
        gName = row.category;
      } else if (segregationMode === 'custom') {
        gName = customGroups[row.schemeCode]?.trim() || 'Unassigned / General';
      }

      if (!groups[gName]) {
        groups[gName] = [];
      }
      groups[gName].push(row);
    });

    return groups;
  }, [rankings, segregationMode, customGroups]);

  // Group average statistics
  const groupAverages = useMemo(() => {
    if (!groupedRankings) return null;
    const avgs: Record<string, { avg7d: number; avg15d: number; avg30d: number; count: number }> = {};

    Object.entries(groupedRankings).forEach(([gName, rows]) => {
      let sum7d = 0;
      let sum15d = 0;
      let sum30d = 0;
      const count = rows.length;

      rows.forEach(r => {
        sum7d += r.return7d;
        sum15d += r.return15d;
        sum30d += r.return30d;
      });

      avgs[gName] = {
        avg7d: count > 0 ? Math.round((sum7d / count) * 100) / 100 : 0,
        avg15d: count > 0 ? Math.round((sum15d / count) * 100) / 100 : 0,
        avg30d: count > 0 ? Math.round((sum30d / count) * 100) / 100 : 0,
        count
      };
    });

    return avgs;
  }, [groupedRankings]);

  // Re-rank a subset of rows purely within that subset (used so each
  // segregation group gets its own #1, instead of everyone being compared
  // against the globally-best fund regardless of category/AMC/plan).
  type RankRow = (typeof rankings)[number];
  const withLocalRanks = (rows: RankRow[]) => {
    const count = rows.length;
    const rank = (key: '30d' | '15d' | '7d') => {
      const field = key === '30d' ? 'return30d' : key === '15d' ? 'return15d' : 'return7d';
      const sorted = [...rows].sort((a, b) => (b[field] as number) - (a[field] as number));
      const map = new Map<number, number>();
      sorted.forEach((r, idx) => map.set(r.schemeCode, idx + 1));
      return map;
    };
    const map30 = rank('30d');
    const map15 = rank('15d');
    const map7 = rank('7d');

    const scored = rows.map(r => {
      const r30 = map30.get(r.schemeCode) || count;
      const r15 = map15.get(r.schemeCode) || count;
      const r7 = map7.get(r.schemeCode) || count;
      const localScore = r30 * 0.5 + r15 * 0.3 + r7 * 0.2;
      return { ...r, localReturn30dRank: r30, localReturn15dRank: r15, localReturn7dRank: r7, localOverallScore: Math.round(localScore * 100) / 100, localOverallRank: 0 };
    });
    scored.sort((a, b) => a.localOverallScore - b.localOverallScore);
    scored.forEach((r, idx) => { r.localOverallRank = idx + 1; });
    return scored;
  };

  // Grouped rankings re-ranked within each group, so the table highlight and
  // the "winner" of a group reflect that group's own top performer.
  const groupedRankingsLocal = useMemo(() => {
    if (!groupedRankings) return null;
    const result: Record<string, ReturnType<typeof withLocalRanks>> = {};
    Object.entries(groupedRankings).forEach(([gName, rows]) => {
      result[gName] = withLocalRanks(rows);
    });
    return result;
  }, [groupedRankings]);

  // One winner per group (used for the "Group Leaders" header cards).
  const groupLeaders = useMemo(() => {
    if (!groupedRankingsLocal) return null;
    return Object.entries(groupedRankingsLocal).map(([gName, rows]) => ({
      groupName: gName,
      leader: rows.find(r => r.localOverallRank === 1) || rows[0]
    }));
  }, [groupedRankingsLocal]);

  const segregationLabel = (): string => {
    switch (segregationMode) {
      case 'mfd': return 'MFD Type';
      case 'amc': return 'AMC';
      case 'plan': return 'Plan Type';
      case 'category': return 'Fund Category';
      case 'custom': return 'Distributor Group';
      default: return '';
    }
  };

  const overallWinner = rankings.find(r => r.overallRank === 1);
  const winner30d = rankings.find(r => r.return30dRank === 1);
  const winner15d = rankings.find(r => r.return15dRank === 1);
  const winner7d = rankings.find(r => r.return7dRank === 1);

  const chartData = useMemo(() => {
    return rankings.map(r => ({
      name: r.fundName.length > 22 ? r.fundName.substring(0, 19) + '...' : r.fundName,
      '30D Return % (Ann.)': r.return30d,
      '15D Return % (Ann.)': r.return15d,
      '7D Return % (Ann.)': r.return7d
    }));
  }, [rankings]);

  // Minimum pixel width per fund so bars/labels never get cramped, however
  // many funds are pinned — the chart scrolls horizontally past that point
  // instead of squeezing everything into the visible viewport.
  const CHART_MIN_WIDTH_PER_ITEM = 110;
  const chartMinWidth = Math.max(chartData.length * CHART_MIN_WIDTH_PER_ITEM, 100);

  // Handle Groq summary generation
  const handleGenerateSummary = async () => {
    if (!apiKey) {
      setErrorMsg('Groq API Key is missing. Please configure it in the "Developer Controls" tab.');
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);
    try {
      const generated = await generateGroqSummary(apiKey, rankings);
      await onUpdateSummary(generated);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to generate summary.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper to parse and render simple markdown text from LLM response
  const renderFormattedSummary = (text: string) => {
    if (!text) return null;

    const lines = text.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={idx} style={{ height: '8px' }} />;

      // Header parsing
      if (trimmed.toLowerCase().startsWith('observations')) {
        return (
          <h4 key={idx} style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '16px', marginBottom: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
            Observations
          </h4>
        );
      }
      if (trimmed.toLowerCase().startsWith('executive summary')) {
        return (
          <h4 key={idx} style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '20px', marginBottom: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
            Executive Summary
          </h4>
        );
      }

      // Check for bold prefixes like "Best Return:", "Lowest Cost:" etc.
      const matchBoldPrefix = trimmed.match(/^[\*\-]?\s*\*\*(.*?)\*\*(.*)$/);
      if (matchBoldPrefix) {
        return (
          <p key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0', lineHeight: '1.5', paddingLeft: '8px' }}>
            • <strong>{matchBoldPrefix[1]}</strong>{matchBoldPrefix[2]}
          </p>
        );
      }

      // List item parsing
      if (trimmed.match(/^\d+\./)) {
        return (
          <p key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '8px 0', lineHeight: '1.5', paddingLeft: '4px' }}>
            {trimmed}
          </p>
        );
      }
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        return (
          <p key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0', lineHeight: '1.5', paddingLeft: '12px' }}>
            • {trimmed.substring(1).trim()}
          </p>
        );
      }

      return (
        <p key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0', lineHeight: '1.5' }}>
          {trimmed}
        </p>
      );
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div className="card-panel" style={{ borderLeft: '4px solid var(--color-warning)', background: 'linear-gradient(90deg, #fffbeb 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          <Sparkles size={12} />
          <span>Decision & Ranking Matrix</span>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)' }}>
          {isPastDateSelected ? 'Historical Rankings & Performance Matrix' : 'Conclusion & Return-Based Rankings'}
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {isPastDateSelected
            ? `Rankings calculated dynamically using annualized historical returns on ${formatDateDisplay(pastDate)}.`
            : 'Composite performance rankings weighted by 30-Day annualized returns (50%), 15-Day annualized returns (30%), and 7-Day annualized returns (20%).'}
        </p>
      </div>

      {pinnedFunds.length === 0 ? (
        <div className="card-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Award size={40} style={{ margin: '0 auto 12px', color: 'var(--border-medium)' }} />
          <h3>No Pinned Funds to Rank</h3>
          <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Pin mutual funds in page 1 to compute the comparative ranking matrix.</p>
        </div>
      ) : (
        <>
          {/* Trophy Cards: global winners when unsegregated, per-group leaders when a filter is active */}
          {segregationMode === 'none' || !groupLeaders ? (
            <div className="panel-grid-4">
              <div className="card-panel" style={{ backgroundColor: 'var(--color-warning-light)', borderColor: 'var(--accent-amber-border)', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-warning)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  <Trophy size={14} /> Overall Winner
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={overallWinner?.fundName}>
                  {overallWinner?.fundName}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-secondary)' }}>Rank #1 composite returns</div>
              </div>

              <div className="card-panel" style={{ backgroundColor: 'var(--color-success-light)', borderColor: 'var(--color-success-border)', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-success)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  <TrendingUp size={14} /> Best 30D Return (Ann.)
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={winner30d?.fundName}>
                  {winner30d?.fundName}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-secondary)' }}>+{winner30d?.return30d.toFixed(2)}% (Annualized)</div>
              </div>

              <div className="card-panel" style={{ backgroundColor: 'var(--color-primary-light)', borderColor: 'var(--accent-blue-border)', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  <TrendingUp size={14} /> Best 15D Return (Ann.)
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={winner15d?.fundName}>
                  {winner15d?.fundName}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-secondary)' }}>+{winner15d?.return15d.toFixed(2)}% (Annualized)</div>
              </div>

              <div className="card-panel" style={{ backgroundColor: 'var(--color-purple-light)', borderColor: 'var(--accent-purple-border)', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-purple)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  <TrendingUp size={14} /> Best 7D Return (Ann.)
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={winner7d?.fundName}>
                  {winner7d?.fundName}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-secondary)' }}>+{winner7d?.return7d.toFixed(2)}% (Annualized)</div>
              </div>
            </div>
          ) : (
            <div className="card-panel" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-warning)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '10px' }}>
                <Trophy size={14} /> Group Leaders — Winner per {segregationLabel()} ({groupLeaders.length} groups)
              </div>
              <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                {groupLeaders.map(({ groupName, leader }) => (
                  <div
                    key={groupName}
                    className="card-panel"
                    style={{
                      backgroundColor: 'var(--color-warning-light)',
                      borderColor: 'var(--accent-amber-border)',
                      padding: '12px 14px',
                      minWidth: '210px',
                      flex: '0 0 auto'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-warning)', textTransform: 'uppercase' }}>
                      <Crown size={12} /> {groupName}
                    </div>
                    <div
                      style={{ fontSize: '0.82rem', fontWeight: 800, marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '182px' }}
                      title={leader?.fundName}
                    >
                      {leader?.fundName}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      <span style={{ color: (leader?.return30d ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>30D {(leader?.return30d ?? 0) > 0 ? '+' : ''}{leader?.return30d.toFixed(2)}%</span>
                      <span style={{ color: (leader?.return15d ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>15D {(leader?.return15d ?? 0) > 0 ? '+' : ''}{leader?.return15d.toFixed(2)}%</span>
                      <span style={{ color: (leader?.return7d ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>7D {(leader?.return7d ?? 0) > 0 ? '+' : ''}{leader?.return7d.toFixed(2)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matrix Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 className="card-title" style={{ margin: 0 }}>
                  {isPastDateSelected ? 'Historical Rankings Table' : 'Final Return Matrix'}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  <HelpCircle size={14} />
                  <span>
                    Rank is computed using annualized 30D (50%), 15D (30%), and 7D (20%) returns
                    {groupedRankingsLocal ? ', re-ranked separately within each group below (so every group gets its own #1).' : '.'}
                    {' '}All returns shown are annualized (CAGR-style).
                  </span>
                </div>
              </div>

              {/* Segregation Mode Dropdown / Button Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Segregate By:</span>
                <select
                  value={segregationMode}
                  onChange={(e) => setSegregationMode(e.target.value as any)}
                  className="date-picker-input"
                  style={{ padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600, minWidth: '185px', height: '30px' }}
                >
                  <option value="none">Flat List (No Segregation)</option>
                  <option value="mfd">MFD Type (Direct vs Regular)</option>
                  <option value="amc">AMC (Fund House)</option>
                  <option value="plan">Plan Type (Growth vs Dividend)</option>
                  <option value="category">Fund Category (Liquid, Debt, Equity, etc.)</option>
                  <option value="custom">Custom Distributor Groups</option>
                </select>
              </div>
            </div>

            {/* Custom Grouping Information Banner */}
            {segregationMode === 'custom' && (
              <div style={{ backgroundColor: 'var(--color-primary-light)', border: '1px dashed var(--color-primary)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <Sparkles size={14} style={{ color: 'var(--color-purple)', marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' }} />
                <span>You are in <strong>Custom Distributor Grouping</strong> mode. Assign custom distributor names or select suggested presets directly inside the fund rows below to dynamically segregate the matrix.</span>
              </div>
            )}

            {segregationMode === 'category' && (
              <div style={{ backgroundColor: 'var(--color-primary-light)', border: '1px dashed var(--color-primary)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <Sparkles size={14} style={{ color: 'var(--color-purple)', marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' }} />
                <span>Funds are auto-classified into categories (Liquid, Overnight, Debt, Equity, Hybrid, Index/ETF, Arbitrage, Gold, etc.) based on their scheme name. Anything that doesn't match a known category falls under "Other / Uncategorized".</span>
              </div>
            )}

            <div className="table-wrapper">
              <table className="financial-table">
                <thead>
                  <tr>
                    <th>{groupedRankingsLocal ? 'Rank in Group' : 'Overall Rank'}</th>
                    <th>Fund Name</th>
                    <th>ISIN</th>
                    <th style={{ textAlign: 'right' }}>{isPastDateSelected ? 'Past NAV' : 'Latest NAV'}</th>
                    <th>NAV As Of</th>
                    <th style={{ textAlign: 'right' }}>7D Return (Ann.)</th>
                    <th style={{ textAlign: 'right' }}>15D Return (Ann.)</th>
                    <th style={{ textAlign: 'right' }}>30D Return (Ann.)</th>
                    <th style={{ textAlign: 'center' }}>7D Rank{groupedRankingsLocal ? ' (Grp)' : ''}</th>
                    <th style={{ textAlign: 'center' }}>15D Rank{groupedRankingsLocal ? ' (Grp)' : ''}</th>
                    <th style={{ textAlign: 'center' }}>30D Rank{groupedRankingsLocal ? ' (Grp)' : ''}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRankingsLocal ? (
                    Object.entries(groupedRankingsLocal).map(([groupName, rows]) => {
                      const avg = groupAverages?.[groupName];
                      return (
                        <React.Fragment key={groupName}>
                          {/* Section Header */}
                          <tr style={{ backgroundColor: 'var(--color-purple-light)', color: 'var(--color-purple)', fontWeight: 700 }}>
                            <td colSpan={11} style={{ padding: '8px 12px', fontSize: '0.8rem', borderLeft: '4px solid var(--color-purple)' }}>
                              📁 {groupName} ({rows.length} {rows.length === 1 ? 'Fund' : 'Funds'})
                            </td>
                          </tr>

                          {/* Member Rows — ranked within this group only */}
                          {rows.map(row => {
                            const isTop1 = row.localOverallRank === 1;
                            return (
                              <tr key={row.schemeCode} style={{ backgroundColor: isTop1 ? 'var(--color-warning-light)' : 'transparent', fontWeight: isTop1 ? 600 : 'normal' }}>
                                <td style={{ textAlign: 'center', fontWeight: 800 }}>
                                  {isTop1 ? (
                                    <span className="badge badge-amber" style={{ padding: '4px 8px', gap: '2px' }}><Crown size={12} /> #1</span>
                                  ) : (
                                    `#${row.localOverallRank}`
                                  )}
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  <div style={{ fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '240px' }} title={row.fundName}>
                                    {row.fundName}
                                  </div>

                                  {/* Custom distributor naming and suggested list */}
                                  {segregationMode === 'custom' && (
                                    <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Group:</span>
                                      <input
                                        type="text"
                                        value={customGroups[row.schemeCode] || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setCustomGroups(prev => ({ ...prev, [row.schemeCode]: val }));
                                        }}
                                        placeholder="e.g. MFD Name"
                                        className="date-picker-input"
                                        style={{ padding: '2px 6px', fontSize: '0.7rem', width: '100px', height: '22px' }}
                                      />
                                      <select
                                        value={customGroups[row.schemeCode] || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setCustomGroups(prev => ({ ...prev, [row.schemeCode]: val }));
                                        }}
                                        className="date-picker-input"
                                        style={{ padding: '1px 4px', fontSize: '0.7rem', height: '22px', minWidth: '80px' }}
                                      >
                                        <option value="">Presets</option>
                                        <option value="Direct Plan">Direct Plan</option>
                                        <option value="Regular Plan">Regular Plan</option>
                                        <option value="Distributor A">Distributor A</option>
                                        <option value="Distributor B">Distributor B</option>
                                        <option value="Independent MFD">Independent MFD</option>
                                        <option value="Self Managed">Self Managed</option>
                                        <option value="Direct Execution">Direct Execution</option>
                                      </select>
                                    </div>
                                  )}
                                </td>
                                <td className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.isin}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>₹{row.latestNav.toFixed(4)}</td>
                                <td style={{ color: 'var(--text-muted)' }}>{row.navAsOf}</td>
                                <td style={{ textAlign: 'right', color: row.return7d >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                  {row.return7d > 0 ? '+' : ''}{row.return7d.toFixed(2)}%
                                </td>
                                <td style={{ textAlign: 'right', color: row.return15d >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                  {row.return15d > 0 ? '+' : ''}{row.return15d.toFixed(2)}%
                                </td>
                                <td style={{ textAlign: 'right', color: row.return30d >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 }}>
                                  {row.return30d > 0 ? '+' : ''}{row.return30d.toFixed(2)}%
                                </td>
                                <td style={{ textAlign: 'center' }}><span className="badge badge-purple" style={{ padding: '2px 6px' }}>#{row.localReturn7dRank}</span></td>
                                <td style={{ textAlign: 'center' }}><span className="badge badge-blue" style={{ padding: '2px 6px' }}>#{row.localReturn15dRank}</span></td>
                                <td style={{ textAlign: 'center' }}><span className="badge badge-green" style={{ padding: '2px 6px' }}>#{row.localReturn30dRank}</span></td>
                              </tr>
                            );
                          })}

                          {/* Group Subtotal Row */}
                          {avg && (
                            <tr style={{ backgroundColor: '#f8fafc', fontWeight: 700, borderBottom: '2px solid var(--border-medium)' }}>
                              <td colSpan={5} style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                                📊 Average Annualized Return for {groupName}:
                              </td>
                              <td style={{ textAlign: 'right', color: avg.avg7d >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontSize: '0.75rem' }}>
                                {avg.avg7d > 0 ? '+' : ''}{avg.avg7d.toFixed(2)}%
                              </td>
                              <td style={{ textAlign: 'right', color: avg.avg15d >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontSize: '0.75rem' }}>
                                {avg.avg15d > 0 ? '+' : ''}{avg.avg15d.toFixed(2)}%
                              </td>
                              <td style={{ textAlign: 'right', color: avg.avg30d >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontSize: '0.75rem', fontWeight: 800 }}>
                                {avg.avg30d > 0 ? '+' : ''}{avg.avg30d.toFixed(2)}%
                              </td>
                              <td colSpan={3} style={{ backgroundColor: '#f8fafc' }} />
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    rankings.map(row => {
                      const isTop1 = row.overallRank === 1;
                      return (
                        <tr key={row.schemeCode} style={{ backgroundColor: isTop1 ? 'var(--color-warning-light)' : 'transparent', fontWeight: isTop1 ? 600 : 'normal' }}>
                          <td style={{ textAlign: 'center', fontWeight: 800 }}>
                            {row.overallRank === 1 ? (
                              <span className="badge badge-amber" style={{ padding: '4px 8px', gap: '2px' }}><Crown size={12} /> #1</span>
                            ) : (
                              `#${row.overallRank}`
                            )}
                          </td>
                          <td style={{ fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '220px' }}>{row.fundName}</td>
                          <td className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.isin}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>₹{row.latestNav.toFixed(4)}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{row.navAsOf}</td>
                          <td style={{ textAlign: 'right', color: row.return7d >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {row.return7d > 0 ? '+' : ''}{row.return7d.toFixed(2)}%
                          </td>
                          <td style={{ textAlign: 'right', color: row.return15d >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {row.return15d > 0 ? '+' : ''}{row.return15d.toFixed(2)}%
                          </td>
                          <td style={{ textAlign: 'right', color: row.return30d >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 }}>
                            {row.return30d > 0 ? '+' : ''}{row.return30d.toFixed(2)}%
                          </td>
                          <td style={{ textAlign: 'center' }}><span className="badge badge-purple" style={{ padding: '2px 6px' }}>#{row.return7dRank}</span></td>
                          <td style={{ textAlign: 'center' }}><span className="badge badge-blue" style={{ padding: '2px 6px' }}>#{row.return15dRank}</span></td>
                          <td style={{ textAlign: 'center' }}><span className="badge badge-green" style={{ padding: '2px 6px' }}>#{row.return30dRank}</span></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recharts comparison bar chart */}
          <div className="card-panel">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
              <h3 className="card-title" style={{ margin: 0 }}>
                {isPastDateSelected ? 'Historical Performance Comparison' : 'Multi-Timeframe Annualized Return Comparison'}
              </h3>
              {chartData.length > 8 && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Scroll horizontally to see all {chartData.length} funds →</span>
              )}
            </div>
            {/* Fixed min-width-per-fund + horizontal scroll: bars/labels stay legible
                no matter how many funds are pinned, instead of squeezing into the
                visible width and effectively hiding most of them. */}
            <div style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
              <div style={{ width: `${chartMinWidth}px`, minWidth: '100%', height: '340px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                    <Bar dataKey="7D Return % (Ann.)" fill="var(--color-purple)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="15D Return % (Ann.)" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="30D Return % (Ann.)" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* AI Summary & Solutions Section */}
          <div className="card-panel" style={{ borderLeft: '4px solid var(--color-purple)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Bot size={18} style={{ color: 'var(--color-purple)' }} />
                  <span>AI Summary & Solutions</span>
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Generate comprehensive portfolio observations powered by Groq LLM
                </p>
              </div>

              <button
                onClick={handleGenerateSummary}
                disabled={isGenerating}
                className="btn btn-primary"
                style={{
                  padding: '8px 16px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'var(--color-purple)',
                  color: '#ffffff'
                }}
              >
                <RefreshCw size={14} className={isGenerating ? 'animate-spin' : ''} />
                <span>{isGenerating ? 'Analyzing Portfolios...' : 'Generate Summary'}</span>
              </button>
            </div>

            {errorMsg && (
              <div style={{ backgroundColor: 'var(--color-danger-light)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', fontSize: '0.8rem', marginBottom: '16px' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                minHeight: '120px'
              }}
            >
              {summary ? (
                <div>{renderFormattedSummary(summary)}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                  <Bot size={32} style={{ color: 'var(--border-medium)', marginBottom: '8px' }} />
                  <p style={{ fontSize: '0.8rem' }}>No AI Analysis has been generated yet.</p>
                  <p style={{ fontSize: '0.72rem', marginTop: '2px' }}>Click "Generate Summary" to run portfolio analysis using the configured Groq API Key.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
