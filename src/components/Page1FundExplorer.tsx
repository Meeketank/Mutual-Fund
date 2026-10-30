import React, { useState, useMemo, useCallback } from 'react';
import { Sparkles, Layers, Filter, AlertTriangle, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea, ReferenceLine, ReferenceDot } from 'recharts';
import { PinnedFund } from '../types/mf';
import { getNavOnDate, formatDateDisplay } from '../services/amfiApi';
import { DAY_MS, todayISO, absoluteReturnPct, alignSeries, carriedKey, valueKey, AlignedRow } from '../services/calc';
import { realDot } from './chartParts';
import { useChartZoom, PointPanel, ZoomBar, SeriesDef, TimeRow, smartTicks, spanTickFormatter } from './ChartToolkit';
import { fmtNav, fmtPct, pctClass, shortName, downloadCSV } from '../services/format';

interface Page1Props {
  pinnedFunds: PinnedFund[];
  onTogglePin: (schemeCode: number) => void;
  isLoading: boolean;
  colorPalette: string[];
  pastDate: string;
}


type SortKey = 'name' | 'nav' | 'day' | 'diff' | 'r7' | 'r30' | 'r1y' | 'r3y';

const key = (code: number) => `f${code}`;

export const Page1FundExplorer: React.FC<Page1Props> = ({ pinnedFunds, onTogglePin, isLoading, colorPalette, pastDate }) => {
  const [tableFilter, setTableFilter] = useState('');
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '6M' | '1Y' | '3Y' | 'ALL'>('3M');
  const [chartMode, setChartMode] = useState<'rebased' | 'absolute'>('rebased');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);

  const isPastDateSelected = pastDate !== todayISO();
  const colorOf = useCallback(
    (code: number) => colorPalette[Math.max(0, pinnedFunds.findIndex(f => f.schemeCode === code)) % colorPalette.length],
    [pinnedFunds, colorPalette]
  );

  const rows = useMemo(() => {
    const q = tableFilter.toLowerCase().trim();
    const list = pinnedFunds
      .filter(f => !q || [f.schemeName, f.amc, f.isin, f.category, String(f.schemeCode)].some(v => v.toLowerCase().includes(q)))
      .map(fund => {
        const past = getNavOnDate(fund, pastDate);
        const diff = past ? absoluteReturnPct(past.nav, fund.latestNav) : null;
        return { fund, past, diff };
      });
    if (!sort) return list;
    const val = (r: (typeof list)[number]): number | string | null => {
      switch (sort.key) {
        case 'name': return r.fund.schemeName;
        case 'nav': return r.fund.latestNav;
        case 'day': return r.fund.dayChangePct;
        case 'diff': return r.diff;
        case 'r7': return r.fund.return7d;
        case 'r30': return r.fund.return30d;
        case 'r1y': return r.fund.return1y;
        case 'r3y': return r.fund.return3y;
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === 'string') return va.localeCompare(vb as string) * sort.dir;
      return ((va as number) - (vb as number)) * sort.dir;
    });
  }, [pinnedFunds, tableFilter, pastDate, sort]);

  const toggleSort = (k: SortKey) =>
    setSort(prev => (prev?.key === k ? (prev.dir === -1 ? { key: k, dir: 1 } : null) : { key: k, dir: k === 'name' ? 1 : -1 }));

  const SortTh: React.FC<{ k: SortKey; children: React.ReactNode; align?: 'left' | 'right' }> = ({ k, children, align = 'right' }) => (
    <th style={{ textAlign: align, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(k)} aria-sort={sort?.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {children}
        {sort?.key === k && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </span>
    </th>
  );

  const staleFunds = useMemo(() => pinnedFunds.filter(f => f.isStale), [pinnedFunds]);

  // ---- Chart data ---------------------------------------------------------
  // The window is anchored on the newest NAV date across funds (not "now"),
  // so a holiday or late NAV publish never shrinks the chart.
  const chartData = useMemo<AlignedRow[]>(() => {
    const withData = pinnedFunds.filter(f => f.historyAsc.length > 0);
    if (withData.length === 0) return [];
    const newest = Math.max(...withData.map(f => f.latestNavDate!.getTime()));
    const days = { '1M': 30, '3M': 91, '6M': 182, '1Y': 365, '3Y': 365 * 3, ALL: Infinity }[timeframe];
    const cutoff = days === Infinity ? -Infinity : newest - days * DAY_MS;

    const from = days === Infinity ? Math.min(...withData.map(f => f.historyAsc[0].parsedDate.getTime())) : cutoff;
    // One shared date grid; days a fund didn't publish carry its last NAV (no holes).
    return alignSeries(
      withData.map(f => ({ key: key(f.schemeCode), asc: f.historyAsc })),
      from,
      newest + DAY_MS,
      chartMode === 'rebased' ? 'rebased' : 'nav'
    );
  }, [pinnedFunds, timeframe, chartMode]);

  const fundsKey = pinnedFunds.map(f => f.schemeCode).join(',');
  const zoom = useChartZoom(chartData, `${fundsKey}|${timeframe}|${chartMode}`);
  const displayedData = zoom.visible;
  const showDots = displayedData.length > 0 && displayedData.length <= 60;
  const tickFmt = spanTickFormatter(displayedData);
  const xTicks = smartTicks(displayedData);

  // Y axis fits only the visible window, so small moves are magnified when zoomed in.
  const yDomain = useMemo((): [number, number] => {
    let min = Infinity;
    let max = -Infinity;
    displayedData.forEach(row => {
      pinnedFunds.forEach(f => {
        const v = row[valueKey(key(f.schemeCode))];
        if (typeof v === 'number') {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      });
    });
    if (!isFinite(min)) return [0, 100];
    if (min === max) {
      const pad = Math.max(Math.abs(min) * 0.001, 0.01);
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.08;
    return [min - pad, max + pad];
  }, [pinnedFunds, displayedData]);

  const series: SeriesDef[] = useMemo(
    () =>
      pinnedFunds.map(f => {
        const k = key(f.schemeCode);
        return {
          key: k,
          name: f.schemeName,
          color: colorOf(f.schemeCode),
          getValue: (r: TimeRow) => r[valueKey(k)],
          isCarried: (r: TimeRow) => !!r[carriedKey(k)],
          format: chartMode === 'rebased' ? (v: number) => v.toFixed(3) : (v: number) => fmtNav(v),
          change: chartMode === 'rebased' ? 'pct' : 'abs-pct'
        } as SeriesDef;
      }),
    [pinnedFunds, colorOf, chartMode]
  );
  const selectedRow = zoom.locked !== null ? zoom.data[zoom.locked] : null;

  const best = (pick: (f: PinnedFund) => number | null) => {
    const c = pinnedFunds.filter(f => pick(f) !== null);
    return c.length ? c.reduce((a, b) => (pick(b)! > pick(a)! ? b : a)) : null;
  };
  const best30 = best(f => f.return30d);
  const best1y = best(f => f.return1y);

  const exportCSV = () => {
    downloadCSV(`pinned_funds_${todayISO()}.csv`, [
      ['Scheme Code', 'Fund', 'ISIN', 'AMC', 'Category', 'Latest NAV', 'NAV Date', '1D %', `NAV on ${pastDate}`, 'Change since %', '7D %', '30D %', '1Y %', '3Y CAGR %', '5Y CAGR %'],
      ...rows.map(r => [
        r.fund.schemeCode, r.fund.schemeName, r.fund.isin, r.fund.amc, r.fund.category, r.fund.latestNav, r.fund.navAsOf, r.fund.dayChangePct,
        r.past?.nav ?? '', r.diff !== null ? r.diff.toFixed(4) : '', r.fund.return7d, r.fund.return30d, r.fund.return1y, r.fund.return3y, r.fund.return5y
      ])
    ]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card-panel page-hero" style={{ borderLeft: '4px solid var(--color-primary)', background: 'linear-gradient(90deg, #eff6ff 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'start', gap: '14px' }}>
          <div className="brand-icon hide-sm" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)', flexShrink: 0 }}>
            <Layers size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              <Sparkles size={12} />
              <span>Interactive Explorer</span>
            </div>
            <h2>Master Mutual Fund Explorer</h2>
            <p>Search and pin funds to compare live AMFI NAVs and returns. Pick a past date in the top bar to see how much each NAV has moved since then.</p>
          </div>
        </div>
      </div>

      {!isLoading && staleFunds.length > 0 && (
        <div className="card-panel" style={{ borderLeft: '4px solid var(--color-warning)', background: '#fffbeb', display: 'flex', gap: '12px', padding: '14px 16px' }}>
          <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.78rem', color: '#92400e', lineHeight: 1.5 }}>
            <strong>
              {staleFunds.length} fund{staleFunds.length > 1 ? 's have' : ' has'} no NAV in the last 5 days
            </strong>{' '}
            (possibly merged, wound up, or a segregated portfolio): {staleFunds.map(f => `${shortName(f.schemeName, 40)} — last NAV ${f.navAsOf}`).join('; ')}.
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid">
        <div className="card-panel stat-card">
          <div className="stat-label">Pinned Funds</div>
          <div className="stat-value" style={{ color: 'var(--color-primary)' }}>{pinnedFunds.length}</div>
          <div className="stat-sub">{new Set(pinnedFunds.map(f => f.amc)).size} AMCs</div>
        </div>
        <div className="card-panel stat-card">
          <div className="stat-label">Best 30D Return</div>
          <div className={`stat-value ${pctClass(best30?.return30d)}`}>{fmtPct(best30?.return30d)}</div>
          <div className="stat-sub" title={best30?.schemeName}>{best30 ? shortName(best30.schemeName) : '—'}</div>
        </div>
        <div className="card-panel stat-card">
          <div className="stat-label">Best 1Y Return</div>
          <div className={`stat-value ${pctClass(best1y?.return1y)}`}>{fmtPct(best1y?.return1y)}</div>
          <div className="stat-sub" title={best1y?.schemeName}>{best1y ? shortName(best1y.schemeName) : '—'}</div>
        </div>
        <div className="card-panel stat-card">
          <div className="stat-label">Latest NAV Date</div>
          <div className="stat-value" style={{ color: 'var(--color-purple)', fontSize: '1.05rem' }}>
            {pinnedFunds.length ? formatDateDisplay(new Date(Math.max(...pinnedFunds.map(f => f.latestNavDate?.getTime() || 0)))) : '—'}
          </div>
          <div className="stat-sub">AMFI publishes NAVs each business day evening</div>
        </div>
      </div>

      {/* Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={18} className="text-slate-500" />
            <h3 className="card-title" style={{ margin: 0 }}>Pinned Funds</h3>
            <span className="badge badge-blue">{rows.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} className="full-sm">
            <input
              type="search"
              placeholder="Filter by name, AMC, ISIN, category…"
              value={tableFilter}
              onChange={e => setTableFilter(e.target.value)}
              className="input-text"
              style={{ width: '280px', flex: '1 1 200px' }}
            />
            <button className="btn btn-outline" onClick={exportCSV} disabled={rows.length === 0} style={{ padding: '7px 12px', fontSize: '0.75rem' }}>
              <Download size={14} /> CSV
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="financial-table">
            <thead>
              <tr>
                <SortTh k="name" align="left">Fund Name</SortTh>
                <th>Category</th>
                <th>ISIN</th>
                <th>AMC</th>
                <SortTh k="nav">Latest NAV</SortTh>
                <SortTh k="day">1D</SortTh>
                <th style={{ textAlign: 'right' }}>NAV As Of</th>
                <th style={{ textAlign: 'right' }}>NAV on {isPastDateSelected ? formatDateDisplay(pastDate) : 'Selected Date'}</th>
                <SortTh k="diff">Change Since</SortTh>
                <SortTh k="r7">7D</SortTh>
                <SortTh k="r30">30D</SortTh>
                <SortTh k="r1y">1Y</SortTh>
                <SortTh k="r3y">3Y CAGR</SortTh>
                <th style={{ textAlign: 'right' }}>History From</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={15} style={{ padding: '16px' }}>
                      <div className="skeleton" style={{ height: '18px' }} />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={15} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)', whiteSpace: 'normal' }}>
                    {pinnedFunds.length === 0 ? 'No funds pinned yet. Use the search bar above to find and pin funds.' : 'No funds match the filter.'}
                  </td>
                </tr>
              ) : (
                rows.map(({ fund, past, diff }) => (
                  <tr key={fund.schemeCode}>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: colorOf(fund.schemeCode), flexShrink: 0 }} />
                        <span title={fund.schemeName} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px' }}>
                          {fund.schemeName}
                        </span>
                        {fund.isStale && (
                          <span title={`No NAV since ${fund.navAsOf}`} style={{ display: 'inline-flex' }}>
                            <AlertTriangle size={12} style={{ color: '#d97706' }} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{fund.category}</td>
                    <td className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{fund.isin}</td>
                    <td style={{ fontSize: '0.78rem' }}>{fund.amc}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtNav(fund.latestNav)}</td>
                    <td style={{ textAlign: 'right' }} className={pctClass(fund.dayChangePct)}>{fmtPct(fund.dayChangePct)}</td>
                    <td style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{fund.navAsOf}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }} title={past ? `NAV published on ${past.date}` : 'No NAV on or before this date'}>
                      {past ? fmtNav(past.nav) : <span className="val-muted">—</span>}
                      {past && isPastDateSelected && past.date !== formatDateDisplay(pastDate) && (
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 400 }}>as of {past.date}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }} className={pctClass(diff)}>{fmtPct(diff)}</td>
                    <td style={{ textAlign: 'right' }} className={pctClass(fund.return7d)}>{fmtPct(fund.return7d)}</td>
                    <td style={{ textAlign: 'right' }} className={pctClass(fund.return30d)}>{fmtPct(fund.return30d)}</td>
                    <td style={{ textAlign: 'right' }} className={pctClass(fund.return1y)}>{fmtPct(fund.return1y)}</td>
                    <td style={{ textAlign: 'right' }} className={pctClass(fund.return3y)}>{fmtPct(fund.return3y)}</td>
                    <td style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{fund.launchDate}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button onClick={() => onTogglePin(fund.schemeCode)} className="btn btn-danger-outline" style={{ padding: '4px 8px', fontSize: '0.72rem' }}>
                        Unpin
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '-4px' }}>
          7D / 30D / 1Y are absolute point-to-point returns; 3Y is CAGR. "—" means the fund doesn't have enough history yet. Tap a column header to sort.
        </p>
      </div>

      {/* Chart */}
      <div className="card-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: 12 }}>
          <div>
            <h3 className="card-title">Performance Comparison Chart</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {chartMode === 'rebased' ? 'Every fund starts at 100 on the same start date, so lines are directly comparable.' : 'Actual published NAV values.'} Lines run smoothly through each fund's real NAV days (dots); on weekends/holidays the hover panel shows the last NAV, marked *.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="segmented">
              <button className={chartMode === 'rebased' ? 'active' : ''} onClick={() => setChartMode('rebased')}>Rebased 100</button>
              <button className={chartMode === 'absolute' ? 'active' : ''} onClick={() => setChartMode('absolute')}>NAV ₹</button>
            </div>
            <div className="segmented">
              {(['1M', '3M', '6M', '1Y', '3Y', 'ALL'] as const).map(tf => (
                <button key={tf} className={timeframe === tf ? 'active' : ''} onClick={() => setTimeframe(tf)}>{tf}</button>
              ))}
            </div>
          </div>
        </div>

        {pinnedFunds.length === 0 ? (
          <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Pin schemes to see the chart.</div>
        ) : chartData.length === 0 ? (
          <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center' }}>No NAV data in this range.</div>
        ) : (
          <>
            <div className="chart-box chart-wrap" tabIndex={0} onKeyDown={zoom.onKeyDown} aria-label="Fund performance chart. Arrow keys step through points, plus and minus zoom.">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={displayedData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} {...zoom.handlers}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={xTicks} stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={tickFmt} />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    domain={yDomain}
                    allowDataOverflow
                    width={chartMode === 'rebased' ? 48 : 64}
                    tickFormatter={v => {
                      const span = yDomain[1] - yDomain[0];
                      const dp = span < 0.5 ? 3 : span < 5 ? 2 : 1;
                      return chartMode === 'rebased' ? Number(v).toFixed(dp) : `₹${Number(v) >= 1000 ? Number(v).toFixed(span < 5 ? 2 : 0) : Number(v).toFixed(dp)}`;
                    }}
                  />
                  <Tooltip content={() => null} cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4', strokeWidth: 1 }} />
                  {chartMode === 'rebased' && <ReferenceLine y={100} stroke="#cbd5e1" strokeDasharray="2 4" />}
                  {pinnedFunds.map(fund => (
                    <Line
                      key={fund.schemeCode}
                      type="monotone"
                      dataKey={key(fund.schemeCode)}
                      name={fund.schemeName}
                      stroke={colorOf(fund.schemeCode)}
                      strokeWidth={2}
                      dot={showDots ? realDot(key(fund.schemeCode), colorOf(fund.schemeCode)) : false}
                      activeDot={{ r: 4 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                  {selectedRow && <ReferenceLine x={selectedRow.t} stroke="#0f172a" strokeWidth={1} />}
                  {selectedRow &&
                    pinnedFunds.map(f => {
                      const v = selectedRow[valueKey(key(f.schemeCode))];
                      return typeof v === 'number' ? (
                        <ReferenceDot key={f.schemeCode} x={selectedRow.t} y={v} r={5} fill="#fff" stroke={colorOf(f.schemeCode)} strokeWidth={2.5} />
                      ) : null;
                    })}
                  {zoom.dragArea && <ReferenceArea x1={zoom.dragArea[0]} x2={zoom.dragArea[1]} strokeOpacity={0.3} fill="#2563eb" fillOpacity={0.12} />}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <PointPanel zoom={zoom} series={series} />
            <ZoomBar zoom={zoom} presets={[{ label: '7D', days: 7 }, { label: '15D', days: 15 }, { label: '1M', days: 30 }].filter(p => p.days < ({ '1M': 30, '3M': 91, '6M': 182, '1Y': 365, '3Y': 1095, ALL: 1e9 }[timeframe]))} />

            {/* Legend (wraps nicely on phones, unlike the built-in one) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 14 }}>
              {pinnedFunds.map(f => (
                <span key={f.schemeCode} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-secondary)' }} title={f.schemeName}>
                  <span style={{ width: 10, height: 3, borderRadius: 2, background: colorOf(f.schemeCode) }} />
                  {shortName(f.schemeName, 40)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

    </div>
  );
};
