import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Pin,
  Trash2,
  TrendingUp,
  Search,
  Sparkles,
  PieChart,
  Activity,
  Layers,
  Filter,
  ArrowUpRight,
  ZoomOut,
  AlertTriangle,
  Crosshair
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceArea
} from 'recharts';
import { PinnedFund } from '../types/mf';
import { getNavOnDate, formatDateDisplay } from '../services/amfiApi';

interface Page1Props {
  pinnedFunds: PinnedFund[];
  onTogglePin: (schemeCode: number) => void;
  isLoading: boolean;
  colorPalette: string[];
  pastDate: string;
}

interface HoveredPoint {
  date: string;
  items: { name: string; value: number; color: string }[];
}

export const Page1FundExplorer: React.FC<Page1Props> = ({
  pinnedFunds,
  onTogglePin,
  isLoading,
  colorPalette,
  pastDate
}) => {
  const [tableFilter, setTableFilter] = useState('');
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('3M');
  const [chartMode, setChartMode] = useState<'rebased' | 'absolute'>('rebased');

  // --- Zoom state (shared by both the drag-select and the slider) ---
  const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
  const [sliderRange, setSliderRange] = useState<[number, number] | null>(null);

  // --- Hover state, rendered as a fixed panel BELOW the chart instead of a
  // floating box that covers the lines (this replaces the default Tooltip).
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null);

  const isPastDateSelected = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return pastDate !== todayStr;
  }, [pastDate]);

  const filteredFunds = useMemo(() => {
    const q = tableFilter.toLowerCase().trim();
    if (!q) return pinnedFunds;
    return pinnedFunds.filter(
      f =>
        f.schemeName.toLowerCase().includes(q) ||
        f.amc.toLowerCase().includes(q) ||
        f.isin.toLowerCase().includes(q)
    );
  }, [pinnedFunds, tableFilter]);

  const dataQuality = useMemo(() => {
    const missing = pinnedFunds.filter(f => !f.historicalData || f.historicalData.length === 0);
    const sparse = pinnedFunds.filter(
      f => f.historicalData && f.historicalData.length > 0 && f.historicalData.length < 5
    );
    if (missing.length > 0) {
      console.warn(
        '[Page1FundExplorer] Funds with NO historical data returned from AMFI API:',
        missing.map(f => `${f.schemeName} (code ${f.schemeCode})`)
      );
    }
    return { missing, sparse };
  }, [pinnedFunds]);

  // Generate chart data. Missing dates are left as real gaps (not forward-filled)
  // so the line only bends where there's genuine NAV movement.
  const chartData = useMemo(() => {
    if (pinnedFunds.length === 0) return [];
    const dateMap = new Map<string, { [key: string]: any }>();
    const now = new Date();
    let daysToSubtract = 90;
    if (timeframe === '1M') daysToSubtract = 30;
    if (timeframe === '3M') daysToSubtract = 90;
    if (timeframe === '6M') daysToSubtract = 180;
    if (timeframe === '1Y') daysToSubtract = 365;
    if (timeframe === 'ALL') daysToSubtract = 3650;

    const cutoffTime = now.getTime() - daysToSubtract * 24 * 60 * 60 * 1000;

    pinnedFunds.forEach(fund => {
      if (!fund.historicalData || fund.historicalData.length === 0) return;

      const validPoints = fund.historicalData
        .filter(d => d.parsedDate.getTime() >= cutoffTime)
        .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

      const baseNav = validPoints[0]?.nav || fund.latestNav;

      validPoints.forEach(pt => {
        const dateKey = pt.date;
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, {
            date: dateKey,
            parsedDate: pt.parsedDate
          });
        }
        const entry = dateMap.get(dateKey)!;
        if (chartMode === 'rebased') {
          const rebasedVal = baseNav > 0 ? (pt.nav / baseNav) * 100 : 100;
          entry[fund.schemeName] = Math.round(rebasedVal * 10000) / 10000;
        } else {
          entry[fund.schemeName] = pt.nav;
        }
      });
    });

    return Array.from(dateMap.values()).sort(
      (a, b) => a.parsedDate.getTime() - b.parsedDate.getTime()
    );
  }, [pinnedFunds, timeframe, chartMode]);

  useEffect(() => {
    setSliderRange(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
    setHoveredPoint(null);
  }, [pinnedFunds.map(f => f.schemeCode).join(','), timeframe, chartMode]);

  const fullRangeEndIndex = Math.max(chartData.length - 1, 0);
  const effectiveRange: [number, number] = sliderRange ?? [0, fullRangeEndIndex];

  const displayedData = useMemo(() => {
    if (chartData.length === 0) return [];
    const [lo, hi] = effectiveRange;
    const safeLo = Math.max(0, Math.min(lo, chartData.length - 1));
    const safeHi = Math.max(0, Math.min(hi, chartData.length - 1));
    return chartData.slice(Math.min(safeLo, safeHi), Math.max(safeLo, safeHi) + 1);
  }, [chartData, effectiveRange]);

  const isZoomed = sliderRange !== null && (sliderRange[0] > 0 || sliderRange[1] < fullRangeEndIndex);

  // Show real data-point markers once zoomed in enough that they won't clutter
  // the line — this makes it visually obvious the curve passes through every
  // actual NAV point rather than just looking like a vague smoothed shape.
  const showDots = displayedData.length > 0 && displayedData.length <= 45;

  const yDomain = useMemo((): [number, number] => {
    if (pinnedFunds.length === 0 || displayedData.length === 0) return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    const keys = pinnedFunds.map(f => f.schemeName);
    displayedData.forEach((row: any) => {
      keys.forEach(k => {
        const v = row[k];
        if (typeof v === 'number' && !Number.isNaN(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      });
    });
    if (min === Infinity || max === -Infinity) return [0, 100];
    if (min === max) {
      const pad = chartMode === 'rebased' ? 1 : Math.max(min * 0.01, 0.5);
      return [min - pad, max + pad];
    }
    const range = max - min;
    const pad = range * 0.12;
    return [Math.round((min - pad) * 10000) / 10000, Math.round((max + pad) * 10000) / 10000];
  }, [pinnedFunds, displayedData, chartMode]);

  // --- Drag-to-zoom + hover tracking on the chart itself ---
  const handleMouseDown = useCallback((e: any) => {
    if (!e || !e.activeLabel) return;
    setRefAreaLeft(e.activeLabel);
  }, []);

  const handleMouseMove = useCallback((e: any) => {
    if (!e || !e.activeLabel) {
      return;
    }
    if (refAreaLeft) {
      setRefAreaRight(e.activeLabel);
    }
    // Track hover regardless of drag state, so the fixed bottom panel always
    // reflects whatever date the cursor is currently over.
    if (Array.isArray(e.activePayload) && e.activePayload.length > 0) {
      setHoveredPoint({
        date: e.activeLabel,
        items: e.activePayload
          .filter((p: any) => typeof p.value === 'number' && !Number.isNaN(p.value))
          .map((p: any) => ({ name: p.name, value: p.value, color: p.color }))
      });
    }
  }, [refAreaLeft]);

  const handleMouseUp = useCallback(() => {
    if (refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight) {
      const leftIdx = chartData.findIndex(d => d.date === refAreaLeft);
      const rightIdx = chartData.findIndex(d => d.date === refAreaRight);
      if (leftIdx !== -1 && rightIdx !== -1) {
        setSliderRange([Math.min(leftIdx, rightIdx), Math.max(leftIdx, rightIdx)]);
      }
    }
    setRefAreaLeft(null);
    setRefAreaRight(null);
  }, [refAreaLeft, refAreaRight, chartData]);

  const handleChartMouseLeave = useCallback(() => {
    setHoveredPoint(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  }, []);

  const handleResetZoom = () => {
    setSliderRange(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const handleSliderStartChange = (val: number) => {
    const currentEnd = effectiveRange[1];
    const clampedStart = Math.min(val, currentEnd - 1 >= 0 ? currentEnd - 1 : currentEnd);
    setSliderRange([Math.max(0, clampedStart), currentEnd]);
  };

  const handleSliderEndChange = (val: number) => {
    const currentStart = effectiveRange[0];
    const clampedEnd = Math.max(val, currentStart + 1 <= fullRangeEndIndex ? currentStart + 1 : currentStart);
    setSliderRange([currentStart, Math.min(fullRangeEndIndex, clampedEnd)]);
  };

  const topReturnFund = useMemo(() => {
    if (pinnedFunds.length === 0) return null;
    return [...pinnedFunds].sort((a, b) => b.return30d - a.return30d)[0];
  }, [pinnedFunds]);

  const bestReturn7dFund = useMemo(() => {
    if (pinnedFunds.length === 0) return null;
    return [...pinnedFunds].sort((a, b) => b.return7d - a.return7d)[0];
  }, [pinnedFunds]);

  const bestReturn30dFund = useMemo(() => {
    if (pinnedFunds.length === 0) return null;
    return [...pinnedFunds].sort((a, b) => b.return30d - a.return30d)[0];
  }, [pinnedFunds]);

  const rangeStartLabel = chartData[effectiveRange[0]]?.date ? formatDateDisplay(chartData[effectiveRange[0]].date) : '';
  const rangeEndLabel = chartData[effectiveRange[1]]?.date ? formatDateDisplay(chartData[effectiveRange[1]].date) : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Welcome Banner */}
      <div className="card-panel" style={{ borderLeft: '4px solid var(--color-primary)', background: 'linear-gradient(90deg, #eff6ff 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'start', gap: '16px' }}>
          <div className="brand-icon" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            <Layers size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              <Sparkles size={12} />
              <span>Interactive Explorer</span>
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)' }}>Master Mutual Fund Explorer</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
              Search and pin mutual funds to view comparative NAV trajectories. Select a past date in the top bar to inspect historical NAV and performance differences at a glance.
            </p>
          </div>
        </div>
      </div>

      {/* Data quality warning */}
      {!isLoading && dataQuality.missing.length > 0 && (
        <div
          className="card-panel"
          style={{
            borderLeft: '4px solid var(--color-warning, #d97706)',
            background: '#fffbeb',
            display: 'flex',
            alignItems: 'start',
            gap: '12px',
            padding: '14px 16px'
          }}
        >
          <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#92400e' }}>
              {dataQuality.missing.length} pinned fund{dataQuality.missing.length > 1 ? 's' : ''} returned no historical NAV data
            </div>
            <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '4px', lineHeight: '1.5' }}>
              These schemes won't appear on the chart below because AMFI returned an empty history for them. This is usually a
              temporary API hiccup or a scheme that only just launched — try Refresh, or check the console for the exact codes.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {dataQuality.missing.map(f => (
                <span
                  key={f.schemeCode}
                  style={{
                    fontSize: '0.68rem',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: '#fef3c7',
                    color: '#92400e',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid #fde68a'
                  }}
                  title={f.schemeName}
                >
                  {f.schemeCode}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={18} className="text-slate-500" />
            <h3 className="card-title" style={{ margin: 0 }}>Active Directory Comparison</h3>
            <span className="badge badge-blue">{filteredFunds.length} Funds</span>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Filter list by name, AMC, ISIN..."
              value={tableFilter}
              onChange={e => setTableFilter(e.target.value)}
              className="input-text"
              style={{ width: '260px', padding: '8px 12px' }}
            />
          </div>
        </div>

        <div className="table-wrapper">
          <table className="financial-table">
            <thead>
              <tr>
                <th>Fund Name</th>
                <th>ISIN</th>
                <th>AMC</th>
                <th>Launch Date</th>
                <th style={{ textAlign: 'right' }}>Latest NAV</th>
                <th style={{ textAlign: 'right' }}>NAV As Of</th>
                <th style={{ textAlign: 'right' }}>NAV on Selected Date</th>
                <th style={{ textAlign: 'right' }}>NAV Diff %</th>
                <th style={{ textAlign: 'right' }}>7D Return</th>
                <th style={{ textAlign: 'right' }}>30D Return</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={11} style={{ padding: '16px' }}><div className="skeleton" style={{ height: '18px' }}></div></td>
                  </tr>
                ))
              ) : filteredFunds.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                    No funds pinned yet. Use the search bar above to find and pin funds.
                  </td>
                </tr>
              ) : (
                filteredFunds.map((fund, idx) => {
                  const pastNavData = getNavOnDate(fund, pastDate);
                  let pastDiffPct: number | null = null;
                  if (pastNavData && pastNavData.nav > 0) {
                    pastDiffPct = ((fund.latestNav - pastNavData.nav) / pastNavData.nav) * 100;
                  }
                  const hasNoHistory = !fund.historicalData || fund.historicalData.length === 0;

                  return (
                    <tr key={fund.schemeCode}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colorPalette[idx % colorPalette.length], flexShrink: 0 }}></span>
                          <span title={fund.schemeName} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>{fund.schemeName}</span>
                          {hasNoHistory && (
                            <span title="No historical NAV data returned" style={{ display: 'inline-flex' }}>
                              <AlertTriangle size={12} style={{ color: '#d97706', flexShrink: 0 }} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fund.isin}</td>
                      <td style={{ fontSize: '0.8rem', fontWeight: 500 }}>{fund.amc}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{fund.launchDate}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>₹{fund.latestNav.toFixed(4)}</td>
                      <td style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{fund.navAsOf}</td>

                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {pastNavData ? (
                          <span title={`NAV on ${pastNavData.date}`}>₹{pastNavData.nav.toFixed(4)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {pastDiffPct !== null ? (
                          <span className={pastDiffPct >= 0 ? 'val-positive' : 'val-negative'}>
                            {pastDiffPct >= 0 ? '+' : ''}{pastDiffPct.toFixed(2)}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <span className={fund.return7d >= 0 ? 'val-positive' : 'val-negative'}>
                          {fund.return7d >= 0 ? '+' : ''}{fund.return7d.toFixed(2)}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={fund.return30d >= 0 ? 'val-positive' : 'val-negative'}>
                          {fund.return30d >= 0 ? '+' : ''}{fund.return30d.toFixed(2)}%
                        </span>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <button onClick={() => onTogglePin(fund.schemeCode)} className="btn btn-danger-outline" style={{ padding: '4px 8px', fontSize: '0.72rem' }}>
                          Unpin
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 className="card-title">Performance Comparison Charts</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Compare rebased indices or absolute historical values. Drag on the chart or use the slider below it to zoom.
              Hover to inspect exact values in the panel below.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {isZoomed && (
              <button
                onClick={handleResetZoom}
                className="btn btn-outline"
                style={{ padding: '4px 10px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Reset zoom to full range"
              >
                <ZoomOut size={13} />
                Reset Zoom
              </button>
            )}

            <div style={{ display: 'flex', backgroundColor: '#e2e8f0', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
              <button onClick={() => setChartMode('rebased')} className="btn" style={{ padding: '4px 10px', fontSize: '0.72rem', backgroundColor: chartMode === 'rebased' ? '#ffffff' : 'transparent', color: 'var(--text-primary)', boxShadow: chartMode === 'rebased' ? 'var(--shadow-sm)' : 'none' }}>Rebased (Base 100)</button>
              <button onClick={() => setChartMode('absolute')} className="btn" style={{ padding: '4px 10px', fontSize: '0.72rem', backgroundColor: chartMode === 'absolute' ? '#ffffff' : 'transparent', color: 'var(--text-primary)', boxShadow: chartMode === 'absolute' ? 'var(--shadow-sm)' : 'none' }}>Absolute NAV</button>
            </div>

            <div style={{ display: 'flex', backgroundColor: '#e2e8f0', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
              {(['1M', '3M', '6M', '1Y', 'ALL'] as const).map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)} className="btn" style={{ padding: '4px 8px', fontSize: '0.72rem', backgroundColor: timeframe === tf ? '#ffffff' : 'transparent', color: 'var(--text-primary)', boxShadow: timeframe === tf ? 'var(--shadow-sm)' : 'none' }}>{tf}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="panel-grid-4">
          <div className="card-panel" style={{ padding: '16px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Pinned Funds</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: '4px' }}>{pinnedFunds.length}</div>
          </div>
          <div className="card-panel" style={{ padding: '16px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Best 30D Return</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '4px' }}>
              {topReturnFund ? `+${topReturnFund.return30d.toFixed(2)}%` : '—'}
            </div>
            {topReturnFund && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topReturnFund.schemeName.split('-')[0].trim()}</div>}
          </div>
          <div className="card-panel" style={{ padding: '16px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Best 7D Return</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-warning)', marginTop: '4px' }}>
              {bestReturn7dFund ? `+${bestReturn7dFund.return7d.toFixed(2)}%` : '—'}
            </div>
            {bestReturn7dFund && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bestReturn7dFund.schemeName.split('-')[0].trim()}</div>}
          </div>
          <div className="card-panel" style={{ padding: '16px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Funds w/ Data</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-purple)', marginTop: '4px' }}>
              {pinnedFunds.filter(f => f.historicalData && f.historicalData.length > 0).length} / {pinnedFunds.length}
            </div>
          </div>
        </div>

        <div className="card-panel">
          {pinnedFunds.length === 0 ? (
            <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifySelf: 'center', color: 'var(--text-muted)' }}>
              Pin schemes to view trajectory chart overlay.
            </div>
          ) : chartData.length === 0 ? (
            <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center', padding: '0 24px' }}>
              No chart data in this range — the pinned funds may have no historical NAV points within the selected timeframe.
            </div>
          ) : (
            <>
              <div style={{ height: '320px', width: '100%', userSelect: 'none' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={displayedData}
                    margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleChartMouseLeave}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} allowDataOverflow />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      domain={yDomain}
                      allowDataOverflow
                      tickFormatter={val => chartMode === 'rebased' ? `${val}` : `₹${val}`}
                    />
                    {/* Default popup box is suppressed (content=null) — we keep only the
                        dashed crosshair cursor. Actual values render in the fixed panel
                        below the chart instead of a floating box over the lines. */}
                    <Tooltip
                      content={() => null}
                      cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4', strokeWidth: 1 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }} />
                    {pinnedFunds.map((fund, idx) => (
                      <Line
                        key={fund.schemeCode}
                        type="natural"
                        dataKey={fund.schemeName}
                        stroke={colorPalette[idx % colorPalette.length]}
                        strokeWidth={2}
                        dot={showDots ? { r: 2.5, strokeWidth: 0, fill: colorPalette[idx % colorPalette.length] } : false}
                        activeDot={{ r: 4 }}
                        connectNulls
                        isAnimationActive={false}
                      />
                    ))}
                    {refAreaLeft && refAreaRight && (
                      <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#2563eb" fillOpacity={0.12} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Fixed hover panel — pinned below the chart, never overlaps the lines */}
              <div className="chart-hover-panel">
                {hoveredPoint ? (
                  <>
                    <div className="chart-hover-date">
                      <Crosshair size={12} />
                      {formatDateDisplay(hoveredPoint.date)}
                    </div>
                    <div className="chart-hover-grid">
                      {hoveredPoint.items.map(item => (
                        <div key={item.name} className="chart-hover-item">
                          <span className="chart-hover-dot" style={{ backgroundColor: item.color }} />
                          <span className="chart-hover-name" title={item.name}>{item.name}</span>
                          <span className="chart-hover-value">
                            {chartMode === 'rebased' ? item.value.toFixed(4) : `₹${item.value.toFixed(4)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="chart-hover-placeholder">Hover over the chart to inspect exact values for a date.</div>
                )}
              </div>

              {/* Dual-handle zoom slider */}
              {chartData.length > 2 && (
                <div style={{ marginTop: '18px', padding: '0 8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
                    <span>{rangeStartLabel}</span>
                    <span>{rangeEndLabel}</span>
                  </div>
                  <div className="dual-slider-track">
                    <div
                      className="dual-slider-fill"
                      style={{
                        left: `${(effectiveRange[0] / fullRangeEndIndex) * 100}%`,
                        right: `${100 - (effectiveRange[1] / fullRangeEndIndex) * 100}%`
                      }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={fullRangeEndIndex}
                      value={effectiveRange[0]}
                      onChange={e => handleSliderStartChange(Number(e.target.value))}
                      className="dual-slider-input dual-slider-input-left"
                    />
                    <input
                      type="range"
                      min={0}
                      max={fullRangeEndIndex}
                      value={effectiveRange[1]}
                      onChange={e => handleSliderEndChange(Number(e.target.value))}
                      className="dual-slider-input dual-slider-input-right"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Scoped styles for the dual-handle zoom slider + fixed hover panel */}
      <style>{`
        .chart-hover-panel {
          margin-top: 14px;
          padding: 10px 14px;
          border: 1px solid var(--border-light, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          background-color: #f8fafc;
          min-height: 44px;
        }
        .chart-hover-date {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-primary, #0f172a);
          font-family: var(--font-mono);
          margin-bottom: 8px;
        }
        .chart-hover-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 6px 16px;
        }
        .chart-hover-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.74rem;
          min-width: 0;
        }
        .chart-hover-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .chart-hover-name {
          color: var(--text-secondary, #475569);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          min-width: 0;
        }
        .chart-hover-value {
          font-weight: 700;
          font-family: var(--font-mono);
          color: var(--text-primary, #0f172a);
          flex-shrink: 0;
        }
        .chart-hover-placeholder {
          font-size: 0.74rem;
          color: var(--text-muted, #94a3b8);
          text-align: center;
          padding: 4px 0;
        }

        .dual-slider-track {
          position: relative;
          height: 28px;
        }
        .dual-slider-fill {
          position: absolute;
          top: 12px;
          height: 4px;
          background-color: var(--color-primary, #2563eb);
          border-radius: 2px;
          pointer-events: none;
        }
        .dual-slider-input {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          margin: 0;
          height: 28px;
          background: transparent;
          -webkit-appearance: none;
          appearance: none;
          pointer-events: none;
        }
        .dual-slider-track::before {
          content: '';
          position: absolute;
          top: 12px;
          left: 0;
          right: 0;
          height: 4px;
          background-color: #e2e8f0;
          border-radius: 2px;
        }
        .dual-slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          pointer-events: all;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          border: 2.5px solid var(--color-primary, #2563eb);
          cursor: pointer;
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.15));
          position: relative;
          z-index: 2;
        }
        .dual-slider-input::-moz-range-thumb {
          pointer-events: all;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          border: 2.5px solid var(--color-primary, #2563eb);
          cursor: pointer;
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.15));
        }
        .dual-slider-input::-webkit-slider-runnable-track {
          background: transparent;
        }
        .dual-slider-input::-moz-range-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
};
