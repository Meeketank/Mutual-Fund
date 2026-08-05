import React, { useState, useMemo } from 'react';
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
  ArrowUpRight
} from 'lucide-react';
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
import { PinnedFund } from '../types/mf';
import { getNavOnDate, formatDateDisplay } from '../services/amfiApi';

interface Page1Props {
  pinnedFunds: PinnedFund[];
  onTogglePin: (schemeCode: number) => void;
  isLoading: boolean;
  colorPalette: string[];
  pastDate: string;
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

  // Determine if a custom past date is selected (different from today)
  const isPastDateSelected = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return pastDate !== todayStr;
  }, [pastDate]);

  // Filtered table list
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

  // Generate chart data
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
      const validPoints = fund.historicalData.filter(
        d => d.parsedDate.getTime() >= cutoffTime
      ).sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

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
          entry[fund.schemeName] = Math.round(rebasedVal * 100) / 100;
        } else {
          entry[fund.schemeName] = pt.nav;
        }
      });
    });

    return Array.from(dateMap.values()).sort(
      (a, b) => a.parsedDate.getTime() - b.parsedDate.getTime()
    );
  }, [pinnedFunds, timeframe, chartMode]);

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

                  return (
                    <tr key={fund.schemeCode}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colorPalette[idx % colorPalette.length], flexShrink: 0 }}></span>
                          <span title={fund.schemeName} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>{fund.schemeName}</span>
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
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Compare rebased indices or absolute historical values</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
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
              {pinnedFunds.filter(f => f.historicalData.length > 0).length} / {pinnedFunds.length}
            </div>
          </div>
        </div>

        <div className="card-panel">
          {pinnedFunds.length === 0 ? (
            <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifySelf: 'center', color: 'var(--text-muted)' }}>
              Pin schemes to view trajectory chart overlay.
            </div>
          ) : (
            <div style={{ height: '320px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={val => chartMode === 'rebased' ? `${val}` : `₹${val}`} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }} />
                  {pinnedFunds.map((fund, idx) => (
                    <Line
                      key={fund.schemeCode}
                      type="monotone"
                      dataKey={fund.schemeName}
                      stroke={colorPalette[idx % colorPalette.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
