import React, { useState, useMemo } from 'react';
import { Download, Search, Grid, Sparkles, Clock, ArrowUpDown } from 'lucide-react';
import { PinnedFund } from '../types/mf';
import { formatDateDisplay } from '../services/amfiApi';
import { DAY_MS, endOfDay, findOnOrBefore, toISODate } from '../services/calc';
import { fmtNav, downloadCSV, shortName } from '../services/format';

interface Page2Props {
  pinnedFunds: PinnedFund[];
  isLoading: boolean;
  pastDate: string;
}

type Preset = '7D' | '15D' | '30D' | '90D' | '1Y' | 'ALL';

interface Cell {
  nav: number;
  carried: boolean;
  changePct: number | null;
}

interface GridRow {
  iso: string;
  dateDisplay: string;
  isWeekend: boolean;
  cells: Record<number, Cell | undefined>;
}

export const Page2NAVComparisonGrid: React.FC<Page2Props> = ({ pinnedFunds, isLoading, pastDate }) => {
  const [preset, setPreset] = useState<Preset>('30D');
  const [dateSearch, setDateSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [tradingOnly, setTradingOnly] = useState(false);
  const [showChange, setShowChange] = useState(false);

  const allRows = useMemo<GridRow[]>(() => {
    const funds = pinnedFunds.filter(f => f.historyAsc.length > 0);
    if (funds.length === 0) return [];
    const newest = Math.max(...funds.map(f => f.latestNavDate!.getTime()));
    const oldest = Math.min(...funds.map(f => f.historyAsc[0].parsedDate.getTime()));
    const days = { '7D': 7, '15D': 15, '30D': 30, '90D': 90, '1Y': 365, ALL: Infinity }[preset];
    const start = days === Infinity ? oldest : Math.max(oldest, newest - days * DAY_MS);

    // Pointers into each fund's ascending history; walk forward one calendar day at a time.
    // On days with no published NAV (weekends/holidays) the PREVIOUS day's NAV is carried forward.
    const ptr: Record<number, number> = {};
    const lastNav: Record<number, number | undefined> = {};
    funds.forEach(f => {
      ptr[f.schemeCode] = findOnOrBefore(f.historyAsc, start - 1);
      const p = ptr[f.schemeCode];
      lastNav[f.schemeCode] = p >= 0 ? f.historyAsc[p].nav : undefined;
    });

    const rows: GridRow[] = [];
    const s = new Date(start);
    const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    let guard = 0;
    while (cur.getTime() <= newest && guard++ < 20000) {
      const eod = endOfDay(cur);
      const iso = toISODate(cur);
      const cells: GridRow['cells'] = {};
      funds.forEach(f => {
        const asc = f.historyAsc;
        let p = ptr[f.schemeCode];
        let published = false;
        while (p + 1 < asc.length && asc[p + 1].parsedDate.getTime() <= eod) {
          p++;
          published = true;
        }
        ptr[f.schemeCode] = p;
        if (p < 0) return; // before this fund's first NAV
        const nav = asc[p].nav;
        const prev = lastNav[f.schemeCode];
        cells[f.schemeCode] = {
          nav,
          carried: !published,
          changePct: published && prev ? ((nav - prev) / prev) * 100 : published ? null : 0
        };
        lastNav[f.schemeCode] = nav;
      });
      const dow = cur.getDay();
      rows.push({ iso, dateDisplay: formatDateDisplay(cur), isWeekend: dow === 0 || dow === 6, cells });
      cur.setDate(cur.getDate() + 1);
    }
    return rows;
  }, [pinnedFunds, preset]);

  const gridData = useMemo(() => {
    let rows = allRows;
    if (tradingOnly) rows = rows.filter(r => Object.values(r.cells).some(c => c && !c.carried));
    const q = dateSearch.toLowerCase().trim();
    if (q) rows = rows.filter(r => r.dateDisplay.toLowerCase().includes(q) || r.iso.includes(q));
    return sortOrder === 'desc' ? [...rows].reverse() : rows;
  }, [allRows, tradingOnly, dateSearch, sortOrder]);

  const handleExportCSV = () => {
    if (gridData.length === 0) return;
    downloadCSV(`AMFI_NAV_Grid_${preset}.csv`, [
      ['Date', ...pinnedFunds.map(f => `${f.schemeName} NAV (Rs)`), ...pinnedFunds.map(f => `${shortName(f.schemeName, 60)} carried forward?`)],
      ...gridData.map(r => [
        r.iso,
        ...pinnedFunds.map(f => (r.cells[f.schemeCode] ? r.cells[f.schemeCode]!.nav.toFixed(4) : '')),
        ...pinnedFunds.map(f => (r.cells[f.schemeCode] ? (r.cells[f.schemeCode]!.carried ? 'yes' : 'no') : ''))
      ])
    ]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card-panel page-hero" style={{ borderLeft: '4px solid var(--border-focus)', background: 'linear-gradient(90deg, #ecfeff 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          <Sparkles size={12} />
          <span>Matrix Table View</span>
        </div>
        <h2>Historical NAV Matrix Grid</h2>
        <p>
          Day-by-day NAVs for every pinned scheme. On weekends and market holidays no NAV is published, so the previous business day's NAV is carried forward and shown in grey.
        </p>
      </div>

      <div className="filter-bar" style={{ marginBottom: 0 }}>
        <div className="filter-group">
          <Clock size={16} style={{ color: 'var(--text-muted)' }} />
          <span className="filter-label">Range:</span>
          <div className="segmented">
            {(['7D', '15D', '30D', '90D', '1Y', 'ALL'] as const).map(p => (
              <button key={p} className={preset === p ? 'active' : ''} onClick={() => setPreset(p)}>{p}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={tradingOnly} onChange={e => setTradingOnly(e.target.checked)} /> Business days only
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showChange} onChange={e => setShowChange(e.target.checked)} /> Show daily %
          </label>
          <div className="relative">
            <Search size={14} className="search-icon-left" style={{ left: '10px' }} />
            <input
              type="search"
              placeholder="Search dates…"
              value={dateSearch}
              onChange={e => setDateSearch(e.target.value)}
              className="input-text"
              style={{ width: '150px', padding: '6px 10px 6px 30px', fontSize: '0.75rem' }}
            />
          </div>
          <button onClick={() => setSortOrder(p => (p === 'desc' ? 'asc' : 'desc'))} className="btn btn-outline" style={{ padding: '6px 10px', fontSize: '0.75rem' }}>
            <ArrowUpDown size={14} />
            <span>{sortOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
          </button>
          <button onClick={handleExportCSV} disabled={gridData.length === 0} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '0.75rem' }}>
            <Download size={14} />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {pinnedFunds.length === 0 && !isLoading ? (
        <div className="card-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Grid size={40} style={{ margin: '0 auto 12px', color: 'var(--border-medium)' }} />
          <h3>No funds pinned</h3>
          <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Pin funds using the search bar to build the NAV grid.</p>
        </div>
      ) : (
        <div className="table-wrapper" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <table className="financial-table">
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, top: 0, backgroundColor: 'var(--bg-table-header)', zIndex: 12 }}>Date</th>
                {pinnedFunds.map(fund => (
                  <th key={fund.schemeCode} style={{ textAlign: 'right', minWidth: '150px', maxWidth: '200px' }}>
                    <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={fund.schemeName}>
                      {shortName(fund.schemeName, 28)}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--color-primary)', textTransform: 'none', fontWeight: 'normal', fontFamily: 'var(--font-mono)' }}>NAV (₹)</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={pinnedFunds.length + 1 || 2} style={{ padding: '12px' }}>
                        <div className="skeleton" style={{ height: '16px' }} />
                      </td>
                    </tr>
                  ))
                : gridData.map(row => {
                    const isTarget = row.iso === pastDate;
                    const bg = isTarget ? 'var(--color-primary-light)' : row.isWeekend ? '#fafafa' : '#ffffff';
                    return (
                      <tr key={row.iso} style={{ backgroundColor: bg, fontWeight: isTarget ? 600 : 'normal' }}>
                        <td style={{ position: 'sticky', left: 0, backgroundColor: bg, zIndex: 10, fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: row.isWeekend ? 'var(--text-muted)' : undefined }}>{row.dateDisplay}</span>
                            {isTarget && <span className="badge badge-blue" style={{ fontSize: '0.58rem', padding: '1px 6px' }}>Selected</span>}
                          </div>
                        </td>
                        {pinnedFunds.map(fund => {
                          const c = row.cells[fund.schemeCode];
                          return (
                            <td
                              key={fund.schemeCode}
                              style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: c?.carried ? 'var(--text-muted)' : undefined }}
                              title={c?.carried ? 'No NAV published this day — previous NAV carried forward' : undefined}
                            >
                              {c ? fmtNav(c.nav) : <span style={{ color: 'var(--border-medium)' }}>—</span>}
                              {c && showChange && !c.carried && c.changePct !== null && (
                                <div className={c.changePct >= 0 ? 'val-positive' : 'val-negative'} style={{ fontSize: '0.64rem' }}>
                                  {c.changePct >= 0 ? '+' : ''}
                                  {c.changePct.toFixed(3)}%
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
