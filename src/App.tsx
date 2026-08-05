import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ListFilter,
  Grid,
  BarChart3,
  Award,
  Pin,
  RefreshCw,
  Search,
  X,
  TrendingUp,
  Calendar,
  AlertCircle,
  Sliders,
  Shuffle
} from 'lucide-react';
import { PinnedFund } from './types/mf';
import { fetchFundDetail, DEFAULT_SCHEME_CODES, searchSchemes, formatDateDisplay } from './services/amfiApi';
import { Page1FundExplorer } from './components/Page1FundExplorer';
import { Page2NAVComparisonGrid } from './components/Page2NAVComparisonGrid';
import { Page3AMCIndividual } from './components/Page3AMCIndividual';
import { Page4ConclusionRanking } from './components/Page4ConclusionRanking';
import { Page5Comparison } from './components/Page5Comparison';
import { Page5DeveloperControls } from './components/Page5DeveloperControls';
import { MFSearchResult } from './types/mf';
import { fetchLocalConfig, saveLocalConfig } from './services/groqApi';

const LOCAL_STORAGE_KEY = 'amfi_pinned_scheme_codes_v1';
export const COLOR_PALETTE = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#e11d48', '#65a30d', '#9333ea'];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<number>(1);
  const [pinnedSchemeCodes, setPinnedSchemeCodes] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse localStorage pinned codes', e);
    }
    return [];
  });

  const [pinnedFundsData, setPinnedFundsData] = useState<PinnedFund[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Historical Check Past Date option - defaults to today dynamically
  const [pastDateStr, setPastDateStr] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [apiKey, setApiKey] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [savePath, setSavePath] = useState<string>(() => {
    return localStorage.getItem('save_data_path') || '';
  });

  // Comparison Page State elevated to survive tab switches but cleared on refresh
  const [compSelectedFunds, setCompSelectedFunds] = useState<PinnedFund[]>([]);
  const [compMetric, setCompMetric] = useState<'NAV' | '7D' | '15D' | '30D'>('NAV');
  const [compVisibleFunds, setCompVisibleFunds] = useState<{ [schemeCode: number]: boolean }>({});
  const [compDatePreset, setCompDatePreset] = useState<'7D' | '15D' | '30D' | '90D' | '1Y' | 'ALL' | 'CUSTOM'>('90D');
  const [compStartDate, setCompStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [compEndDate, setCompEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    fetchLocalConfig(savePath).then(cfg => {
      setApiKey(cfg.apiKey || '');
      setSummary(cfg.summary || '');
      if (cfg.pinnedSchemes) {
        setPinnedSchemeCodes(cfg.pinnedSchemes);
      }
      if (!savePath) {
        setTimeout(() => {
          showToast('Save link not set, set from developer controls.');
        }, 1500);
      }
    });
  }, [savePath]);

  const handleSaveApiKey = async (newKey: string) => {
    setApiKey(newKey);
    const success = await saveLocalConfig(newKey, summary, pinnedSchemeCodes, savePath);
    if (!success && !savePath) {
      showToast('Save link not set, set from developer controls.');
    }
  };

  const handleUpdateSummary = async (newSummary: string) => {
    setSummary(newSummary);
    const success = await saveLocalConfig(apiKey, newSummary, pinnedSchemeCodes, savePath);
    if (!success && !savePath) {
      showToast('Save link not set, set from developer controls.');
    }
  };

  const handleSavePath = async (newPath: string) => {
    localStorage.setItem('save_data_path', newPath);
    setSavePath(newPath);
    try {
      const cfg = await fetchLocalConfig(newPath);
      setApiKey(cfg.apiKey || '');
      setSummary(cfg.summary || '');
      if (cfg.pinnedSchemes) {
        setPinnedSchemeCodes(cfg.pinnedSchemes);
      } else {
        await saveLocalConfig(apiKey, summary, pinnedSchemeCodes, newPath);
      }
      showToast('Save path updated and configuration synchronized.');
    } catch (err) {
      showToast('Save path updated. Error syncing configuration.');
    }
  };

  // Search autocomplete in top bar
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MFSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Sync pinned schemes to storage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(pinnedSchemeCodes));
    } catch (e) {
      console.error('Failed to write pinned codes to localStorage', e);
    }

    if (savePath) {
      saveLocalConfig(apiKey, summary, pinnedSchemeCodes, savePath);
    }
  }, [pinnedSchemeCodes, savePath, apiKey, summary]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadPinnedFunds = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const promises = pinnedSchemeCodes.map(code =>
        fetchFundDetail(code).catch(err => {
          console.error(`Error loading scheme ${code}:`, err);
          return null;
        })
      );
      const results = await Promise.all(promises);
      const validFunds = results.filter((f): f is PinnedFund => f !== null);
      setPinnedFundsData(validFunds);
    } catch (e) {
      console.error('Error fetching pinned funds:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [pinnedSchemeCodes]);

  useEffect(() => {
    loadPinnedFunds();
  }, [loadPinnedFunds]);

  const handleTogglePin = (schemeCode: number) => {
    if (pinnedSchemeCodes.includes(schemeCode)) {
      setPinnedSchemeCodes(prev => prev.filter(c => c !== schemeCode));
      if (!savePath) {
        showToast('Removed from pinned list. Save link not set, set from developer controls.');
      } else {
        showToast('Removed from pinned list.');
      }
    } else {
      setPinnedSchemeCodes(prev => [...prev, schemeCode]);
      if (!savePath) {
        showToast('Added to pinned list. Save link not set, set from developer controls.');
      } else {
        showToast('Added to pinned list.');
      }
    }
  };

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim().length >= 2) {
      setIsSearching(true);
      const results = await searchSchemes(q);
      setSearchResults(results);
      setIsSearching(false);
    } else {
      setSearchResults([]);
    }
  };

  const handleRefresh = () => {
    loadPinnedFunds(true);
    showToast('Refreshing live AMFI data...');
  };

  return (
    <div className="app-container">
      {/* Toast popup */}
      {toastMessage && <div className="toast-msg">{toastMessage}</div>}

      {/* Left Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <TrendingUp size={20} />
          </div>
          <div className="brand-text">
            <h1>AMFI Mutual Fund</h1>
            <p>Realtime Analytics</p>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="sidebar-menu">
          <span className="menu-title">Pages & Dashboards</span>
          <button
            onClick={() => setActiveTab(1)}
            className={`menu-item ${activeTab === 1 ? 'active' : ''}`}
          >
            <span className="menu-item-icon"><ListFilter size={18} /></span>
            <span>1. Details & Explorer</span>
          </button>
          <button
            onClick={() => setActiveTab(2)}
            className={`menu-item ${activeTab === 2 ? 'active' : ''}`}
          >
            <span className="menu-item-icon"><Grid size={18} /></span>
            <span>2. Pinned NAV Grid</span>
          </button>
          <button
            onClick={() => setActiveTab(3)}
            className={`menu-item ${activeTab === 3 ? 'active' : ''}`}
          >
            <span className="menu-item-icon"><BarChart3 size={18} /></span>
            <span>3. AMC Individual</span>
          </button>
          <button
            onClick={() => setActiveTab(4)}
            className={`menu-item ${activeTab === 4 ? 'active' : ''}`}
          >
            <span className="menu-item-icon"><Award size={18} /></span>
            <span>4. Conclusion & Ranks</span>
          </button>
          <button
            onClick={() => setActiveTab(5)}
            className={`menu-item ${activeTab === 5 ? 'active' : ''}`}
          >
            <span className="menu-item-icon"><Shuffle size={18} /></span>
            <span>5. Side-by-side Compare</span>
          </button>
          <button
            onClick={() => setActiveTab(6)}
            className={`menu-item ${activeTab === 6 ? 'active' : ''}`}
          >
            <span className="menu-item-icon"><Sliders size={18} /></span>
            <span>6. Developer Controls</span>
          </button>
        </nav>

        {/* Pinned Funds list directly inside sidebar */}
        <div className="sidebar-pinned-section">
          <div className="pinned-title-row">
            <span className="menu-title" style={{ margin: 0 }}>Pinned Schemes</span>
            <span className="pinned-badge-count">{pinnedFundsData.length}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '2px' }} className="no-scrollbar">
            {pinnedFundsData.length === 0 ? (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No funds pinned. Search above to pin.</span>
            ) : (
              pinnedFundsData.map((fund, idx) => (
                <div key={fund.schemeCode} className="pinned-chip">
                  <div className="pinned-chip-info">
                    <span className="pinned-chip-name">{fund.schemeName}</span>
                    <span className="pinned-chip-nav">NAV: ₹{fund.latestNav.toFixed(2)}</span>
                  </div>
                  <button onClick={() => handleTogglePin(fund.schemeCode)} className="pinned-chip-close">
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Right Content Pane */}
      <div className="app-content">
        {/* Top Header / Toolbar */}
        <header className="top-toolbar">
          {/* Quick Search */}
          <div className="search-wrapper">
            <Search size={16} className="search-icon-left" />
            <input
              type="text"
              placeholder="Search & pin new schemes..."
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => setShowSearchModal(true)}
              className="search-input-field"
            />
            {searchQuery && (
              <X
                size={14}
                className="search-clear-right"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
              />
            )}

            {/* Search Dropdown */}
            {showSearchModal && searchQuery.trim().length >= 2 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '8px',
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  maxHeight: '280px',
                  overflowY: 'auto',
                  zIndex: 100,
                  padding: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid var(--border-light)', marginBottom: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span>Results ({searchResults.length})</span>
                  <button onClick={() => setShowSearchModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Close</button>
                </div>

                {isSearching ? (
                  <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Searching AMFI...</div>
                ) : searchResults.length === 0 ? (
                  <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>No matches found</div>
                ) : (
                  searchResults.map(item => {
                    const isPinned = pinnedSchemeCodes.includes(item.schemeCode);
                    return (
                      <div
                        key={item.schemeCode}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px',
                          borderBottom: '1px solid #f8fafc',
                          gap: '8px'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.schemeName}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Code: {item.schemeCode}</div>
                        </div>
                        <button
                          onClick={() => handleTogglePin(item.schemeCode)}
                          className={`btn ${isPinned ? 'btn-danger-outline' : 'btn-primary'}`}
                          style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                        >
                          {isPinned ? 'Unpin' : 'Pin'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Right actions: Historical Date lookup option + Refresh Sync */}
          <div className="toolbar-actions">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f1f5f9', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <Calendar size={16} className="text-slate-500" />
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Check Past NAV Date:</label>
              <input
                type="date"
                value={pastDateStr}
                onChange={e => {
                  setPastDateStr(e.target.value);
                  showToast(`Checking NAV on selected date: ${e.target.value}`);
                }}
                className="date-picker-input"
                style={{ padding: '4px 8px', fontSize: '0.72rem' }}
              />
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="btn btn-outline"
              style={{ padding: '8px 12px' }}
              title="Sync NAV"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {/* Primary Page Content Wrapper */}
        <main className="content-body">
          {activeTab === 1 && (
            <Page1FundExplorer
              pinnedFunds={pinnedFundsData}
              onTogglePin={handleTogglePin}
              isLoading={isLoading}
              colorPalette={COLOR_PALETTE}
              pastDate={pastDateStr}
            />
          )}

          {activeTab === 2 && (
            <Page2NAVComparisonGrid
              pinnedFunds={pinnedFundsData}
              isLoading={isLoading}
              pastDate={pastDateStr}
            />
          )}

          {activeTab === 3 && (
            <Page3AMCIndividual
              pinnedFunds={pinnedFundsData}
              isLoading={isLoading}
            />
          )}

          {activeTab === 4 && (
            <Page4ConclusionRanking
              pinnedFunds={pinnedFundsData}
              isLoading={isLoading}
              pastDate={pastDateStr}
              apiKey={apiKey}
              summary={summary}
              onUpdateSummary={handleUpdateSummary}
            />
          )}

          {activeTab === 5 && (
            <Page5Comparison
              pinnedFunds={pinnedFundsData}
              isLoading={isLoading}
              selectedFunds={compSelectedFunds}
              setSelectedFunds={setCompSelectedFunds}
              comparisonMetric={compMetric}
              setComparisonMetric={setCompMetric}
              visibleFunds={compVisibleFunds}
              setVisibleFunds={setCompVisibleFunds}
              datePreset={compDatePreset}
              setDatePreset={setCompDatePreset}
              startDate={compStartDate}
              setStartDate={setCompStartDate}
              endDate={compEndDate}
              setEndDate={setCompEndDate}
            />
          )}

          {activeTab === 6 && (
            <Page5DeveloperControls
              apiKey={apiKey}
              onSaveApiKey={handleSaveApiKey}
              savePath={savePath}
              onSavePath={handleSavePath}
            />
          )}
        </main>
      </div>
    </div>
  );
};
