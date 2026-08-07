import React, { useState, useMemo } from 'react';
import { Building2, Sparkles, BarChart3, ArrowUpRight, Activity } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { PinnedFund, GranularNAVRow } from '../types/mf';
import { generateAMCNAVRows } from '../services/amfiApi';

interface Page3Props {
  pinnedFunds: PinnedFund[];
  isLoading: boolean;
}

export const Page3AMCIndividual: React.FC<Page3Props> = ({
  pinnedFunds,
  isLoading
}) => {
  const [selectedSchemeCode, setSelectedSchemeCode] = useState<number | null>(
    pinnedFunds[0]?.schemeCode || null
  );
  const [rowLimit, setRowLimit] = useState<number>(60);

  const selectedFund = useMemo(() => {
    if (!selectedSchemeCode) return pinnedFunds[0] || null;
    return pinnedFunds.find(f => f.schemeCode === selectedSchemeCode) || pinnedFunds[0] || null;
  }, [pinnedFunds, selectedSchemeCode]);

  const granularRows = useMemo<GranularNAVRow[]>(() => {
    if (!selectedFund) return [];
    return generateAMCNAVRows(selectedFund, rowLimit);
  }, [selectedFund, rowLimit]);

  const chartData = useMemo(() => {
    return [...granularRows].reverse().map(r => ({
      date: r.date,
      NAV: r.closingNav,
      '7D Return (% p.a.)': r.rollingReturn7dAnn,
      '15D Return (% p.a.)': r.rollingReturn15dAnn,
      '30D Return (% p.a.)': r.rollingReturn30dAnn
    }));
  }, [granularRows]);

  const metrics = useMemo(() => {
    if (!selectedFund || granularRows.length === 0) return null;
    const navs = granularRows.map(r => r.closingNav);
    const deltas = granularRows.map(r => r.delta);
    return {
      maxNav: Math.max(...navs),
      minNav: Math.min(...navs),
      maxDelta: Math.max(...deltas),
      totalRecords: granularRows.length
    };
  }, [selectedFund, granularRows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div className="card-panel" style={{ borderLeft: '4px solid var(--color-purple)', background: 'linear-gradient(90deg, #f5f3ff 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          <Sparkles size={12} />
          <span>AMC Analytics View</span>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)' }}>AMC Individual Analytics & Annualized Rolling Returns</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Compare daily opening and closing NAV movements alongside 7D, 15D, and 30D annualized rolling returns (% p.a.).
        </p>
      </div>

      {/* Selector */}
      <div className="card-panel flex-row-responsive" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Building2 size={20} style={{ color: 'var(--color-purple)' }} />
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '2px' }}>
              Choose Scheme ({pinnedFunds.length} Pinned):
            </label>
            <select
              value={selectedSchemeCode || ''}
              onChange={e => setSelectedSchemeCode(Number(e.target.value))}
              className="date-picker-input"
              style={{ minWidth: '280px', fontWeight: 600, fontSize: '0.82rem' }}
            >
              {pinnedFunds.map(fund => (
                <option key={fund.schemeCode} value={fund.schemeCode}>
                  {fund.amc} - {fund.schemeName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Display Rows:</span>
          {[30, 60, 90, 180].map(limit => (
            <button
              key={limit}
              onClick={() => setRowLimit(limit)}
              className="btn btn-outline"
              style={{
                padding: '6px 12px',
                fontSize: '0.72rem',
                backgroundColor: rowLimit === limit ? 'var(--color-purple)' : '#ffffff',
                color: rowLimit === limit ? '#ffffff' : 'var(--text-primary)',
                borderColor: rowLimit === limit ? 'var(--color-purple)' : 'var(--border-light)'
              }}
            >
              {limit} Days
            </button>
          ))}
        </div>
      </div>

      {!selectedFund ? (
        <div className="card-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <BarChart3 size={40} style={{ margin: '0 auto 12px', color: 'var(--border-medium)' }} />
          <h3>No AMC Selected</h3>
          <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Pin mutual funds in page 1 to examine individual daily details.</p>
        </div>
      ) : (
        <>
          {/* Metrics */}
          {metrics && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <div className="card-panel" style={{ padding: '16px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Highest NAV</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '4px' }}>₹{metrics.maxNav.toFixed(4)}</div>
              </div>
              <div className="card-panel" style={{ padding: '16px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Lowest NAV</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-danger)', marginTop: '4px' }}>₹{metrics.minNav.toFixed(4)}</div>
              </div>
              <div className="card-panel" style={{ padding: '16px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Max Daily Gain</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ArrowUpRight size={16} /> +₹{metrics.maxDelta.toFixed(4)}
                </div>
              </div>
              <div className="card-panel" style={{ padding: '16px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: 700, textTransform: 'uppercase' }}>7D Return (Ann)</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: '4px' }}>
                  {selectedFund.return7dAnn >= 0 ? '+' : ''}{selectedFund.return7dAnn.toFixed(2)}% p.a.
                </div>
              </div>
              <div className="card-panel" style={{ padding: '16px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-warning)', fontWeight: 700, textTransform: 'uppercase' }}>15D Return (Ann)</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-warning)', marginTop: '4px' }}>
                  {selectedFund.return15dAnn >= 0 ? '+' : ''}{selectedFund.return15dAnn.toFixed(2)}% p.a.
                </div>
              </div>
              <div className="card-panel" style={{ padding: '16px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 700, textTransform: 'uppercase' }}>30D Return (Ann)</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '4px' }}>
                  {selectedFund.return30dAnn >= 0 ? '+' : ''}{selectedFund.return30dAnn.toFixed(2)}% p.a.
                </div>
              </div>
            </div>
          )}

          {/* Recharts chart */}
          <div className="card-panel">
            <h3 className="card-title" style={{ marginBottom: '16px' }}>Annualized Rolling Returns (% p.a.) & Historical NAV</h3>
            <div style={{ height: '320px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis yAxisId="left" stroke="#7c3aed" tick={{ fill: '#7c3aed', fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={v => `₹${v}`} />
                  <YAxis yAxisId="right" orientation="right" stroke="#059669" tick={{ fill: '#059669', fontSize: 11 }} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                  <Line yAxisId="left" type="monotone" dataKey="NAV" stroke="#7c3aed" strokeWidth={2.5} dot={false} name="NAV (₹)" />
                  <Line yAxisId="right" type="monotone" dataKey="7D Return (% p.a.)" stroke="#2563eb" strokeWidth={1.5} dot={false} name="7D Ann (% p.a.)" />
                  <Line yAxisId="right" type="monotone" dataKey="15D Return (% p.a.)" stroke="#d97706" strokeWidth={1.5} dot={false} name="15D Ann (% p.a.)" />
                  <Line yAxisId="right" type="monotone" dataKey="30D Return (% p.a.)" stroke="#059669" strokeWidth={2} dot={false} name="30D Ann (% p.a.)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Granular Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={16} style={{ color: 'var(--color-purple)' }} />
              Granular NAV & Annualized Return Breakdown Table
            </h4>

            <div className="table-wrapper">
              <table className="financial-table">
                <thead>
                  <tr>
                    <th>Fund Name</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>NAV (₹)</th>
                    <th style={{ textAlign: 'right' }}>Opening NAV</th>
                    <th style={{ textAlign: 'right' }}>Closing NAV</th>
                    <th style={{ textAlign: 'right' }}>Delta (₹)</th>
                    <th style={{ textAlign: 'right' }}>Delta %</th>
                    <th style={{ textAlign: 'right' }}>7D Return (Ann p.a.)</th>
                    <th style={{ textAlign: 'right' }}>15D Return (Ann p.a.)</th>
                    <th style={{ textAlign: 'right' }}>30D Return (Ann p.a.)</th>
                  </tr>
                </thead>
                <tbody>
                  {granularRows.map(row => {
                    const isPos = row.delta >= 0;
                    return (
                      <tr key={row.id}>
                        <td style={{ fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '200px' }}>{row.fundName}</td>
                        <td className="font-mono" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-purple)' }}>{row.date}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{row.closingNav.toFixed(4)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>₹{row.openingNav.toFixed(4)}</td>
                        <td style={{ textAlign: 'right' }}>₹{row.closingNav.toFixed(4)}</td>
                        <td style={{ textAlign: 'right' }} className={isPos ? 'val-positive' : 'val-negative'}>
                          {isPos ? '+' : ''}{row.delta.toFixed(4)}
                        </td>
                        <td style={{ textAlign: 'right' }} className={isPos ? 'val-positive' : 'val-negative'}>
                          {isPos ? '+' : ''}{row.deltaPercent.toFixed(3)}%
                        </td>

                        {/* 7D Annualized Return */}
                        <td style={{ textAlign: 'right', color: 'var(--color-primary)', fontWeight: 600 }}>
                          {row.rollingReturn7dAnn !== null ? `${row.rollingReturn7dAnn > 0 ? '+' : ''}${row.rollingReturn7dAnn.toFixed(2)}%` : '-'}
                        </td>

                        {/* 15D Annualized Return */}
                        <td style={{ textAlign: 'right', color: 'var(--color-warning)', fontWeight: 600 }}>
                          {row.rollingReturn15dAnn !== null ? `${row.rollingReturn15dAnn > 0 ? '+' : ''}${row.rollingReturn15dAnn.toFixed(2)}%` : '-'}
                        </td>

                        {/* 30D Annualized Return */}
                        <td style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: 700 }}>
                          {row.rollingReturn30dAnn !== null ? `${row.rollingReturn30dAnn > 0 ? '+' : ''}${row.rollingReturn30dAnn.toFixed(2)}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

