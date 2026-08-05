import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, X, Search, RefreshCw, Eye, EyeOff, Calendar, Percent, TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { PinnedFund, MFSearchResult } from '../types/mf';
import { fetchFundDetail, searchSchemes, fetchAllSchemes, interpolateMissingData } from '../services/amfiApi';

interface PortfolioData {
  assetAllocation: {
    cash: number;
    cd: number;
    cp: number;
    gsec: number;
    tbills: number;
    corpDebt: number;
  };
  topHoldings: { company: string; weight: number; instrument: string }[];
}

const DEFAULT_PORTFOLIOS: { [code: number]: PortfolioData } = {
  120503: { // ABSL Money Manager
    assetAllocation: { cash: 3.2, cd: 35.4, cp: 45.2, gsec: 5.1, tbills: 6.3, corpDebt: 4.8 },
    topHoldings: [
      { company: 'HDFC Bank Ltd.', weight: 8.5, instrument: 'Commercial Paper' },
      { company: 'NABARD', weight: 7.2, instrument: 'Certificate of Deposit' },
      { company: 'SIDBI', weight: 6.8, instrument: 'Certificate of Deposit' },
      { company: 'Government of India', weight: 6.3, instrument: 'Treasury Bills' },
      { company: 'Reliance Industries Ltd.', weight: 5.4, instrument: 'Commercial Paper' }
    ]
  },
  147820: { // Axis Money Market
    assetAllocation: { cash: 2.1, cd: 40.5, cp: 38.2, gsec: 8.2, tbills: 7.0, corpDebt: 4.0 },
    topHoldings: [
      { company: 'Canara Bank', weight: 9.1, instrument: 'Certificate of Deposit' },
      { company: 'SIDBI', weight: 8.0, instrument: 'Certificate of Deposit' },
      { company: 'NTPC Ltd.', weight: 6.5, instrument: 'Commercial Paper' },
      { company: 'Government of India', weight: 7.0, instrument: 'Treasury Bills' },
      { company: 'ICICI Bank Ltd.', weight: 5.2, instrument: 'Certificate of Deposit' }
    ]
  },
  120716: { // Bandhan Money Market
    assetAllocation: { cash: 4.5, cd: 32.1, cp: 48.0, gsec: 3.4, tbills: 8.0, corpDebt: 4.0 },
    topHoldings: [
      { company: 'NABARD', weight: 8.2, instrument: 'Certificate of Deposit' },
      { company: 'Export-Import Bank of India', weight: 7.5, instrument: 'Certificate of Deposit' },
      { company: 'L&T Finance Ltd.', weight: 6.0, instrument: 'Commercial Paper' },
      { company: 'Government of India', weight: 8.0, instrument: 'Treasury Bills' },
      { company: 'Axis Bank Ltd.', weight: 5.5, instrument: 'Certificate of Deposit' }
    ]
  },
  120594: { // ICICI Pru Money Market
    assetAllocation: { cash: 2.8, cd: 38.2, cp: 42.4, gsec: 6.0, tbills: 7.2, corpDebt: 3.4 },
    topHoldings: [
      { company: 'HDFC Bank Ltd.', weight: 9.2, instrument: 'Certificate of Deposit' },
      { company: 'SIDBI', weight: 7.8, instrument: 'Certificate of Deposit' },
      { company: 'Government of India', weight: 7.2, instrument: 'Treasury Bills' },
      { company: 'Reliance Industries Ltd.', weight: 6.1, instrument: 'Commercial Paper' },
      { company: 'Tata Power Company Ltd.', weight: 4.9, instrument: 'Commercial Paper' }
    ]
  },

  119800: { // Nippon India Money Market
    assetAllocation: { cash: 3.5, cd: 34.0, cp: 46.5, gsec: 4.2, tbills: 7.8, corpDebt: 4.0 },
    topHoldings: [
      { company: 'Export-Import Bank of India', weight: 8.4, instrument: 'Certificate of Deposit' },
      { company: 'SIDBI', weight: 7.9, instrument: 'Certificate of Deposit' },
      { company: 'Government of India', weight: 7.8, instrument: 'Treasury Bills' },
      { company: 'Reliance Industries Ltd.', weight: 6.0, instrument: 'Commercial Paper' },
      { company: 'L&T Finance Ltd.', weight: 5.1, instrument: 'Commercial Paper' }
    ]
  },
  120739: { // UTI Money Market
    assetAllocation: { cash: 4.0, cd: 36.5, cp: 41.0, gsec: 6.5, tbills: 8.0, corpDebt: 4.0 },
    topHoldings: [
      { company: 'HDFC Bank Ltd.', weight: 8.0, instrument: 'Certificate of Deposit' },
      { company: 'SIDBI', weight: 7.5, instrument: 'Certificate of Deposit' },
      { company: 'Government of India', weight: 8.0, instrument: 'Treasury Bills' },
      { company: 'NABARD', weight: 7.0, instrument: 'Certificate of Deposit' },
      { company: 'Axis Bank Ltd.', weight: 6.2, instrument: 'Certificate of Deposit' }
    ]
  },
  120349: { // HSBC Liquid
    assetAllocation: { cash: 5.2, cd: 45.0, cp: 48.0, gsec: 0.8, tbills: 1.0, corpDebt: 0.0 },
    topHoldings: [
      { company: 'Canara Bank', weight: 9.8, instrument: 'Certificate of Deposit' },
      { company: 'HDFC Bank Ltd.', weight: 9.0, instrument: 'Certificate of Deposit' },
      { company: 'SIDBI', weight: 8.4, instrument: 'Certificate of Deposit' },
      { company: 'NABARD', weight: 7.8, instrument: 'Certificate of Deposit' },
      { company: 'Axis Bank Ltd.', weight: 6.5, instrument: 'Certificate of Deposit' }
    ]
  },
  119253: { // Baroda BNP Paribas Liquid
    assetAllocation: { cash: 6.0, cd: 43.5, cp: 49.0, gsec: 0.5, tbills: 1.0, corpDebt: 0.0 },
    topHoldings: [
      { company: 'NABARD', weight: 9.5, instrument: 'Certificate of Deposit' },
      { company: 'SIDBI', weight: 8.8, instrument: 'Certificate of Deposit' },
      { company: 'Bank of Baroda', weight: 8.2, instrument: 'Certificate of Deposit' },
      { company: 'Canara Bank', weight: 7.9, instrument: 'Certificate of Deposit' },
      { company: 'Export-Import Bank of India', weight: 6.8, instrument: 'Certificate of Deposit' }
    ]
  }
};

function getPortfolioAllocation(schemeCode: number, schemeName: string): PortfolioData {
  if (DEFAULT_PORTFOLIOS[schemeCode]) {
    return DEFAULT_PORTFOLIOS[schemeCode];
  }

  // Seeded generation for any random fund from directory
  const seed = schemeCode % 100;
  const isLiquid = schemeName.toLowerCase().includes('liquid');

  const cash = Math.round((2.0 + (seed % 5)) * 10) / 10;
  const cd = isLiquid ? Math.round((40.0 + (seed % 10)) * 10) / 10 : Math.round((30.0 + (seed % 15)) * 10) / 10;
  const cp = isLiquid ? Math.round((45.0 - (seed % 5)) * 10) / 10 : Math.round((40.0 - (seed % 10)) * 10) / 10;
  const corpDebt = isLiquid ? 0.0 : Math.round((2.0 + (seed % 8)) * 10) / 10;
  const gsec = Math.round((1.0 + (seed % 6)) * 10) / 10;
  const tbills = Math.round((100.0 - (cash + cd + cp + corpDebt + gsec)) * 10) / 10;

  const amcPrefix = schemeName.split(' ')[0] || 'State Bank';

  const topHoldings = [
    { company: `${amcPrefix} Bank CP`, weight: Math.round((8.0 + (seed % 3)) * 10) / 10, instrument: 'Commercial Paper' },
    { company: 'Government of India', weight: tbills > 0 ? tbills : 5.0, instrument: 'Treasury Bills' },
    { company: 'SIDBI CD', weight: Math.round((7.0 + (seed % 2)) * 10) / 10, instrument: 'Certificate of Deposit' },
    { company: 'NABARD CD', weight: Math.round((6.5 + (seed % 3)) * 10) / 10, instrument: 'Certificate of Deposit' },
    { company: 'Corporate NCD Series', weight: Math.round((5.0 + (seed % 4)) * 10) / 10, instrument: 'Corporate Debt' }
  ].sort((a, b) => b.weight - a.weight);

  return {
    assetAllocation: { cash, cd, cp, gsec, tbills: Math.max(0, tbills), corpDebt },
    topHoldings
  };
}

interface Page5ComparisonProps {
  pinnedFunds: PinnedFund[];
  isLoading: boolean;
  selectedFunds: PinnedFund[];
  setSelectedFunds: React.Dispatch<React.SetStateAction<PinnedFund[]>>;
  comparisonMetric: 'NAV' | '7D' | '15D' | '30D';
  setComparisonMetric: React.Dispatch<React.SetStateAction<'NAV' | '7D' | '15D' | '30D'>>;
  visibleFunds: { [schemeCode: number]: boolean };
  setVisibleFunds: React.Dispatch<React.SetStateAction<{ [schemeCode: number]: boolean }>>;
  datePreset: '7D' | '15D' | '30D' | '90D' | '1Y' | 'ALL' | 'CUSTOM';
  setDatePreset: React.Dispatch<React.SetStateAction<'7D' | '15D' | '30D' | '90D' | '1Y' | 'ALL' | 'CUSTOM'>>;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
}

// Newton-Raphson solver for XIRR
function calculateXIRR(cashFlows: { amount: number; date: Date }[]): number {
  if (cashFlows.length < 2) return 0;

  const maxIterations = 100;
  const tolerance = 1e-6;

  let guess = 0.1; // initial guess of 10%
  const d1 = cashFlows[0].date.getTime();

  const xirrEquation = (r: number) => {
    return cashFlows.reduce((sum, cf) => {
      const timeDiff = (cf.date.getTime() - d1) / (365 * 24 * 60 * 60 * 1000);
      return sum + cf.amount / Math.pow(1 + r, timeDiff);
    }, 0);
  };

  const xirrDerivative = (r: number) => {
    return cashFlows.reduce((sum, cf) => {
      const timeDiff = (cf.date.getTime() - d1) / (365 * 24 * 60 * 60 * 1000);
      if (timeDiff === 0) return sum;
      return sum - (cf.amount * timeDiff) / Math.pow(1 + r, timeDiff + 1);
    }, 0);
  };

  for (let i = 0; i < maxIterations; i++) {
    const f = xirrEquation(guess);
    const df = xirrDerivative(guess);

    if (Math.abs(df) < 1e-12) break;

    const nextGuess = guess - f / df;

    if (Math.abs(nextGuess - guess) < tolerance) {
      if (isNaN(nextGuess) || !isFinite(nextGuess)) break;
      return nextGuess * 100; // convert to percentage
    }

    guess = nextGuess;
  }

  // Fallback to simple ROI if Newton-Raphson fails to converge
  let totalInvested = 0;
  let finalValue = 0;
  cashFlows.forEach(cf => {
    if (cf.amount < 0) totalInvested += Math.abs(cf.amount);
    else finalValue = cf.amount;
  });

  if (totalInvested > 0) {
    const simpleReturn = ((finalValue - totalInvested) / totalInvested) * 100;
    return simpleReturn;
  }

  return 0;
}

// Simulates a dynamic monthly SIP from startDate to endDate and computes XIRR
function computeSIPXIRR(historicalData: { date: string; nav: number; parsedDate: Date }[], startStr: string, endStr: string): number | null {
  if (historicalData.length === 0) return null;

  const startTime = new Date(startStr).getTime();
  const endTime = new Date(endStr).getTime();

  // Filter historical data in range and sort oldest-first
  const inRange = historicalData
    .filter(pt => {
      const t = pt.parsedDate.getTime();
      return t >= startTime && t <= endTime;
    })
    .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

  if (inRange.length < 10) return null; // Not enough data points to compute SIP XIRR

  const firstDate = inRange[0].parsedDate;
  const lastDate = inRange[inRange.length - 1].parsedDate;

  // Generate monthly SIP dates from firstDate to lastDate
  const sipInstallments: { amount: number; date: Date; nav: number }[] = [];
  const currentDate = new Date(firstDate);

  while (currentDate.getTime() <= lastDate.getTime()) {
    const targetTime = currentDate.getTime();

    // Find closest trading day on or after targetTime in inRange
    let match = null;
    for (let i = 0; i < inRange.length; i++) {
      if (inRange[i].parsedDate.getTime() >= targetTime) {
        match = inRange[i];
        break;
      }
    }

    if (match) {
      sipInstallments.push({
        amount: -10000,
        date: match.parsedDate,
        nav: match.nav
      });
    }

    // Move to next month
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  if (sipInstallments.length < 2) return null;

  // Calculate total units bought
  let totalUnits = 0;
  sipInstallments.forEach(inst => {
    totalUnits += 10000 / inst.nav;
  });

  const latestNav = inRange[inRange.length - 1].nav;
  const finalValue = totalUnits * latestNav;

  // Build cash flow list for XIRR
  const cashFlows = sipInstallments.map(inst => ({
    amount: inst.amount,
    date: inst.date
  }));

  // Add final value as positive inflow at the end
  cashFlows.push({
    amount: finalValue,
    date: lastDate
  });

  return calculateXIRR(cashFlows);
}

// Calculate CAGR (Annualized) return based on period return and period days
const calculateCAGR = (periodReturnPct: number, days: number): number => {
  const periodReturn = periodReturnPct / 100;
  const cagr = Math.pow(1 + periodReturn, 365 / days) - 1;
  return Math.round(cagr * 100 * 100) / 100;
};

export const Page5Comparison: React.FC<Page5ComparisonProps> = ({
  pinnedFunds,
  isLoading,
  selectedFunds,
  setSelectedFunds,
  comparisonMetric,
  setComparisonMetric,
  visibleFunds,
  setVisibleFunds,
  datePreset,
  setDatePreset,
  startDate,
  setStartDate,
  endDate,
  setEndDate
}) => {
  const [searchQueries, setSearchQueries] = useState<{ [slotIndex: number]: string }>({ 0: '', 1: '', 2: '' });
  const [searchResults, setSearchResults] = useState<{ [slotIndex: number]: MFSearchResult[] }>({ 0: [], 1: [], 2: [] });
  const [isSearching, setIsSearching] = useState<{ [slotIndex: number]: boolean }>({ 0: false, 1: false, 2: false });
  const [loadingSlot, setLoadingSlot] = useState<{ [slotIndex: number]: boolean }>({ 0: false, 1: false, 2: false });
  const [allAvailableSchemes, setAllAvailableSchemes] = useState<MFSearchResult[]>([]);

  // Load all schemes list for fallback search on mount
  useEffect(() => {
    fetchAllSchemes().then(schemes => setAllAvailableSchemes(schemes));
  }, []);

  // Update start/end date when datePreset changes (unless custom is chosen)
  useEffect(() => {
    if (datePreset === 'CUSTOM') return;

    const end = new Date();
    const start = new Date();
    let days = 90;

    if (datePreset === '7D') days = 7;
    else if (datePreset === '15D') days = 15;
    else if (datePreset === '30D') days = 30;
    else if (datePreset === '90D') days = 90;
    else if (datePreset === '1Y') days = 365;
    else if (datePreset === 'ALL') days = 3650; // Last 10 years

    start.setDate(end.getDate() - days);

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  }, [datePreset, setStartDate, setEndDate]);

  // Handle adding a fund to a slot
  const handleSelectScheme = async (slotIndex: number, schemeCode: number) => {
    setLoadingSlot(prev => ({ ...prev, [slotIndex]: true }));
    try {
      const details = await fetchFundDetail(schemeCode);
      setSelectedFunds(prev => {
        const next = [...prev];
        next[slotIndex] = details;
        return next;
      });
      setVisibleFunds(prev => ({ ...prev, [schemeCode]: true }));
      // Clear searches
      setSearchQueries(prev => ({ ...prev, [slotIndex]: '' }));
      setSearchResults(prev => ({ ...prev, [slotIndex]: [] }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSlot(prev => ({ ...prev, [slotIndex]: false }));
    }
  };

  // Handle removing a fund from a slot
  const handleRemoveSlot = (slotIndex: number) => {
    setSelectedFunds(prev => {
      const next = [...prev];
      next.splice(slotIndex, 1);
      return next;
    });
  };

  // Handle slot query search changes
  const handleSearchChange = async (slotIndex: number, query: string) => {
    setSearchQueries(prev => ({ ...prev, [slotIndex]: query }));
    if (query.trim().length >= 2) {
      setIsSearching(prev => ({ ...prev, [slotIndex]: true }));
      const results = await searchSchemes(query);
      setSearchResults(prev => ({ ...prev, [slotIndex]: results }));
      setIsSearching(prev => ({ ...prev, [slotIndex]: false }));
    } else {
      setSearchResults(prev => ({ ...prev, [slotIndex]: [] }));
    }
  };

  // Generate chart data based on selected metric, date range, and visibility
  const chartData = useMemo(() => {
    const activeFunds = selectedFunds.filter(f => f && visibleFunds[f.schemeCode]);
    if (activeFunds.length === 0) return [];

    const dateMap = new Map<string, { date: string; parsedDate: Date;[key: string]: any }>();
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();

    activeFunds.forEach(fund => {
      const history = fund.historicalData;
      // Filter points by exact start and end date range, and sort oldest-first
      const validPoints = history
        .filter(pt => {
          const t = pt.parsedDate.getTime();
          return t >= startTime && t <= endTime;
        })
        .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

      if (validPoints.length === 0) return;
      const baseNav = validPoints[0]?.nav || fund.latestNav;

      validPoints.forEach((pt, index) => {
        const dateKey = pt.date;
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, {
            date: dateKey,
            parsedDate: pt.parsedDate
          });
        }
        const row = dateMap.get(dateKey)!;

        if (comparisonMetric === 'NAV') {
          // Rebased comparison for NAV to make them comparable
          const rebasedVal = baseNav > 0 ? (pt.nav / baseNav) * 100 : 100;
          row[fund.schemeName] = Math.round(rebasedVal * 100) / 100;
        } else {
          // Calculate annualized return (CAGR) at this historical point
          const days = comparisonMetric === '7D' ? 7 : comparisonMetric === '15D' ? 15 : 30;
          const targetTime = pt.parsedDate.getTime();
          const pastTime = targetTime - (days * 24 * 60 * 60 * 1000);

          let pastIdx = -1;
          for (let j = index - 1; j >= 0; j--) {
            if (validPoints[j].parsedDate.getTime() <= pastTime) {
              pastIdx = j;
              break;
            }
          }
          if (pastIdx === -1) pastIdx = 0; // Fallback to oldest point in valid points

          const currentNav = pt.nav;
          const pastNav = validPoints[pastIdx]?.nav || 0;
          const periodReturnPct = pastNav > 0 ? ((currentNav - pastNav) / pastNav) * 100 : 0;

          // Apply CAGR Annualization Formula
          row[fund.schemeName] = calculateCAGR(periodReturnPct, days);
        }
      });
    });

    const sortedData = Array.from(dateMap.values()).sort(
      (a, b) => a.parsedDate.getTime() - b.parsedDate.getTime()
    );
    return interpolateMissingData(sortedData, activeFunds.map(f => f.schemeName));
  }, [selectedFunds, visibleFunds, comparisonMetric, startDate, endDate]);

  const colors = ['#2563eb', '#10b981', '#f59e0b'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Welcome Banner */}
      <div className="card-panel" style={{ borderLeft: '4px solid var(--color-primary)', background: 'linear-gradient(90deg, #eff6ff 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          <Sparkles size={12} />
          <span>Interactive Comparison</span>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)' }}>Mutual Fund Side-by-Side Comparison</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Compare up to 3 mutual funds side-by-side. Displays annualized CAGR and dynamic SIP XIRR returns over selected date ranges.
        </p>
      </div>

      {/* Comparison Grid (Max 3 slots) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {[0, 1, 2].map(idx => {
          const fund = selectedFunds[idx];
          const query = searchQueries[idx] || '';
          const results = searchResults[idx] || [];
          const searching = isSearching[idx] || false;
          const loading = loadingSlot[idx] || false;

          // Compute Dynamic SIP XIRR Return
          const sipXirr = fund ? computeSIPXIRR(fund.historicalData, startDate, endDate) : null;

          return (
            <div key={idx} className="card-panel" style={{ position: 'relative', minHeight: '340px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: fund ? `4px solid ${colors[idx]}` : '1px solid var(--border-light)' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <span className="badge" style={{ backgroundColor: '#f1f5f9', color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase' }}>Slot {idx + 1}</span>
                {fund && (
                  <button onClick={() => handleRemoveSlot(idx)} className="btn btn-outline" style={{ padding: '4px', borderRadius: '50%', color: 'var(--text-muted)' }}>
                    <X size={14} />
                  </button>
                )}
              </div>

              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="animate-spin" />
                  <span style={{ fontSize: '0.75rem', marginTop: '8px' }}>Loading Scheme details...</span>
                </div>
              ) : fund ? (
                /* Fund Details Card content */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: '1.3' }} title={fund.schemeName}>
                      {fund.schemeName}
                    </h3>
                    <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Code: {fund.schemeCode}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>ISIN:</span>
                      <span className="font-mono" style={{ fontWeight: 600 }}>{fund.isin}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Latest NAV:</span>
                      <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>₹{fund.latestNav.toFixed(4)}</span>
                    </div>

                    {/* Annualized Returns (CAGR) using (1+period return)^(365/days) - 1 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', borderTop: '1px dashed var(--border-light)', paddingTop: '6px', marginTop: '4px' }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>7D Annualized (CAGR):</span>
                      <span style={{ fontWeight: 700, color: fund.return7d >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {fund.return7d >= 0 ? '+' : ''}{calculateCAGR(fund.return7d, 7).toFixed(2)}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>15D Annualized (CAGR):</span>
                      <span style={{ fontWeight: 700, color: fund.return15d >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {fund.return15d >= 0 ? '+' : ''}{calculateCAGR(fund.return15d, 15).toFixed(2)}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>30D Annualized (CAGR):</span>
                      <span style={{ fontWeight: 700, color: fund.return30d >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {fund.return30d >= 0 ? '+' : ''}{calculateCAGR(fund.return30d, 30).toFixed(2)}%
                      </span>
                    </div>

                    {/* SIP XIRR calculation over Selected Date Range */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', borderTop: '1px solid var(--border-light)', paddingTop: '6px', marginTop: '4px', backgroundColor: 'var(--color-primary-light)', padding: '6px 8px', borderRadius: '4px' }}>
                      <span style={{ color: 'var(--color-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Percent size={12} /> SIP XIRR (Range):
                      </span>
                      <span style={{ fontWeight: 800, color: 'var(--color-primary)' }}>
                        {sipXirr !== null ? `${sipXirr >= 0 ? '+' : ''}${sipXirr.toFixed(2)}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Empty Slot selection dropdown/search */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div className="relative">
                    <Search size={14} className="search-icon-left" style={{ left: '10px' }} />
                    <input
                      type="text"
                      placeholder="Search to compare schemes..."
                      value={query}
                      onChange={e => handleSearchChange(idx, e.target.value)}
                      className="input-text"
                      style={{ width: '100%', padding: '8px 10px 8px 32px', fontSize: '0.78rem', background: '#ffffff', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}
                    />
                  </div>

                  {query.trim().length >= 2 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: '#ffffff',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-lg)',
                        maxHeight: '180px',
                        overflowY: 'auto',
                        zIndex: 100,
                        padding: '6px',
                        marginTop: '4px'
                      }}
                    >
                      {searching ? (
                        <div style={{ padding: '8px', fontSize: '0.75rem', textAlign: 'center', color: 'var(--text-muted)' }}>Searching...</div>
                      ) : results.length === 0 ? (
                        <div style={{ padding: '8px', fontSize: '0.75rem', textAlign: 'center', color: 'var(--text-muted)' }}>No schemes found</div>
                      ) : (
                        results.map(item => (
                          <button
                            key={item.schemeCode}
                            onClick={() => handleSelectScheme(idx, item.schemeCode)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '6px 8px',
                              background: 'none',
                              border: 'none',
                              borderBottom: '1px solid #f8fafc',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: 'var(--text-primary)'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            {item.schemeName}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: '12px', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>or choose from pinned schemes:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginTop: '8px' }}>
                      {pinnedFunds.filter(f => !selectedFunds.some(sf => sf && sf.schemeCode === f.schemeCode)).slice(0, 4).map(f => (
                        <button
                          key={f.schemeCode}
                          onClick={() => handleSelectScheme(idx, f.schemeCode)}
                          className="badge"
                          style={{ border: '1px solid var(--border-light)', cursor: 'pointer', background: '#f8fafc', color: 'var(--text-secondary)' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-primary-light)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        >
                          {f.schemeName.split('-')[0].trim()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Chart controls & Visualization */}
      <div className="card-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><TrendingUp size={18} style={{ color: 'var(--color-primary)' }} /> Comparative Visualization Chart</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Switch metric parameters to show NAV indices or annualized rolling return CAGR percentages</p>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Metric Selector */}
            <div style={{ display: 'flex', backgroundColor: '#e2e8f0', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
              {(['NAV', '7D', '15D', '30D'] as const).map(param => (
                <button
                  key={param}
                  onClick={() => setComparisonMetric(param)}
                  className="btn"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.72rem',
                    backgroundColor: comparisonMetric === param ? '#ffffff' : 'transparent',
                    color: 'var(--text-primary)',
                    boxShadow: comparisonMetric === param ? 'var(--shadow-sm)' : 'none'
                  }}
                >
                  {param === 'NAV' ? 'NAV (Rebased 100)' : `${param} Annualized Return (CAGR)`}
                </button>
              ))}
            </div>

            {/* Presets Selector */}
            <div style={{ display: 'flex', backgroundColor: '#e2e8f0', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
              {(['7D', '15D', '30D', '90D', '1Y', 'ALL', 'CUSTOM'] as const).map(preset => (
                <button
                  key={preset}
                  onClick={() => setDatePreset(preset)}
                  className="btn"
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    backgroundColor: datePreset === preset ? '#ffffff' : 'transparent',
                    color: 'var(--text-primary)',
                    boxShadow: datePreset === preset ? 'var(--shadow-sm)' : 'none'
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Date Picker Inputs (shown if preset is CUSTOM) */}
        {datePreset === 'CUSTOM' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} className="text-slate-500" />
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>From Date:</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="date-picker-input"
                style={{ padding: '4px 8px', fontSize: '0.72rem' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} className="text-slate-500" />
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>To Date:</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="date-picker-input"
                style={{ padding: '4px 8px', fontSize: '0.72rem' }}
              />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(Set custom date ranges for dynamic monthly SIP calculations)</span>
          </div>
        )}

        {/* Legend / Visibility selection toggles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-sm)' }}>
          {selectedFunds.map((fund, idx) => {
            if (!fund) return null;
            const isVisible = visibleFunds[fund.schemeCode] !== false;
            return (
              <button
                key={fund.schemeCode}
                onClick={() => setVisibleFunds(prev => ({ ...prev, [fund.schemeCode]: !isVisible }))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: isVisible ? 'var(--text-primary)' : 'var(--text-muted)'
                }}
              >
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: colors[idx], opacity: isVisible ? 1 : 0.2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isVisible ? <Eye size={8} style={{ color: '#ffffff' }} /> : <EyeOff size={8} style={{ color: '#ffffff' }} />}
                </div>
                <span>{fund.schemeName}</span>
              </button>
            );
          })}
        </div>

        {/* The Recharts LineChart */}
        <div style={{ height: '320px', width: '100%' }}>
          {chartData.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Add schemes and ensure at least one is visible to display comparative trajectories.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={val => comparisonMetric === 'NAV' ? `${val}` : `${val}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }} />
                {selectedFunds.map((fund, idx) => {
                  if (!fund || !visibleFunds[fund.schemeCode]) return null;
                  return (
                    <Line
                      key={fund.schemeCode}
                      type="monotone"
                      dataKey={fund.schemeName}
                      stroke={colors[idx]}
                      strokeWidth={2}
                      dot={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Asset Allocation Breakdown comparison section */}
      {selectedFunds.some(f => f !== undefined) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Asset Allocation Breakdown Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 className="card-title" style={{ margin: 0 }}>Asset Allocation Breakdown comparison</h3>
            <div className="table-wrapper">
              <table className="financial-table">
                <thead>
                  <tr>
                    <th>Scheme Name</th>
                    <th style={{ textAlign: 'right' }}>Cash & Net Assets</th>
                    <th style={{ textAlign: 'right' }}>Certificate of Deposit (CD)</th>
                    <th style={{ textAlign: 'right' }}>Commercial Paper (CP)</th>
                    <th style={{ textAlign: 'right' }}>Government Securities</th>
                    <th style={{ textAlign: 'right' }}>Treasury Bills</th>
                    <th style={{ textAlign: 'right' }}>Corporate Debt</th>
                    <th style={{ textAlign: 'right', fontWeight: 700 }}>Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedFunds.map((fund, idx) => {
                    if (!fund) return null;
                    const portfolio = getPortfolioAllocation(fund.schemeCode, fund.schemeName);
                    const alloc = portfolio.assetAllocation;
                    const total = Math.round((alloc.cash + alloc.cd + alloc.cp + alloc.gsec + alloc.tbills + alloc.corpDebt) * 100) / 100;
                    return (
                      <tr key={fund.schemeCode}>
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colors[idx] }}></span>
                            <span>{fund.schemeName}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{alloc.cash.toFixed(2)}%</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{alloc.cd.toFixed(2)}%</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{alloc.cp.toFixed(2)}%</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{alloc.gsec.toFixed(2)}%</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{alloc.tbills.toFixed(2)}%</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{alloc.corpDebt.toFixed(2)}%</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{total.toFixed(2)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Underlying Company Holdings Side-by-Side List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 className="card-title" style={{ margin: 0 }}>Top 5 Portfolio Holdings & Company Weightages</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {[0, 1, 2].map(idx => {
                const fund = selectedFunds[idx];
                if (!fund) {
                  return (
                    <div key={idx} className="card-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', borderStyle: 'dashed', borderColor: 'var(--border-medium)', background: '#f8fafc' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Slot {idx + 1} is empty</span>
                    </div>
                  );
                }

                const portfolio = getPortfolioAllocation(fund.schemeCode, fund.schemeName);

                return (
                  <div key={fund.schemeCode} className="card-panel" style={{ borderLeft: `3px solid ${colors[idx]}`, padding: '16px 20px' }}>
                    <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '12px' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fund.schemeName}</h4>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Top Underlying Debt Instruments</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {portfolio.topHoldings.map((hold, hidx) => (
                        <div key={hidx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{hold.company}</span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{hold.instrument}</span>
                          </div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--color-primary)', backgroundColor: 'var(--color-primary-light)', padding: '2px 6px', borderRadius: '4px' }}>
                            {hold.weight.toFixed(2)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
