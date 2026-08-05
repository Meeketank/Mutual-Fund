import React, { useMemo, useState } from 'react';
import { Award, Trophy, Sparkles, TrendingUp, Crown, HelpCircle, Bot, AlertCircle, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { PinnedFund } from '../types/mf';
import { getNavOnDate, formatDateDisplay } from '../services/amfiApi';
import { generateGroqSummary } from '../services/groqApi';

interface Page4Props {
  pinnedFunds: PinnedFund[];
  isLoading: boolean;
  pastDate: string;
  apiKey: string;
  summary: string;
  onUpdateSummary: (newSummary: string) => Promise<void>;
}

export const Page4ConclusionRanking: React.FC<Page4Props> = ({
  pinnedFunds,
  isLoading,
  pastDate,
  apiKey,
  summary,
  onUpdateSummary
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Determine if a custom past date is selected (different from today)
  const isPastDateSelected = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return pastDate !== todayStr;
  }, [pastDate]);

  // Compute rankings dynamically based on the selected date's metrics
  const rankings = useMemo(() => {
    if (pinnedFunds.length === 0) return [];

    // Map each fund to its metrics on the target pastDate
    const fundsWithPastMetrics = pinnedFunds.map(fund => {
      const pastNavData = getNavOnDate(fund, pastDate);
      const targetNav = pastNavData ? pastNavData.nav : fund.latestNav;

      const getPastReturnForDays = (days: number): number => {
        const history = fund.historicalData;
        if (history.length < 2) return 0;

        const targetTime = pastNavData ? new Date(pastNavData.date).getTime() : new Date().getTime();
        const pastTime = targetTime - (days * 24 * 60 * 60 * 1000);

        let targetIdx = -1;
        let pastIdx = -1;

        for (let i = 0; i < history.length; i++) {
          if (history[i].parsedDate.getTime() <= targetTime) {
            targetIdx = i;
            break;
          }
        }
        if (targetIdx === -1) targetIdx = 0;

        for (let j = targetIdx + 1; j < history.length; j++) {
          if (history[j].parsedDate.getTime() <= pastTime) {
            pastIdx = j;
            break;
          }
        }
        if (pastIdx === -1) pastIdx = history.length - 1;

        const currentNav = history[targetIdx]?.nav || 0;
        const pastNav = history[pastIdx]?.nav || 0;

        if (pastNav === 0) return 0;
        return Math.round(((currentNav - pastNav) / pastNav) * 100 * 100) / 100;
      };

      return {
        fund,
        targetNav,
        navAsOf: pastNavData ? pastNavData.date : fund.navAsOf,
        targetReturn7d: getPastReturnForDays(7),
        targetReturn15d: getPastReturnForDays(15),
        targetReturn30d: getPastReturnForDays(30)
      };
    });

    // Compute ranks based on target metrics
    const sortedByReturn30d = [...fundsWithPastMetrics].sort((a, b) => b.targetReturn30d - a.targetReturn30d);
    const rank30dMap = new Map<number, number>();
    sortedByReturn30d.forEach((item, idx) => rank30dMap.set(item.fund.schemeCode, idx + 1));

    const sortedByReturn15d = [...fundsWithPastMetrics].sort((a, b) => b.targetReturn15d - a.targetReturn15d);
    const rank15dMap = new Map<number, number>();
    sortedByReturn15d.forEach((item, idx) => rank15dMap.set(item.fund.schemeCode, idx + 1));

    const sortedByReturn7d = [...fundsWithPastMetrics].sort((a, b) => b.targetReturn7d - a.targetReturn7d);
    const rank7dMap = new Map<number, number>();
    sortedByReturn7d.forEach((item, idx) => rank7dMap.set(item.fund.schemeCode, idx + 1));

    const scored = fundsWithPastMetrics.map(item => {
      const return30dRank = rank30dMap.get(item.fund.schemeCode) || pinnedFunds.length;
      const return15dRank = rank15dMap.get(item.fund.schemeCode) || pinnedFunds.length;
      const return7dRank = rank7dMap.get(item.fund.schemeCode) || pinnedFunds.length;

      // Composite rank score (50% 30D Return, 30% 15D Return, 20% 7D Return)
      const score = (return30dRank * 0.5) + (return15dRank * 0.3) + (return7dRank * 0.2);

      return {
        schemeCode: item.fund.schemeCode,
        fundName: item.fund.schemeName,
        isin: item.fund.isin,
        amc: item.fund.amc,
        latestNav: item.targetNav,
        navAsOf: item.navAsOf,
        return7d: item.targetReturn7d,
        return15d: item.targetReturn15d,
        return30d: item.targetReturn30d,
        return7dRank,
        return15dRank,
        return30dRank,
        overallScore: Math.round(score * 100) / 100,
        overallRank: 0
      };
    });

    // Final Overall Rank
    scored.sort((a, b) => a.overallScore - b.overallScore);
    scored.forEach((item, idx) => {
      item.overallRank = idx + 1;
    });

    return scored;
  }, [pinnedFunds, pastDate]);

  const overallWinner = rankings.find(r => r.overallRank === 1);
  const winner30d = rankings.find(r => r.return30dRank === 1);
  const winner15d = rankings.find(r => r.return15dRank === 1);
  const winner7d = rankings.find(r => r.return7dRank === 1);

  const chartData = useMemo(() => {
    return rankings.map(r => ({
      name: r.fundName.length > 20 ? r.fundName.substring(0, 17) + '...' : r.fundName,
      '30D Return %': r.return30d,
      '15D Return %': r.return15d,
      '7D Return %': r.return7d
    }));
  }, [rankings]);

  // Handle Groq summary generation
  const handleGenerateSummary = async () => {
    if (!apiKey) {
      setErrorMsg('Groq API Key is missing. Please configure it in the "Developer Controls" tab.');
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);
    try {
      const generated = await generateGroqSummary(apiKey, rankings);
      await onUpdateSummary(generated);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to generate summary.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper to parse and render simple markdown text from LLM response
  const renderFormattedSummary = (text: string) => {
    if (!text) return null;

    const lines = text.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={idx} style={{ height: '8px' }} />;

      // Header parsing
      if (trimmed.toLowerCase().startsWith('observations')) {
        return (
          <h4 key={idx} style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '16px', marginBottom: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
            Observations
          </h4>
        );
      }
      if (trimmed.toLowerCase().startsWith('executive summary')) {
        return (
          <h4 key={idx} style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '20px', marginBottom: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
            Executive Summary
          </h4>
        );
      }

      // Check for bold prefixes like "Best Return:", "Lowest Cost:" etc.
      const matchBoldPrefix = trimmed.match(/^[\*\-]?\s*\*\*(.*?)\*\*(.*)$/);
      if (matchBoldPrefix) {
        return (
          <p key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0', lineHeight: '1.5', paddingLeft: '8px' }}>
            • <strong>{matchBoldPrefix[1]}</strong>{matchBoldPrefix[2]}
          </p>
        );
      }

      // List item parsing
      if (trimmed.match(/^\d+\./)) {
        return (
          <p key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '8px 0', lineHeight: '1.5', paddingLeft: '4px' }}>
            {trimmed}
          </p>
        );
      }
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        return (
          <p key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0', lineHeight: '1.5', paddingLeft: '12px' }}>
            • {trimmed.substring(1).trim()}
          </p>
        );
      }

      return (
        <p key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0', lineHeight: '1.5' }}>
          {trimmed}
        </p>
      );
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div className="card-panel" style={{ borderLeft: '4px solid var(--color-warning)', background: 'linear-gradient(90deg, #fffbeb 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          <Sparkles size={12} />
          <span>Decision & Ranking Matrix</span>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)' }}>
          {isPastDateSelected ? 'Historical Rankings & Performance Matrix' : 'Conclusion & Return-Based Rankings'}
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {isPastDateSelected
            ? `Rankings calculated dynamically using historical statistics on ${formatDateDisplay(pastDate)}.`
            : 'Composite performance rankings weighted by 30-Day returns (50%), 15-Day returns (30%), and 7-Day returns (20%).'}
        </p>
      </div>

      {pinnedFunds.length === 0 ? (
        <div className="card-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Award size={40} style={{ margin: '0 auto 12px', color: 'var(--border-medium)' }} />
          <h3>No Pinned Funds to Rank</h3>
          <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Pin mutual funds in page 1 to compute the comparative ranking matrix.</p>
        </div>
      ) : (
        <>
          {/* Trophy Cards */}
          <div className="panel-grid-4">
            <div className="card-panel" style={{ backgroundColor: 'var(--color-warning-light)', borderColor: 'var(--accent-amber-border)', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-warning)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                <Trophy size={14} /> Overall Winner
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={overallWinner?.fundName}>
                {overallWinner?.fundName}
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-secondary)' }}>Rank #1 composite returns</div>
            </div>

            <div className="card-panel" style={{ backgroundColor: 'var(--color-success-light)', borderColor: 'var(--color-success-border)', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-success)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                <TrendingUp size={14} /> Best 30D Return
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={winner30d?.fundName}>
                {winner30d?.fundName}
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-secondary)' }}>+{winner30d?.return30d.toFixed(2)}% (30 Days)</div>
            </div>

            <div className="card-panel" style={{ backgroundColor: 'var(--color-primary-light)', borderColor: 'var(--accent-blue-border)', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                <TrendingUp size={14} /> Best 15D Return
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={winner15d?.fundName}>
                {winner15d?.fundName}
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-secondary)' }}>+{winner15d?.return15d.toFixed(2)}% (15 Days)</div>
            </div>

            <div className="card-panel" style={{ backgroundColor: 'var(--color-purple-light)', borderColor: 'var(--accent-purple-border)', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-purple)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                <TrendingUp size={14} /> Best 7D Return
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={winner7d?.fundName}>
                {winner7d?.fundName}
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-secondary)' }}>+{winner7d?.return7d.toFixed(2)}% (7 Days)</div>
            </div>
          </div>

          {/* Matrix Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className="card-title" style={{ margin: 0 }}>
                {isPastDateSelected ? 'Historical Rankings Table' : 'Final Return Matrix'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <HelpCircle size={14} />
                <span>Overall Rank is computed using 30D (50%), 15D (30%), and 7D (20%) return consistency.</span>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="financial-table">
                <thead>
                  <tr>
                    <th>Overall Rank</th>
                    <th>Fund Name</th>
                    <th>ISIN</th>
                    <th style={{ textAlign: 'right' }}>{isPastDateSelected ? 'Past NAV' : 'Latest NAV'}</th>
                    <th>NAV As Of</th>
                    <th style={{ textAlign: 'right' }}>7D Return</th>
                    <th style={{ textAlign: 'right' }}>15D Return</th>
                    <th style={{ textAlign: 'right' }}>30D Return</th>
                    <th style={{ textAlign: 'center' }}>7D Rank</th>
                    <th style={{ textAlign: 'center' }}>15D Rank</th>
                    <th style={{ textAlign: 'center' }}>30D Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map(row => {
                    const isTop1 = row.overallRank === 1;
                    return (
                      <tr key={row.schemeCode} style={{ backgroundColor: isTop1 ? 'var(--color-warning-light)' : 'transparent', fontWeight: isTop1 ? 600 : 'normal' }}>
                        <td style={{ textAlign: 'center', fontWeight: 800 }}>
                          {row.overallRank === 1 ? (
                            <span className="badge badge-amber" style={{ padding: '4px 8px', gap: '2px' }}><Crown size={12} /> #1</span>
                          ) : (
                            `#${row.overallRank}`
                          )}
                        </td>
                        <td style={{ fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '220px' }}>{row.fundName}</td>
                        <td className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.isin}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>₹{row.latestNav.toFixed(4)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{row.navAsOf}</td>
                        <td style={{ textAlign: 'right', color: row.return7d >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {row.return7d > 0 ? '+' : ''}{row.return7d.toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'right', color: row.return15d >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {row.return15d > 0 ? '+' : ''}{row.return15d.toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'right', color: row.return30d >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 }}>
                          {row.return30d > 0 ? '+' : ''}{row.return30d.toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'center' }}><span className="badge badge-purple" style={{ padding: '2px 6px' }}>#{row.return7dRank}</span></td>
                        <td style={{ textAlign: 'center' }}><span className="badge badge-blue" style={{ padding: '2px 6px' }}>#{row.return15dRank}</span></td>
                        <td style={{ textAlign: 'center' }}><span className="badge badge-green" style={{ padding: '2px 6px' }}>#{row.return30dRank}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recharts comparison bar chart */}
          <div className="card-panel">
            <h3 className="card-title" style={{ marginBottom: '16px' }}>
              {isPastDateSelected ? 'Historical Performance Comparison' : 'Multi-Timeframe Return Performance Comparison'}
            </h3>
            <div style={{ height: '300px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                  <Bar dataKey="7D Return %" fill="var(--color-purple)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="15D Return %" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="30D Return %" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Summary & Solutions Section */}
          <div className="card-panel" style={{ borderLeft: '4px solid var(--color-purple)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Bot size={18} style={{ color: 'var(--color-purple)' }} />
                  <span>AI Summary & Solutions</span>
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Generate comprehensive portfolio observations powered by Groq LLM
                </p>
              </div>

              <button
                onClick={handleGenerateSummary}
                disabled={isGenerating}
                className="btn btn-primary"
                style={{
                  padding: '8px 16px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'var(--color-purple)',
                  color: '#ffffff'
                }}
              >
                <RefreshCw size={14} className={isGenerating ? 'animate-spin' : ''} />
                <span>{isGenerating ? 'Analyzing Portfolios...' : 'Generate Summary'}</span>
              </button>
            </div>

            {errorMsg && (
              <div style={{ backgroundColor: 'var(--color-danger-light)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', fontSize: '0.8rem', marginBottom: '16px' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                minHeight: '120px'
              }}
            >
              {summary ? (
                <div>{renderFormattedSummary(summary)}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                  <Bot size={32} style={{ color: 'var(--border-medium)', marginBottom: '8px' }} />
                  <p style={{ fontSize: '0.8rem' }}>No AI Analysis has been generated yet.</p>
                  <p style={{ fontSize: '0.72rem', marginTop: '2px' }}>Click "Generate Summary" to run portfolio analysis using the configured Groq API Key.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
