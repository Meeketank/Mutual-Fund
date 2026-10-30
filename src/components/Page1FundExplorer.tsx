import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Sparkles, Layers, Filter, ZoomOut, AlertTriangle, Crosshair, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea } from 'recharts';
import { PinnedFund } from '../types/mf';
import { getNavOnDate, formatDateDisplay } from '../services/amfiApi';
import { DAY_MS, todayISO, absoluteReturnPct, alignSeries, carriedKey, valueKey, timeTicks, AlignedRow } from '../services/calc';
import { realDot, timeTickFormatter } from './chartParts';
import { fmtNav, fmtPct, pctClass, shortName, downloadCSV } from '../services/format';

interface Page1Props {
  pinnedFunds: PinnedFund[];
  onTogglePin: (schemeCode: number) => void;
  isLoading: boolean;
  colorPalette: string[];
  pastDate: string;
}

interface HoveredPoint {
  label: string;
  items: { name: string; value: number; color: string; carried: boolean }[];
}

type SortKey = 'name' | 'nav' | 'day' | 'diff' | 'r7' | 'r30' | 'r1y' | 'r3y';

const key = (code: number) => `f${code}`;

export const Page1FundExplorer: React.FC<Page1Props> = ({ pinnedFunds, onTogglePin, isLoading, colorPalette, pastDate }) => {
  const [tableFilter, setTableFilter] = useState('');
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '6M' | '1Y' | '3Y' | 'ALL'>('3M');
  const [chartMode, setChartMode] = useState<'rebased' | 'absolute'>('rebased');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);

  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [sliderRange, setSliderRange] = useState<[number, number] | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null);

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
  useEffect(() => {
    setSliderRange(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
    setHoveredPoint(null);
  }, [fundsKey, timeframe, chartMode]);

  const lastIdx = Math.max(chartData.length - 1, 0);
  const range: [number, number] = sliderRange ?? [0, lastIdx];
  const displayedData = useMemo(() => chartData.slice(Math.min(range[0], lastIdx), Math.min(range[1], lastIdx) + 1), [chartData, range, lastIdx]);
  const isZoomed = sliderRange !== null && (sliderRange[0] > 0 || sliderRange[1] < lastIdx);
  const showDots = displayedData.length > 0 && displayedData.length <= 45;
  const spanDays = displayedData.length > 1 ? (displayedData[displayedData.length - 1].t - displayedData[0].t) / DAY_MS : 0;
  const tickFmt = timeTickFormatter(spanDays);
  const xTicks = displayedData.length ? timeTicks(displayedData[0].t, displayedData[displayedData.length - 1].t, 6) : [];

  const yDomain = useMemo((): [number, number] => {
    let min = Infinity;
    let max = -Infinity;
    displayedData.forEach(row => {
      pinnedFunds.forEach(f => {
        const v = row[key(f.schemeCode)];
        if (typeof v === 'number') {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      });
    });
    if (!isFinite(min)) return [0, 100];
    if (min === max) {
      const pad = Math.max(Math.abs(min) * 0.01, 0.5);
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.1;
    return [min - pad, max + pad];
  }, [pinnedFunds, displayedData]);


  const handleMouseDown = useCallback((e: any) => {
    if (e?.activeLabel !== undefined) setRefAreaLeft(e.activeLabel);
  }, []);
  const handleMouseMove = useCallback(
    (e: any) => {
      if (!e || e.activeLabel === undefined) return;
      if (refAreaLeft !== null) setRefAreaRight(e.activeLabel);
      const row = e.activePayload?.[0]?.payload as AlignedRow | undefined;
      if (row) {
        setHoveredPoint({
          label: formatDateDisplay(new Date(row.t)),
          items: pinnedFunds
            .map(f => {
              const k = key(f.schemeCode);
              const v = row[valueKey(k)];
              return typeof v === 'number' ? { name: f.schemeName, value: v, color: colorOf(f.schemeCode), carried: !!row[carriedKey(k)] } : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => b.value - a.value)
        });
      }
    },
    [refAreaLeft, pinnedFunds, colorOf]
  );
  const handleMouseUp = useCallback(() => {
    if (refAreaLeft !== null && refAreaRight !== null && refAreaLeft !== refAreaRight) {
      const l = chartData.findIndex(d => d.t === refAreaLeft);
      const r = chartData.findIndex(d => d.t === refAreaRight);
      if (l !== -1 && r !== -1) setSliderRange([Math.min(l, r), Math.max(l, r)]);
    }
    setRefAreaLeft(null);
    setRefAreaRight(null);
  }, [refAreaLeft, refAreaRight, chartData]);

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
              {chartMode === 'rebased' ? 'Every fund starts at 100 on the same start date, so lines are directly comparable.' : 'Actual published NAV values.'} Lines run smoothly through each fund's real NAV days (dots); on weekends/holidays the hover panel shows the last NAV, marked *. Drag on the chart or use the slider to zoom.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {isZoomed && (
              <button onClick={() => setSliderRange(null)} className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>
                <ZoomOut size={13} /> Reset
              </button>
            )}
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
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={displayedData}
                  margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => {
                    setRefAreaLeft(null);
                    setRefAreaRight(null);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={xTicks} stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={tickFmt} />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    domain={yDomain}
                    allowDataOverflow
                    width={chartMode === 'rebased' ? 44 : 62}
                    tickFormatter={v => (chartMode === 'rebased' ? Number(v).toFixed(1) : `₹${Number(v) >= 1000 ? Math.round(v) : Number(v).toFixed(1)}`)}
                  />
                  <Tooltip content={() => null} cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4', strokeWidth: 1 }} />
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
                  {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#2563eb" fillOpacity={0.12} />}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-hover-panel">
              {hoveredPoint ? (
                <>
                  <div className="chart-hover-date">
                    <Crosshair size={12} />
                    {hoveredPoint.label}
                  </div>
                  <div className="chart-hover-grid">
                    {hoveredPoint.items.map(item => (
                      <div key={item.name} className="chart-hover-item">
                        <span className="chart-hover-dot" style={{ backgroundColor: item.color }} />
                        <span className="chart-hover-name" title={item.name}>{item.name}</span>
                        <span className="chart-hover-value">
                          {chartMode === 'rebased' ? `${item.value.toFixed(2)} (${fmtPct(item.value - 100)})` : fmtNav(item.value)}
                          {item.carried && <span title="No NAV published this day; previous NAV carried forward" style={{ color: 'var(--text-muted)', fontWeight: 400 }}> *</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="chart-hover-placeholder">Hover or tap the chart to see exact values for a date. * = no NAV that day, previous NAV carried forward.</div>
              )}
            </div>

            {chartData.length > 2 && (
              <div style={{ marginTop: '16px', padding: '0 4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
                  <span>{formatDateDisplay(new Date(chartData[range[0]].t))}</span>
                  <span>{formatDateDisplay(new Date(chartData[Math.min(range[1], lastIdx)].t))}</span>
                </div>
                <div className="dual-slider-track">
                  <div className="dual-slider-fill" style={{ left: `${(range[0] / lastIdx) * 100}%`, right: `${100 - (range[1] / lastIdx) * 100}%` }} />
                  <input
                    type="range"
                    min={0}
                    max={lastIdx}
                    value={range[0]}
                    onChange={e => setSliderRange([Math.min(Number(e.target.value), range[1] - 1), range[1]])}
                    className="dual-slider-input"
                    aria-label="Zoom start"
                  />
                  <input
                    type="range"
                    min={0}
                    max={lastIdx}
                    value={range[1]}
                    onChange={e => setSliderRange([range[0], Math.max(Number(e.target.value), range[0] + 1)])}
                    className="dual-slider-input"
                    aria-label="Zoom end"
                  />
                </div>
              </div>
            )}

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

      <style>{`
        .chart-hover-panel { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background-color: #f8fafc; min-height: 44px; }
        .chart-hover-date { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 700; color: var(--text-primary); font-family: var(--font-mono); margin-bottom: 8px; }
        .chart-hover-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 6px 16px; }
        .chart-hover-item { display: flex; align-items: center; gap: 6px; font-size: 0.74rem; min-width: 0; }
        .chart-hover-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .chart-hover-name { color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
        .chart-hover-value { font-weight: 700; font-family: var(--font-mono); color: var(--text-primary); flex-shrink: 0; }
        .chart-hover-placeholder { font-size: 0.74rem; color: var(--text-muted); text-align: center; padding: 4px 0; }
        .dual-slider-track { position: relative; height: 28px; }
        .dual-slider-track::before { content: ''; position: absolute; top: 12px; left: 0; right: 0; height: 4px; background-color: #e2e8f0; border-radius: 2px; }
        .dual-slider-fill { position: absolute; top: 12px; height: 4px; background-color: var(--color-primary); border-radius: 2px; pointer-events: none; }
        .dual-slider-input { position: absolute; top: 0; left: 0; width: 100%; margin: 0; height: 28px; background: transparent; -webkit-appearance: none; appearance: none; pointer-events: none; }
        .dual-slider-input::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; pointer-events: all; width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 2.5px solid var(--color-primary); cursor: pointer; box-shadow: var(--shadow-sm); position: relative; z-index: 2; }
        .dual-slider-input::-moz-range-thumb { pointer-events: all; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 2.5px solid var(--color-primary); cursor: pointer; }
        .dual-slider-input::-webkit-slider-runnable-track, .dual-slider-input::-moz-range-track { background: transparent; }
      `}</style>
    </div>
  );
};
