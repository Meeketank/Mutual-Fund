import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, X, Search, RefreshCw, Eye, EyeOff, Calendar, Percent, TrendingUp, Plus } from 'lucide-react';
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

// NOTE: Portfolio / asset-allocation / top-holdings data has been removed.
// mfapi.in (https://api.mfapi.in) only exposes historical NAV + basic scheme
// metadata — there is no free, reliable, real-time API for CD/CP/G-Sec
// allocation weights or underlying company holdings for Indian mutual funds.
// The previous implementation used a hardcoded lookup table plus a
// seeded-random fallback generator, which produced fabricated numbers that
// looked plausible but were not real. Rather than ship false data, that
// section has been removed entirely. If a real data source (AMC factsheet
// scrape, MFCentral, Value Research, a paid provider like FMP, etc.) is
// wired up later, this section can be reintroduced against real data.

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

function calculateXIRR(cashFlows: { amount: number; date: Date }[]): number {
  if (cashFlows.length < 2) return 0;

  const maxIterations = 100;
  const tolerance = 1e-6;

  let guess = 0.1;
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
      return nextGuess * 100;
    }

    guess = nextGuess;
  }

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

function computeSIPXIRR(historicalData: { date: string; nav: number; parsedDate: Date }[], startStr: string, endStr: string): number | null {
  if (historicalData.length === 0) return null;

  const startTime = new Date(startStr).getTime();
  const endTime = new Date(endStr).getTime();

  const inRange = historicalData
    .filter(pt => {
      const t = pt.parsedDate.getTime();
      return t >= startTime && t <= endTime;
    })
    .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

  if (inRange.length < 10) return null;

  const firstDate = inRange[0].parsedDate;
  const lastDate = inRange[inRange.length - 1].parsedDate;

  const sipInstallments: { amount: number; date: Date; nav: number }[] = [];
  const currentDate = new Date(firstDate);

  while (currentDate.getTime() <= lastDate.getTime()) {
    const targetTime = currentDate.getTime();

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

    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  if (sipInstallments.length < 2) return null;

  let totalUnits = 0;
  sipInstallments.forEach(inst => {
    totalUnits += 10000 / inst.nav;
  });

  const latestNav = inRange[inRange.length - 1].nav;
  const finalValue = totalUnits * latestNav;

  const cashFlows = sipInstallments.map(inst => ({
    amount: inst.amount,
    date: inst.date
  }));

  cashFlows.push({
    amount: finalValue,
    date: lastDate
  });

  return calculateXIRR(cashFlows);
}

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
  const [slotCount, setSlotCount] = useState<number>(() => Math.max(3, selectedFunds.length || 3));
  const [searchQueries, setSearchQueries] = useState<{ [slotIndex: number]: string }>({});
  const [searchResults, setSearchResults] = useState<{ [slotIndex: number]: MFSearchResult[] }>({});
  const [isSearching, setIsSearching] = useState<{ [slotIndex: number]: boolean }>({});
  const [loadingSlot, setLoadingSlot] = useState<{ [slotIndex: number]: boolean }>({});
  const [allAvailableSchemes, setAllAvailableSchemes] = useState<MFSearchResult[]>([]);

  // Custom Zoom & Scroll states for the comparison chart
  const [compZoomDays, setCompZoomDays] = useState<number>(0);
  const [compPanOffset, setCompPanOffset] = useState<number>(0);

  useEffect(() => {
    fetchAllSchemes().then(schemes => setAllAvailableSchemes(schemes));
  }, []);

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
    else if (datePreset === 'ALL') days = 3650;

    start.setDate(end.getDate() - days);

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  }, [datePreset, setStartDate, setEndDate]);

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
      setSearchQueries(prev => ({ ...prev, [slotIndex]: '' }));
      setSearchResults(prev => ({ ...prev, [slotIndex]: [] }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSlot(prev => ({ ...prev, [slotIndex]: false }));
    }
  };

  const handleRemoveSlot = (slotIndex: number) => {
    setSelectedFunds(prev => {
      const next = [...prev];
      next.splice(slotIndex, 1);
      return next;
    });
  };

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

  const chartData = useMemo(() => {
    const activeFunds = selectedFunds.filter(f => f && visibleFunds[f.schemeCode]);
    if (activeFunds.length === 0) return [];

    const dateMap = new Map<string, { date: string; parsedDate: Date;[key: string]: any }>();
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();

    activeFunds.forEach(fund => {
      // Use the FULL history (sorted) as the lookback source. Trailing-return
      // metrics (7D/15D/30D) for a date near the start of the visible range
      // need NAV data from *before* that range to compute a real return —
      // slicing to [startDate, endDate] first (as the old code did) meant
      // there was nothing to look back to, so early points fell back to a
      // same-point comparison and plotted as ~0%. The date range should only
      // control which points get *drawn*, not which points are valid anchors.
      const fullHistory = [...fund.historicalData].sort(
        (a, b) => a.parsedDate.getTime() - b.parsedDate.getTime()
      );

      const inRangePoints = fullHistory.filter(pt => {
        const t = pt.parsedDate.getTime();
        return t >= startTime && t <= endTime;
      });

      if (inRangePoints.length === 0) return;
      const baseNav = inRangePoints[0]?.nav || fund.latestNav;

      inRangePoints.forEach(pt => {
        const dateKey = pt.date;
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, {
            date: dateKey,
            parsedDate: pt.parsedDate
          });
        }
        const row = dateMap.get(dateKey)!;

        if (comparisonMetric === 'NAV') {
          const rebasedVal = baseNav > 0 ? (pt.nav / baseNav) * 100 : 100;
          row[fund.schemeName] = Math.round(rebasedVal * 100) / 100;
        } else {
          const days = comparisonMetric === '7D' ? 7 : comparisonMetric === '15D' ? 15 : 30;
          const targetTime = pt.parsedDate.getTime();
          const pastTime = targetTime - (days * 24 * 60 * 60 * 1000);

          // Search the full history for the closest point at or before pastTime.
          let pastPoint: { date: string; nav: number; parsedDate: Date } | null = null;
          for (let j = fullHistory.length - 1; j >= 0; j--) {
            if (fullHistory[j].parsedDate.getTime() <= pastTime) {
              pastPoint = fullHistory[j];
              break;
            }
          }

          if (pastPoint) {
            const currentNav = pt.nav;
            const pastNav = pastPoint.nav;
            const periodReturnPct = pastNav > 0 ? ((currentNav - pastNav) / pastNav) * 100 : 0;
            row[fund.schemeName] = calculateCAGR(periodReturnPct, days);
          }
          // If there's genuinely no data far enough back (e.g. the scheme
          // itself is younger than `days`), leave this fund's value unset
          // for this date instead of plotting a false 0% — interpolateMissingData
          // will bridge the gap from the nearest real values.
        }
      });
    });

    const sortedData = Array.from(dateMap.values()).sort(
      (a, b) => a.parsedDate.getTime() - b.parsedDate.getTime()
    );
    return interpolateMissingData(sortedData, activeFunds.map(f => f.schemeName));
  }, [selectedFunds, visibleFunds, comparisonMetric, startDate, endDate]);

  // Sync zoom and scroll ranges when chartData length changes
  useEffect(() => {
    setCompZoomDays(chartData.length);
    setCompPanOffset(0);
  }, [chartData.length]);

  const slicedChartData = useMemo(() => {
    if (chartData.length === 0) return [];
    const N = chartData.length;
    const windowSize = compZoomDays > 0 ? Math.min(N, compZoomDays) : N;
    const offset = Math.min(N - windowSize, compPanOffset);
    const startIdx = Math.max(0, N - windowSize - offset);
    const endIdx = Math.min(N, startIdx + windowSize);
    return chartData.slice(startIdx, endIdx);
  }, [chartData, compZoomDays, compPanOffset]);

  const interpolationSteps = useMemo(() => {
    const days = slicedChartData.length;
    if (days <= 15) return 12;
    if (days <= 30) return 8;
    if (days <= 60) return 4;
    if (days <= 90) return 2;
    return 1;
  }, [slicedChartData]);

  const interpolatedChartData = useMemo(() => {
    const steps = interpolationSteps;
    if (steps <= 1 || slicedChartData.length < 2) return slicedChartData;

    const activeFundNames = selectedFunds
      .filter(f => f && visibleFunds[f.schemeCode])
      .map(f => f!.schemeName);

    const result: any[] = [];
    for (let i = 0; i < slicedChartData.length - 1; i++) {
      const current = slicedChartData[i];
      const next = slicedChartData[i + 1];

      result.push(current);

      for (let step = 1; step < steps; step++) {
        const t = step / steps;
        const interpolatedPoint: any = {
          date: `${current.date}${"\u200B".repeat(step)}`,
          isIntermediate: true
        };

        activeFundNames.forEach(name => {
          const valCurr = current[name] ?? 0;
          const valNext = next[name] ?? 0;
          interpolatedPoint[name] = Number((valCurr + (valNext - valCurr) * t).toFixed(2));
        });

        result.push(interpolatedPoint);
      }
    }
    result.push(slicedChartData[slicedChartData.length - 1]);
    return result;
  }, [slicedChartData, interpolationSteps, selectedFunds, visibleFunds]);

  const colors = ['#2563eb', '#10b981', '#f59e0b', '#7c3aed', '#db2777', '#0891b2', '#e11d48', '#65a30d'];

  const slotIndices = useMemo(() => {
    const totalSlots = Math.max(3, slotCount, selectedFunds.length);
    return Array.from({ length: totalSlots }, (_, i) => i);
  }, [slotCount, selectedFunds.length]);

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
          Add unlimited mutual fund comparison slots (3 visible at a time with side-scrolling). Displays annualized CAGR and dynamic SIP XIRR returns.
        </p>
      </div>

      {/* Comparison Grid (Horizontal Scroll, 3 slots visible at a time) */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          overflowX: 'auto',
          paddingBottom: '12px',
          scrollSnapType: 'x mandatory'
        }}
      >
        {slotIndices.map(idx => {
          const fund = selectedFunds[idx];
          const query = searchQueries[idx] || '';
          const results = searchResults[idx] || [];
          const searching = isSearching[idx] || false;
          const loading = loadingSlot[idx] || false;

          const sipXirr = fund ? computeSIPXIRR(fund.historicalData, startDate, endDate) : null;
          const slotColor = colors[idx % colors.length];

          return (
            <div
              key={idx}
              className="card-panel"
              style={{
                flex: '0 0 calc(33.333% - 11px)',
                minWidth: '290px',
                scrollSnapAlign: 'start',
                position: 'relative',
                minHeight: '350px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderTop: fund ? `4px solid ${slotColor}` : '1px solid var(--border-light)'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <span className="badge" style={{ backgroundColor: '#f1f5f9', color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                  Slot {idx + 1}
                </span>
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
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>or choose from pinned schemes ({pinnedFunds.length}):</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginTop: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                      {pinnedFunds.filter(f => !selectedFunds.some(sf => sf && sf.schemeCode === f.schemeCode)).map(f => (
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

        {/* Add Slot Button Card */}
        <div
          className="card-panel"
          style={{
            flex: '0 0 calc(33.333% - 11px)',
            minWidth: '220px',
            minHeight: '350px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: '2px dashed var(--border-medium)',
            backgroundColor: '#f8fafc',
            scrollSnapAlign: 'start'
          }}
          onClick={() => setSlotCount(prev => Math.max(prev + 1, selectedFunds.length + 1))}
        >
          <Plus size={36} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontWeight: 700, fontSize: '0.85rem', marginTop: '8px', color: 'var(--color-primary)' }}>
            + Add Comparison Slot
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            (Side-scroll to view all slots)
          </span>
        </div>
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
              <LineChart data={interpolatedChartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={v => (typeof v === 'string' && v.includes('\u200B') ? '' : v)}
                />
                <YAxis stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} domain={['dataMin', 'dataMax']} tickFormatter={val => comparisonMetric === 'NAV' ? `${val}` : `${val}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', fontSize: '12px' }}
                  cursor={{ stroke: '#cbd5e1', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                  labelFormatter={v => (typeof v === 'string' ? v.replace(/\u200B/g, '') : v)}
                />
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
                      isAnimationActive={false}
                      activeDot={{ r: 5 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Custom Zoom & Pan Sliders */}
        {chartData.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px', padding: '12px 18px', backgroundColor: '#f8fafc', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', letterSpacing: '0.02em' }}>🔧 Comparative Chart Zoom & Scroll Controls</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Zoom in on short intervals to compare minor returns closely</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
              {/* Zoom Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Zoom Window: {compZoomDays || chartData.length} Days</span>
                  <span style={{ color: 'var(--text-muted)' }}>{compZoomDays === chartData.length ? 'Show All' : 'Zoomed'}</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max={chartData.length}
                  value={compZoomDays || chartData.length}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCompZoomDays(val);
                    setCompPanOffset(prev => Math.min(prev, chartData.length - val));
                  }}
                  style={{ width: '100%', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                />
              </div>

              {/* Pan Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Scroll / Pan Timeframe</span>
                  <span style={{ color: 'var(--text-muted)' }}>{compPanOffset === 0 ? 'Latest' : `${compPanOffset} Days Ago`}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={chartData.length - (compZoomDays || chartData.length)}
                  value={compPanOffset}
                  onChange={(e) => setCompPanOffset(Number(e.target.value))}
                  disabled={chartData.length === (compZoomDays || chartData.length)}
                  style={{ width: '100%', accentColor: 'var(--color-primary)', cursor: 'pointer', opacity: chartData.length === (compZoomDays || chartData.length) ? 0.4 : 1 }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
