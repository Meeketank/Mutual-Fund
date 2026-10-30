import React, { useState, useMemo, useEffect } from 'react';
import { Building2, Sparkles, BarChart3, Activity, Calculator, Download } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { PinnedFund, GranularNAVRow } from '../types/mf';
import { generateAMCNAVRows, formatDateDisplay } from '../services/amfiApi';
import { endOfDay, parseISODate, returnBetween, shiftISODate, simulateSip, toISODate, timeTicks } from '../services/calc';
import { timeTickFormatter } from './chartParts';
import { fmtNav, fmtPct, fmtINR, pctClass, downloadCSV } from '../services/format';

interface Page3Props {
  pinnedFunds: PinnedFund[];
  isLoading: boolean;
}

export const Page3AMCIndividual: React.FC<Page3Props> = ({ pinnedFunds, isLoading }) => {
  const [selectedSchemeCode, setSelectedSchemeCode] = useState<number | null>(null);
  const [rowLimit, setRowLimit] = useState<number>(60);
  const [magnify, setMagnify] = useState<boolean>(true);
  const [zoomDays, setZoomDays] = useState<number>(60);
  const [panOffset, setPanOffset] = useState<number>(0);

  // Investment calculator
  const [calcMode, setCalcMode] = useState<'lumpsum' | 'sip'>('lumpsum');
  const [calcAmount, setCalcAmount] = useState<number>(100000);
  const [calcFrom, setCalcFrom] = useState<string>('');
  const [calcTo, setCalcTo] = useState<string>('');

  const selectedFund = useMemo(
    () => pinnedFunds.find(f => f.schemeCode === selectedSchemeCode) || pinnedFunds[0] || null,
    [pinnedFunds, selectedSchemeCode]
  );

  useEffect(() => {
    if (!selectedFund?.latestNavDate) return;
    const to = toISODate(selectedFund.latestNavDate);
    setCalcTo(to);
    setCalcFrom(shiftISODate(to, -365));
  }, [selectedFund?.schemeCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const granularRows = useMemo<GranularNAVRow[]>(() => (selectedFund ? generateAMCNAVRows(selectedFund, rowLimit) : []), [selectedFund, rowLimit]);

  const chartData = useMemo(
    () =>
      [...granularRows].reverse().map(r => ({
        t: parseISODate(r.iso).getTime(),
        carried: r.isCarried,
        fullDate: r.date,
        NAV: r.closingNav,
        r7: r.rollingReturn7dAnn,
        r15: r.rollingReturn15dAnn,
        r30: r.rollingReturn30dAnn
      })),
    [granularRows]
  );

  const sliced = useMemo(() => {
    const N = chartData.length;
    if (N === 0) return [];
    const win = Math.min(N, zoomDays);
    const off = Math.min(N - win, panOffset);
    const start = Math.max(0, N - win - off);
    // Window is chosen in calendar days, but only days with a published NAV are
    // plotted on a time axis: weekends/holidays become proportional spacing on the
    // axis (the line runs straight across) instead of flat fake "steps".
    return chartData.slice(start, start + win).filter(r => !r.carried);
  }, [chartData, zoomDays, panOffset]);
  const spanDays = sliced.length > 1 ? (sliced[sliced.length - 1].t - sliced[0].t) / 86400000 : 0;
  const xTicks = sliced.length ? timeTicks(sliced[0].t, sliced[sliced.length - 1].t, 6) : [];

  useEffect(() => {
    setZoomDays(rowLimit);
    setPanOffset(0);
  }, [selectedFund?.schemeCode, rowLimit]);

  const metrics = useMemo(() => {
    if (granularRows.length === 0) return null;
    const navs = granularRows.map(r => r.closingNav);
    const traded = granularRows.filter(r => !r.isCarried);
    const deltas = traded.map(r => r.deltaPercent);
    return {
      maxNav: Math.max(...navs),
      minNav: Math.min(...navs),
      bestDay: deltas.length ? Math.max(...deltas) : null,
      worstDay: deltas.length ? Math.min(...deltas) : null
    };
  }, [granularRows]);

  const calcResult = useMemo(() => {
    if (!selectedFund || !calcFrom || !calcTo) return null;
    const from = parseISODate(calcFrom);
    const to = parseISODate(calcTo);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to || !(calcAmount > 0)) return null;
    if (calcMode === 'lumpsum') {
      const r = returnBetween(selectedFund.historyAsc, endOfDay(from), endOfDay(to));
      if (!r) return null;
      const value = calcAmount * (r.endNav / r.startNav);
      return { kind: 'lumpsum' as const, invested: calcAmount, value, gain: value - calcAmount, abs: r.absolute, ann: r.annualised, days: r.days, start: r.startDate, end: r.endDate, startNav: r.startNav, endNav: r.endNav };
    }
    const sip = simulateSip(selectedFund.historyAsc, from.getTime(), endOfDay(to), calcAmount);
    if (!sip) return null;
    return { kind: 'sip' as const, ...sip };
  }, [selectedFund, calcMode, calcAmount, calcFrom, calcTo]);

  const exportCSV = () => {
    if (!selectedFund) return;
    downloadCSV(`${selectedFund.schemeCode}_daily_${rowLimit}d.csv`, [
      ['Date', 'NAV', 'Previous NAV', 'Change', 'Change %', 'Carried forward', '7D ann %', '15D ann %', '30D ann %'],
      ...granularRows.map(r => [r.iso, r.closingNav, r.openingNav, r.delta, r.deltaPercent, r.isCarried ? 'yes' : 'no', r.rollingReturn7dAnn, r.rollingReturn15dAnn, r.rollingReturn30dAnn])
    ]);
  };

  const Stat = ({ label, value, cls, color }: { label: string; value: string; cls?: string; color?: string }) => (
    <div className="card-panel stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${cls || ''}`} style={{ color, fontSize: '1.15rem' }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card-panel page-hero" style={{ borderLeft: '4px solid var(--color-purple)', background: 'linear-gradient(90deg, #f5f3ff 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          <Sparkles size={12} />
          <span>Fund Deep-Dive</span>
        </div>
        <h2>AMC Individual Analytics & Rolling Returns</h2>
        <p>Daily NAV movement, 7/15/30-day rolling returns (simple annualised, % p.a.), risk statistics and a returns calculator for one scheme.</p>
      </div>

      <div className="card-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 320px', minWidth: 0 }}>
          <Building2 size={20} style={{ color: 'var(--color-purple)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <label className="field-label" htmlFor="scheme-select">Choose Scheme ({pinnedFunds.length} pinned)</label>
            <select
              id="scheme-select"
              value={selectedFund?.schemeCode || ''}
              onChange={e => setSelectedSchemeCode(Number(e.target.value))}
              className="date-picker-input"
              style={{ width: '100%', fontWeight: 600, fontSize: '0.82rem' }}
            >
              {pinnedFunds.map(fund => (
                <option key={fund.schemeCode} value={fund.schemeCode}>{fund.schemeName}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Days:</span>
          <div className="segmented">
            {[30, 60, 90, 180, 365].map(l => (
              <button key={l} className={rowLimit === l ? 'active' : ''} onClick={() => setRowLimit(l)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="card-panel"><div className="skeleton" style={{ height: 200 }} /></div>
      ) : !selectedFund ? (
        <div className="card-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <BarChart3 size={40} style={{ margin: '0 auto 12px', color: 'var(--border-medium)' }} />
          <h3>No Scheme Selected</h3>
          <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Pin mutual funds to examine their daily details.</p>
        </div>
      ) : (
        <>
          <div className="card-panel" style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
            <span><strong>AMC:</strong> {selectedFund.amc}</span>
            <span><strong>Category:</strong> {selectedFund.category}</span>
            <span><strong>ISIN:</strong> <span className="font-mono">{selectedFund.isin}</span></span>
            <span><strong>Code:</strong> <span className="font-mono">{selectedFund.schemeCode}</span></span>
            <span><strong>History from:</strong> {selectedFund.launchDate}</span>
          </div>

          <div className="stat-grid">
            <Stat label={`Latest NAV (${selectedFund.navAsOf})`} value={fmtNav(selectedFund.latestNav)} color="var(--text-primary)" />
            <Stat label="1-Day Change" value={fmtPct(selectedFund.dayChangePct)} cls={pctClass(selectedFund.dayChangePct)} />
            <Stat label="7D (ann.)" value={fmtPct(selectedFund.return7dAnn)} cls={pctClass(selectedFund.return7dAnn)} />
            <Stat label="15D (ann.)" value={fmtPct(selectedFund.return15dAnn)} cls={pctClass(selectedFund.return15dAnn)} />
            <Stat label="30D (ann.)" value={fmtPct(selectedFund.return30dAnn)} cls={pctClass(selectedFund.return30dAnn)} />
            <Stat label="3 Months" value={fmtPct(selectedFund.return3m)} cls={pctClass(selectedFund.return3m)} />
            <Stat label="6 Months" value={fmtPct(selectedFund.return6m)} cls={pctClass(selectedFund.return6m)} />
            <Stat label="1 Year" value={fmtPct(selectedFund.return1y)} cls={pctClass(selectedFund.return1y)} />
            <Stat label="3Y CAGR" value={fmtPct(selectedFund.return3y)} cls={pctClass(selectedFund.return3y)} />
            <Stat label="5Y CAGR" value={fmtPct(selectedFund.return5y)} cls={pctClass(selectedFund.return5y)} />
            <Stat label="Since Start CAGR" value={fmtPct(selectedFund.returnSinceStart)} cls={pctClass(selectedFund.returnSinceStart)} />
            <Stat label="Volatility (1Y, ann.)" value={fmtPct(selectedFund.volatility1y, 2, false)} color="var(--color-warning)" />
            <Stat label="Max Drawdown (1Y)" value={fmtPct(selectedFund.maxDrawdown1y, 2, false)} cls={selectedFund.maxDrawdown1y ? 'val-negative' : ''} />
            {metrics && <Stat label={`High / Low (${rowLimit}d)`} value={`${fmtNav(metrics.maxNav, 2)} / ${fmtNav(metrics.minNav, 2)}`} color="var(--text-primary)" />}
            {metrics && <Stat label={`Best / Worst day (${rowLimit}d)`} value={`${fmtPct(metrics.bestDay)} / ${fmtPct(metrics.worstDay)}`} color="var(--text-primary)" />}
          </div>

          {/* Chart */}
          <div className="card-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 className="card-title" style={{ margin: 0 }}>NAV & Rolling Returns (% p.a.)</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={magnify} onChange={e => setMagnify(e.target.checked)} style={{ accentColor: 'var(--color-purple)' }} />
                  Auto-scale returns axis
                </label>
                <div className="segmented">
                  {[7, 15, 30].map(d => (
                    <button key={d} className={zoomDays === Math.min(rowLimit, d) ? 'active' : ''} onClick={() => { setZoomDays(Math.min(rowLimit, d)); setPanOffset(0); }}>{d}D</button>
                  ))}
                  <button className={zoomDays === rowLimit ? 'active' : ''} onClick={() => { setZoomDays(rowLimit); setPanOffset(0); }}>All</button>
                </div>
              </div>
            </div>
            <div className="chart-box" style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={sliced} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={xTicks} tickFormatter={timeTickFormatter(spanDays)} stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis yAxisId="left" stroke="#7c3aed" tick={{ fill: '#7c3aed', fontSize: 10 }} domain={['auto', 'auto']} width={56} tickFormatter={v => `₹${Number(v) >= 1000 ? Math.round(v) : Number(v).toFixed(2)}`} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#059669"
                    tick={{ fill: '#059669', fontSize: 10 }}
                    width={44}
                    tickFormatter={v => `${Number(v).toFixed(1)}%`}
                    domain={magnify ? ['auto', 'auto'] : [(min: number) => Math.min(0, min), (max: number) => Math.max(10, max)]}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', fontSize: '12px' }}
                    labelFormatter={(_, p) => (p?.[0]?.payload?.fullDate as string) || ''}
                    formatter={(v: any, name: any) => [name === 'NAV (₹)' ? fmtNav(v) : `${Number(v).toFixed(2)}%`, name]}
                  />
                  <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '11px' }} />
                  <Line yAxisId="left" type="monotone" dataKey="NAV" stroke="#7c3aed" strokeWidth={2.5} dot={sliced.length <= 45 ? { r: 2.5, fill: '#7c3aed', strokeWidth: 0 } : false} name="NAV (₹)" isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="r7" stroke="#2563eb" strokeWidth={1.5} dot={false} name="7D % p.a." isAnimationActive={false} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="r15" stroke="#d97706" strokeWidth={1.5} dot={false} name="15D % p.a." isAnimationActive={false} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="r30" stroke="#059669" strokeWidth={2} dot={false} name="30D % p.a." isAnimationActive={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {rowLimit > zoomDays && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <span>Scroll back in time</span>
                  <span style={{ color: 'var(--text-muted)' }}>{panOffset === 0 ? 'Latest' : `${panOffset} days back`}</span>
                </div>
                <input type="range" min={0} max={Math.max(0, chartData.length - zoomDays)} value={panOffset} onChange={e => setPanOffset(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-purple)' }} />
              </div>
            )}
          </div>

          {/* Calculator */}
          <div className="card-panel" style={{ borderTop: '3px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <Calculator size={18} style={{ color: 'var(--color-primary)' }} /> Returns Calculator
              </h3>
              <div className="segmented">
                <button className={calcMode === 'lumpsum' ? 'active' : ''} onClick={() => setCalcMode('lumpsum')}>Lumpsum</button>
                <button className={calcMode === 'sip' ? 'active' : ''} onClick={() => setCalcMode('sip')}>Monthly SIP</button>
              </div>
            </div>
            <div className="calc-grid">
              <div>
                <label className="field-label" htmlFor="calc-amt">{calcMode === 'sip' ? 'Monthly amount (₹)' : 'Amount (₹)'}</label>
                <input id="calc-amt" type="number" inputMode="numeric" min={1} className="input-text" style={{ width: '100%' }} value={calcAmount} onChange={e => setCalcAmount(Number(e.target.value))} />
              </div>
              <div>
                <label className="field-label" htmlFor="calc-from">From</label>
                <input id="calc-from" type="date" className="input-text" style={{ width: '100%' }} value={calcFrom} max={calcTo} onChange={e => setCalcFrom(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="calc-to">To</label>
                <input id="calc-to" type="date" className="input-text" style={{ width: '100%' }} value={calcTo} min={calcFrom} onChange={e => setCalcTo(e.target.value)} />
              </div>
            </div>
            {calcResult ? (
              <div className="stat-grid" style={{ marginTop: 14 }}>
                <div className="stat-card" style={{ background: '#f8fafc', borderRadius: 10 }}>
                  <div className="stat-label">Invested</div>
                  <div className="stat-value" style={{ fontSize: '1.1rem' }}>{fmtINR(calcResult.invested)}</div>
                  {calcResult.kind === 'sip' && <div className="stat-sub">{calcResult.installments} instalments</div>}
                </div>
                <div className="stat-card" style={{ background: '#f8fafc', borderRadius: 10 }}>
                  <div className="stat-label">Value on {formatDateDisplay(calcResult.kind === 'sip' ? calcResult.valueDate : calcResult.end)}</div>
                  <div className="stat-value" style={{ fontSize: '1.1rem' }}>{fmtINR(calcResult.kind === 'sip' ? calcResult.currentValue : calcResult.value)}</div>
                </div>
                <div className="stat-card" style={{ background: '#f8fafc', borderRadius: 10 }}>
                  <div className="stat-label">Gain</div>
                  <div className={`stat-value ${pctClass(calcResult.gain)}`} style={{ fontSize: '1.1rem' }}>{fmtINR(calcResult.gain)}</div>
                  <div className="stat-sub">{fmtPct(calcResult.kind === 'sip' ? calcResult.absoluteReturn : calcResult.abs)} absolute</div>
                </div>
                <div className="stat-card" style={{ background: '#f8fafc', borderRadius: 10 }}>
                  <div className="stat-label">{calcResult.kind === 'sip' ? 'XIRR' : calcResult.days >= 365 ? 'CAGR' : 'Annualised (simple)'}</div>
                  <div className={`stat-value ${pctClass(calcResult.kind === 'sip' ? calcResult.xirr : calcResult.ann)}`} style={{ fontSize: '1.1rem' }}>
                    {fmtPct(calcResult.kind === 'sip' ? calcResult.xirr : calcResult.ann)}
                  </div>
                  {calcResult.kind === 'lumpsum' && (
                    <div className="stat-sub">
                      {fmtNav(calcResult.startNav)} ({formatDateDisplay(calcResult.start)}) → {fmtNav(calcResult.endNav)}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 12 }}>
                Pick a valid date range within the fund's history ({selectedFund.launchDate} – {selectedFund.navAsOf}). SIP needs at least two monthly instalments.
              </p>
            )}
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 10 }}>Uses published NAVs only; ignores exit load, stamp duty and taxes.</p>
          </div>

          {/* Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={16} style={{ color: 'var(--color-purple)' }} />
                Daily NAV & Rolling Return Table
              </h4>
              <button className="btn btn-outline" onClick={exportCSV} style={{ padding: '6px 10px', fontSize: '0.74rem' }}>
                <Download size={14} /> CSV
              </button>
            </div>
            <div className="table-wrapper">
              <table className="financial-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>NAV (₹)</th>
                    <th style={{ textAlign: 'right' }}>Prev. NAV</th>
                    <th style={{ textAlign: 'right' }}>Change (₹)</th>
                    <th style={{ textAlign: 'right' }}>Change %</th>
                    <th style={{ textAlign: 'right' }}>7D % p.a.</th>
                    <th style={{ textAlign: 'right' }}>15D % p.a.</th>
                    <th style={{ textAlign: 'right' }}>30D % p.a.</th>
                  </tr>
                </thead>
                <tbody>
                  {granularRows.map(row => (
                    <tr key={row.id} className={row.isCarried ? 'row-carried' : ''}>
                      <td className="font-mono" style={{ fontSize: '0.74rem', fontWeight: 600, color: row.isCarried ? undefined : 'var(--color-purple)' }}>
                        {row.date}
                        {row.isCarried && <span className="carried-tag" title="No NAV published — previous NAV carried forward">no NAV</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtNav(row.closingNav)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtNav(row.openingNav)}</td>
                      <td style={{ textAlign: 'right' }} className={row.isCarried ? '' : pctClass(row.delta)}>
                        {row.delta > 0 ? '+' : ''}{row.delta.toFixed(4)}
                      </td>
                      <td style={{ textAlign: 'right' }} className={row.isCarried ? '' : pctClass(row.deltaPercent)}>{fmtPct(row.deltaPercent, 3)}</td>
                      <td style={{ textAlign: 'right' }} className={pctClass(row.rollingReturn7dAnn)}>{fmtPct(row.rollingReturn7dAnn)}</td>
                      <td style={{ textAlign: 'right' }} className={pctClass(row.rollingReturn15dAnn)}>{fmtPct(row.rollingReturn15dAnn)}</td>
                      <td style={{ textAlign: 'right' }} className={pctClass(row.rollingReturn30dAnn)}>{fmtPct(row.rollingReturn30dAnn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
