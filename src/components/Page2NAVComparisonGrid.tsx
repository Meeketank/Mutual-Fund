import React, { useState, useMemo } from 'react';
import { Download, Search, Grid, Sparkles, Clock, ArrowUpDown } from 'lucide-react';
import { PinnedFund } from '../types/mf';
import { formatDateDisplay } from '../services/amfiApi';

interface Page2Props {
  pinnedFunds: PinnedFund[];
  isLoading: boolean;
  pastDate: string;
}

export const Page2NAVComparisonGrid: React.FC<Page2Props> = ({
  pinnedFunds,
  isLoading,
  pastDate
}) => {
  const [dateRangePreset, setDateRangePreset] = useState<'7D' | '15D' | '30D' | '90D' | '1Y' | 'ALL'>('30D');
  const [dateSearch, setDateSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const gridData = useMemo(() => {
    if (pinnedFunds.length === 0) return [];

    let newestTime = 0;
    let oldestTime = Infinity;

    const fundDateMaps = new Map<number, Map<string, number>>();

    pinnedFunds.forEach(fund => {
      const fMap = new Map<string, number>();
      fund.historicalData.forEach(pt => {
        const yyyy = pt.parsedDate.getFullYear();
        const mm = String(pt.parsedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(pt.parsedDate.getDate()).padStart(2, '0');
        const key = `${yyyy}-${mm}-${dd}`;
        fMap.set(key, pt.nav);

        const t = pt.parsedDate.getTime();
        if (t > newestTime) newestTime = t;
        if (t < oldestTime) oldestTime = t;
      });
      fundDateMaps.set(fund.schemeCode, fMap);
    });

    if (newestTime === 0 || oldestTime === Infinity) return [];

    let daysToInclude = 30;
    if (dateRangePreset === '7D') daysToInclude = 7;
    if (dateRangePreset === '15D') daysToInclude = 15;
    if (dateRangePreset === '30D') daysToInclude = 30;
    if (dateRangePreset === '90D') daysToInclude = 90;
    if (dateRangePreset === '1Y') daysToInclude = 365;
    if (dateRangePreset === 'ALL') daysToInclude = 3650;

    const now = new Date();
    const cutoffTime = now.getTime() - daysToInclude * 24 * 60 * 60 * 1000;
    const startGenTime = Math.max(oldestTime, cutoffTime);

    const lastKnownNavs: { [schemeCode: number]: number } = {};

    pinnedFunds.forEach(fund => {
      if (fund.historicalData.length > 0) {
        lastKnownNavs[fund.schemeCode] = fund.historicalData[0].nav;
      }
    });

    const dailyRows: { dateDisplay: string; parsedTime: number; navs: { [schemeCode: number]: number }; isWeekend: boolean }[] = [];
    let curr = new Date(newestTime);

    while (curr.getTime() >= startGenTime && dailyRows.length < 1000) {
      const yyyy = curr.getFullYear();
      const mm = String(curr.getMonth() + 1).padStart(2, '0');
      const dd = String(curr.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;

      pinnedFunds.forEach(fund => {
        const fMap = fundDateMaps.get(fund.schemeCode);
        if (fMap && fMap.has(key)) {
          lastKnownNavs[fund.schemeCode] = fMap.get(key)!;
        }
      });

      const dayOfWeek = curr.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      dailyRows.push({
        dateDisplay: formatDateDisplay(curr),
        parsedTime: curr.getTime(),
        navs: { ...lastKnownNavs },
        isWeekend
      });

      curr.setDate(curr.getDate() - 1);
    }

    if (sortOrder === 'asc') {
      dailyRows.reverse();
    }

    if (dateSearch.trim()) {
      const q = dateSearch.toLowerCase().trim();
      return dailyRows.filter(r => r.dateDisplay.toLowerCase().includes(q));
    }

    return dailyRows;
  }, [pinnedFunds, dateRangePreset, sortOrder, dateSearch]);

  const handleExportCSV = () => {
    if (gridData.length === 0 || pinnedFunds.length === 0) return;
    const headers = ['Date', ...pinnedFunds.map(f => `"${f.schemeName} NAV (Rs)"`)].join(',');
    const csvRows = gridData.map(row => {
      const navCols = pinnedFunds.map(f => row.navs[f.schemeCode] !== undefined ? row.navs[f.schemeCode].toFixed(4) : '');
      return [`"${row.dateDisplay}"`, ...navCols].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...csvRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AMFI_NAV_Comparison_Grid_${dateRangePreset}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formattedPastDateTarget = useMemo(() => {
    return formatDateDisplay(pastDate);
  }, [pastDate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div className="card-panel" style={{ borderLeft: '4px solid var(--border-focus)', background: 'linear-gradient(90deg, #ecfeff 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          <Sparkles size={12} />
          <span>Matrix Table View</span>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)' }}>Historical NAV Matrix Grid</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Side-by-side chronological compilation of NAV performance data for all pinned schemes.
        </p>
      </div>

      {/* Control Toolbar */}
      <div className="filter-bar">
        <div className="filter-group">
          <Clock size={16} style={{ color: 'var(--text-muted)' }} />
          <span className="filter-label">Quick Preset:</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['7D', '15D', '30D', '90D', '1Y', 'ALL'] as const).map(preset => (
              <button
                key={preset}
                onClick={() => setDateRangePreset(preset)}
                className="btn btn-outline"
                style={{
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  backgroundColor: dateRangePreset === preset ? 'var(--color-primary)' : '#ffffff',
                  color: dateRangePreset === preset ? '#ffffff' : 'var(--text-primary)',
                  borderColor: dateRangePreset === preset ? 'var(--color-primary)' : 'var(--border-light)'
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="relative">
            <Search size={14} className="search-icon-left" style={{ left: '10px' }} />
            <input
              type="text"
              placeholder="Search dates..."
              value={dateSearch}
              onChange={e => setDateSearch(e.target.value)}
              className="input-text"
              style={{ width: '180px', padding: '6px 10px 6px 30px', fontSize: '0.75rem' }}
            />
          </div>

          <button
            onClick={() => setSortOrder(p => p === 'desc' ? 'asc' : 'desc')}
            className="btn btn-outline"
            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
          >
            <ArrowUpDown size={14} />
            <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={pinnedFunds.length === 0}
            className="btn btn-primary"
            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {pinnedFunds.length === 0 ? (
        <div className="card-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Grid size={40} style={{ margin: '0 auto 12px', color: 'var(--border-medium)' }} />
          <h3>No funds pinned</h3>
          <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Pin funds in page 1 explorer or via header search to generate side-by-side NAV comparative grid rows.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="financial-table">
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, backgroundColor: 'var(--bg-table-header)', zIndex: 12 }}>Date</th>
                {pinnedFunds.map(fund => (
                  <th key={fund.schemeCode} style={{ textAlign: 'right', minWidth: '180px' }}>
                    <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={fund.schemeName}>
                      {fund.schemeName}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-primary)', textTransform: 'lowercase', fontWeight: 'normal', fontFamily: 'var(--font-mono)' }}>
                      nav (₹)
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={pinnedFunds.length + 1} style={{ padding: '12px' }}>
                      <div className="skeleton" style={{ height: '16px' }}></div>
                    </td>
                  </tr>
                ))
              ) : (
                gridData.map(row => {
                  const isPastDateMatch = row.dateDisplay === formattedPastDateTarget;
                  return (
                    <tr
                      key={row.dateDisplay}
                      style={{
                        backgroundColor: isPastDateMatch ? 'var(--color-primary-light)' : 'transparent',
                        fontWeight: isPastDateMatch ? 600 : 'normal'
                      }}
                    >
                      <td style={{ position: 'sticky', left: 0, backgroundColor: isPastDateMatch ? 'var(--color-primary-light)' : '#ffffff', zIndex: 10, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{row.dateDisplay}</span>
                          {isPastDateMatch && <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>Past Date Target</span>}
                        </div>
                      </td>
                      {pinnedFunds.map(fund => {
                        const val = row.navs[fund.schemeCode];
                        return (
                          <td key={fund.schemeCode} style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                            {val !== undefined ? `₹${val.toFixed(4)}` : <span style={{ color: 'var(--border-medium)' }}>-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
