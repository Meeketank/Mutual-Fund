import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Sparkles, X, Search, RefreshCw, Eye, EyeOff, Calendar, Percent, TrendingUp, Plus } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { PinnedFund, MFSearchResult } from '../types/mf';
import { fetchFundDetail, searchSchemes, formatDateDisplay } from '../services/amfiApi';
import { endOfDay, parseISODate, shiftISODate, simulateSip, todayISO, returnBetween, alignSeries, carriedKey, valueKey, timeTicks, AlignedRow } from '../services/calc';
import { realDot, timeTickFormatter } from './chartParts';
import { fmtNav, fmtPct, fmtINR, pctClass, shortName } from '../services/format';

// Portfolio / holdings data is intentionally not shown: mfapi.in only exposes
// NAV history + scheme metadata, and fabricated holdings would be misleading.

type Preset = '7D' | '15D' | '30D' | '90D' | '1Y' | '3Y' | 'ALL' | 'CUSTOM';
type Metric = 'NAV' | '7D' | '15D' | '30D';

interface Page5ComparisonProps {
  pinnedFunds: PinnedFund[];
  isLoading: boolean;
  selectedFunds: PinnedFund[];
  setSelectedFunds: React.Dispatch<React.SetStateAction<PinnedFund[]>>;
  comparisonMetric: Metric;
  setComparisonMetric: React.Dispatch<React.SetStateAction<Metric>>;
  visibleFunds: { [schemeCode: number]: boolean };
  setVisibleFunds: React.Dispatch<React.SetStateAction<{ [schemeCode: number]: boolean }>>;
  datePreset: Preset;
  setDatePreset: React.Dispatch<React.SetStateAction<Preset>>;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
}

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#7c3aed', '#db2777', '#0891b2', '#e11d48', '#65a30d', '#9333ea', '#0d9488'];
const SIP_AMOUNT = 10000;
const key = (code: number) => `f${code}`;

export const Page5Comparison: React.FC<Page5ComparisonProps> = ({
  pinnedFunds,
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
  const [slotCount, setSlotCount] = useState<number>(() => Math.max(3, selectedFunds.length));
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [searchResults, setSearchResults] = useState<Record<number, MFSearchResult[]>>({});
  const [isSearching, setIsSearching] = useState<Record<number, boolean>>({});
  const [loadingSlot, setLoadingSlot] = useState<Record<number, boolean>>({});
  const searchTimers = useRef<Record<number, number>>({});

  useEffect(() => {
    if (datePreset === 'CUSTOM') return;
    const end = todayISO();
    const days = { '7D': 7, '15D': 15, '30D': 30, '90D': 90, '1Y': 365, '3Y': 365 * 3, ALL: 365 * 60 }[datePreset];
    setStartDate(shiftISODate(end, -days));
    setEndDate(end);
  }, [datePreset, setStartDate, setEndDate]);

  const startT = parseISODate(startDate).getTime();
  const endT = endOfDay(parseISODate(endDate));
  const validRange = isFinite(startT) && isFinite(endT) && startT < endT;

  const handleSelectScheme = async (slot: number, schemeCode: number) => {
    setLoadingSlot(p => ({ ...p, [slot]: true }));
    const details = pinnedFunds.find(f => f.schemeCode === schemeCode) || (await fetchFundDetail(schemeCode));
    setLoadingSlot(p => ({ ...p, [slot]: false }));
    if (details.loadError) return;
    setSelectedFunds(prev => {
      const next = [...prev];
      next[slot] = details;
      return next;
    });
    setVisibleFunds(p => ({ ...p, [schemeCode]: true }));
    setSearchQueries(p => ({ ...p, [slot]: '' }));
    setSearchResults(p => ({ ...p, [slot]: [] }));
  };

  const handleRemoveSlot = (slot: number) => {
    setSelectedFunds(prev => prev.filter((_, i) => i !== slot));
  };

  const handleSearchChange = (slot: number, query: string) => {
    setSearchQueries(p => ({ ...p, [slot]: query }));
    window.clearTimeout(searchTimers.current[slot]);
    if (query.trim().length < 2) {
      setSearchResults(p => ({ ...p, [slot]: [] }));
      return;
    }
    setIsSearching(p => ({ ...p, [slot]: true }));
    searchTimers.current[slot] = window.setTimeout(async () => {
      const results = await searchSchemes(query);
      setSearchResults(p => ({ ...p, [slot]: results }));
      setIsSearching(p => ({ ...p, [slot]: false }));
    }, 300);
  };

  const filled = selectedFunds.map((f, i) => ({ f, i })).filter(x => !!x.f);
  const colorFor = (slot: number) => COLORS[slot % COLORS.length];

  const chartData = useMemo<AlignedRow[]>(() => {
    if (!validRange) return [];
    const active = selectedFunds.filter(f => f && visibleFunds[f.schemeCode] !== false);
    if (active.length === 0) return [];
    const days = comparisonMetric === '7D' ? 7 : comparisonMetric === '15D' ? 15 : 30;
    // Shared date grid across funds; a fund with no NAV on a date (weekend for
    // equity funds, holidays) uses its last published NAV, so lines never break.
    // Rolling returns look back over the full history, not just the visible range.
    return alignSeries(
      active.map(f => ({ key: key(f.schemeCode), asc: f.historyAsc })),
      startT,
      endT,
      comparisonMetric === 'NAV' ? 'rebased' : 'rolling',
      days
    );
  }, [selectedFunds, visibleFunds, comparisonMetric, startT, endT, validRange]);

  const spanDays = chartData.length > 1 ? (chartData[chartData.length - 1].t - chartData[0].t) / 86400000 : 0;
  const xTicks = chartData.length ? timeTicks(chartData[0].t, chartData[chartData.length - 1].t, 6) : [];
  const showDots = chartData.length > 0 && chartData.length <= 45;

  const slotIndices = Array.from({ length: Math.max(3, slotCount, selectedFunds.length) }, (_, i) => i);

  const Row = ({ label, value, cls, strong }: { label: string; value: string; cls?: string; strong?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.77rem' }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span className={cls} style={{ fontWeight: 700, textAlign: 'right' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card-panel page-hero" style={{ borderLeft: '4px solid var(--color-primary)', background: 'linear-gradient(90deg, #eff6ff 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          <Sparkles size={12} />
          <span>Interactive Comparison</span>
        </div>
        <h2>Mutual Fund Side-by-Side Comparison</h2>
        <p>Add as many schemes as you like (swipe sideways on mobile). Returns, risk and a ₹{SIP_AMOUNT.toLocaleString('en-IN')}/month SIP are calculated for the selected date range.</p>
      </div>

      {/* Range selector first so the slot numbers make sense */}
      <div className="card-panel" style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Calendar size={15} className="text-slate-500" />
          <span className="filter-label">Range</span>
          <div className="segmented">
            {(['7D', '15D', '30D', '90D', '1Y', '3Y', 'ALL', 'CUSTOM'] as const).map(p => (
              <button key={p} className={datePreset === p ? 'active' : ''} onClick={() => setDatePreset(p)}>{p === 'CUSTOM' ? 'Custom' : p}</button>
            ))}
          </div>
        </div>
        {datePreset === 'CUSTOM' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} className="date-picker-input" aria-label="From date" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>to</span>
            <input type="date" value={endDate} min={startDate} max={todayISO()} onChange={e => setEndDate(e.target.value)} className="date-picker-input" aria-label="To date" />
          </div>
        ) : (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {datePreset === 'ALL' ? 'Full history' : `${formatDateDisplay(startDate)} → ${formatDateDisplay(endDate)}`}
          </span>
        )}
      </div>

      <div className="comp-slots">
        {slotIndices.map(idx => {
          const fund = selectedFunds[idx];
          const query = searchQueries[idx] || '';
          const results = searchResults[idx] || [];
          const slotColor = colorFor(idx);
          const rangeRet = fund && validRange ? returnBetween(fund.historyAsc, startT, endT) : null;
          const sip = fund && validRange ? simulateSip(fund.historyAsc, Math.max(startT, fund.historyAsc[0]?.parsedDate.getTime() || startT), endT, SIP_AMOUNT) : null;

          return (
            <div key={idx} className="card-panel comp-slot" style={{ borderTop: fund ? `4px solid ${slotColor}` : '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span className="badge badge-gray" style={{ fontSize: '0.66rem', textTransform: 'uppercase' }}>Slot {idx + 1}</span>
                {fund && (
                  <button onClick={() => handleRemoveSlot(idx)} className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Remove from comparison">
                    <X size={14} />
                  </button>
                )}
              </div>

              {loadingSlot[idx] ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', minHeight: 200 }}>
                  <RefreshCw size={24} className="animate-spin" />
                  <span style={{ fontSize: '0.75rem', marginTop: '8px' }}>Loading scheme…</span>
                </div>
              ) : fund ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <h3 style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3 }}>{fund.schemeName}</h3>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{fund.category}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
                    <Row label="ISIN" value={fund.isin} />
                    <Row label={`NAV (${fund.navAsOf})`} value={fmtNav(fund.latestNav)} />
                    <Row label="7D (ann.)" value={fmtPct(fund.return7dAnn)} cls={pctClass(fund.return7dAnn)} />
                    <Row label="15D (ann.)" value={fmtPct(fund.return15dAnn)} cls={pctClass(fund.return15dAnn)} />
                    <Row label="30D (ann.)" value={fmtPct(fund.return30dAnn)} cls={pctClass(fund.return30dAnn)} />
                    <Row label="1Y" value={fmtPct(fund.return1y)} cls={pctClass(fund.return1y)} />
                    <Row label="3Y CAGR" value={fmtPct(fund.return3y)} cls={pctClass(fund.return3y)} />
                    <Row label="5Y CAGR" value={fmtPct(fund.return5y)} cls={pctClass(fund.return5y)} />
                    <Row label="Volatility 1Y" value={fmtPct(fund.volatility1y, 2, false)} />
                    <Row label="Max drawdown 1Y" value={fmtPct(fund.maxDrawdown1y, 2, false)} cls={fund.maxDrawdown1y ? 'val-negative' : ''} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, backgroundColor: 'var(--color-primary-light)', padding: '8px 10px', borderRadius: 8 }}>
                    <Row label={rangeRet && rangeRet.days >= 365 ? 'Range return (CAGR)' : 'Range return'} value={rangeRet ? `${fmtPct(rangeRet.absolute)}${rangeRet.days >= 365 ? ` (${fmtPct(rangeRet.annualised)})` : ''}` : '—'} cls={pctClass(rangeRet?.absolute)} strong />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.77rem' }}>
                      <span style={{ color: 'var(--color-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Percent size={12} /> SIP XIRR
                      </span>
                      <span className={pctClass(sip?.xirr)} style={{ fontWeight: 800 }}>{fmtPct(sip?.xirr)}</span>
                    </div>
                    {sip && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                        {sip.installments} × ₹{SIP_AMOUNT.toLocaleString('en-IN')} = {fmtINR(sip.invested)} → <strong>{fmtINR(sip.currentValue)}</strong>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="relative">
                    <Search size={14} className="search-icon-left" style={{ left: '10px' }} />
                    <input
                      type="search"
                      placeholder="Search a scheme to compare…"
                      value={query}
                      onChange={e => handleSearchChange(idx, e.target.value)}
                      className="input-text"
                      style={{ width: '100%', padding: '9px 10px 9px 32px', fontSize: '0.8rem' }}
                    />
                    {query.trim().length >= 2 && (
                      <div className="search-dropdown" style={{ maxHeight: 220 }}>
                        {isSearching[idx] && results.length === 0 ? (
                          <div className="search-empty">Searching…</div>
                        ) : results.length === 0 ? (
                          <div className="search-empty">No schemes found</div>
                        ) : (
                          results.map(item => (
                            <button
                              key={item.schemeCode}
                              onClick={() => handleSelectScheme(idx, item.schemeCode)}
                              className="search-result-row"
                              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              <span className="search-result-name">{item.schemeName}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 14, textAlign: 'center' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>or pick a pinned scheme:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8, maxHeight: 160, overflowY: 'auto' }}>
                      {pinnedFunds
                        .filter(f => !selectedFunds.some(sf => sf && sf.schemeCode === f.schemeCode))
                        .map(f => (
                          <button key={f.schemeCode} onClick={() => handleSelectScheme(idx, f.schemeCode)} className="badge badge-gray" style={{ cursor: 'pointer', padding: '5px 9px' }} title={f.schemeName}>
                            {shortName(f.schemeName, 30)}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button
          className="card-panel comp-slot"
          style={{ alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px dashed var(--border-medium)', backgroundColor: '#f8fafc', minWidth: 200 }}
          onClick={() => setSlotCount(prev => Math.max(prev + 1, selectedFunds.length + 1))}
        >
          <Plus size={32} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontWeight: 700, fontSize: '0.85rem', marginTop: 8, color: 'var(--color-primary)' }}>Add comparison slot</span>
        </button>
      </div>

      <div className="card-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={18} style={{ color: 'var(--color-primary)' }} /> Comparison Chart
            </h3>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              {comparisonMetric === 'NAV' ? 'NAV rebased to 100 on the range start date.' : `Rolling ${comparisonMetric} return on each date, simple annualised (% p.a.).`} * in the tooltip = no NAV that day, previous NAV used.
            </p>
          </div>
          <div className="segmented">
            {(['NAV', '7D', '15D', '30D'] as const).map(m => (
              <button key={m} className={comparisonMetric === m ? 'active' : ''} onClick={() => setComparisonMetric(m)}>{m === 'NAV' ? 'Growth of 100' : `${m} rolling`}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginBottom: 12, padding: '8px 10px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
          {filled.length === 0 && <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Add schemes above to compare.</span>}
          {filled.map(({ f, i }) => {
            const vis = visibleFunds[f.schemeCode] !== false;
            return (
              <button
                key={f.schemeCode}
                onClick={() => setVisibleFunds(p => ({ ...p, [f.schemeCode]: !vis }))}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600, color: vis ? 'var(--text-primary)' : 'var(--text-muted)', textDecoration: vis ? 'none' : 'line-through' }}
                title={f.schemeName}
              >
                <span style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: colorFor(i), opacity: vis ? 1 : 0.25, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {vis ? <Eye size={9} color="#fff" /> : <EyeOff size={9} color="#fff" />}
                </span>
                {shortName(f.schemeName, 36)}
              </button>
            );
          })}
        </div>

        <div className="chart-box">
          {chartData.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
              {validRange ? 'Add schemes and keep at least one visible to see the chart.' : 'Choose a valid date range.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={xTicks} stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={timeTickFormatter(spanDays)} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 10 }} domain={['auto', 'auto']} width={46} tickFormatter={v => (comparisonMetric === 'NAV' ? Number(v).toFixed(0) : `${Number(v).toFixed(1)}%`)} />
                <Tooltip
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as AlignedRow | undefined;
                    if (!active || !row) return null;
                    const items = filled
                      .filter(({ f }) => visibleFunds[f.schemeCode] !== false)
                      .map(({ f, i }) => ({ f, i, v: row[valueKey(key(f.schemeCode))], c: !!row[carriedKey(key(f.schemeCode))] }))
                      .filter(x => typeof x.v === 'number') as { f: PinnedFund; i: number; v: number; c: boolean }[];
                    return (
                      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: 12, maxWidth: 300, boxShadow: 'var(--shadow-md)' }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{formatDateDisplay(new Date(row.t))}</div>
                        {items.map(({ f, i, v, c }) => (
                          <div key={f.schemeCode} style={{ display: 'flex', gap: 6, alignItems: 'center', color: colorFor(i) }}>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName(f.schemeName, 30)}</span>
                            <strong>{comparisonMetric === 'NAV' ? `${v.toFixed(2)} (${fmtPct(v - 100)})` : `${v.toFixed(2)}%`}</strong>
                            {c && <span style={{ color: '#94a3b8' }} title="No NAV this day; previous NAV used">*</span>}
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {filled.map(({ f, i }) =>
                  visibleFunds[f.schemeCode] === false ? null : (
                    <Line key={f.schemeCode} type="monotone" dataKey={key(f.schemeCode)} stroke={colorFor(i)} strokeWidth={2} dot={showDots ? realDot(key(f.schemeCode), colorFor(i)) : false} isAnimationActive={false} activeDot={{ r: 4 }} connectNulls />
                  )
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
