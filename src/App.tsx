import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ListFilter,
  Grid,
  BarChart3,
  Award,
  RefreshCw,
  Search,
  X,
  TrendingUp,
  Calendar,
  Sliders,
  Shuffle,
  Eye,
  EyeOff,
  Menu,
  RotateCcw
} from 'lucide-react';
import { PinnedFund, MFSearchResult } from './types/mf';
import { fetchFundDetail, DEFAULT_SCHEME_CODES, searchSchemes, formatDateDisplay } from './services/amfiApi';
import { todayISO, shiftISODate } from './services/calc';
import { fmtNav, fmtPct, pctClass } from './services/format';
import { hideSplash, setSplashStatus } from './splash';
import { Page1FundExplorer } from './components/Page1FundExplorer';
import { Page2NAVComparisonGrid } from './components/Page2NAVComparisonGrid';
import { Page3AMCIndividual } from './components/Page3AMCIndividual';
import { Page4ConclusionRanking } from './components/Page4ConclusionRanking';
import { Page5Comparison } from './components/Page5Comparison';
import { Page5DeveloperControls } from './components/Page5DeveloperControls';

const LOCAL_STORAGE_KEY = 'amfi_pinned_scheme_codes_v1';
const HIDDEN_STORAGE_KEY = 'amfi_hidden_scheme_codes_v1';
const TAB_STORAGE_KEY = 'amfi_active_tab_v1';
export const COLOR_PALETTE = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#e11d48', '#65a30d', '#9333ea', '#0d9488', '#ea580c', '#4f46e5'];

const PAGES = [
  { id: 1, label: 'Details & Explorer', short: 'Explore', icon: ListFilter },
  { id: 2, label: 'Pinned NAV Grid', short: 'Grid', icon: Grid },
  { id: 3, label: 'AMC Individual', short: 'Fund', icon: BarChart3 },
  { id: 4, label: 'Conclusion & Ranks', short: 'Ranks', icon: Award },
  { id: 5, label: 'Side-by-side Compare', short: 'Compare', icon: Shuffle },
  { id: 6, label: 'Developer Controls', short: 'Settings', icon: Sliders }
] as const;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('localStorage write failed', e);
  }
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<number>(() => {
    const t = readJSON<number>(TAB_STORAGE_KEY, 1);
    return t >= 1 && t <= 6 ? t : 1;
  });

  const [pinnedSchemeCodes, setPinnedSchemeCodes] = useState<number[]>(() => {
    const defaults = DEFAULT_SCHEME_CODES.map(s => s.schemeCode);
    const parsed = readJSON<unknown>(LOCAL_STORAGE_KEY, []);
    const stored = Array.isArray(parsed) ? parsed.filter((c): c is number => Number.isInteger(c)) : [];
    return Array.from(new Set([...stored, ...defaults]));
  });

  // Hidden funds are excluded from every page; the sidebar still lists them (blurred).
  const [hiddenSchemeCodes, setHiddenSchemeCodes] = useState<number[]>(() => {
    const parsed = readJSON<unknown>(HIDDEN_STORAGE_KEY, []);
    return Array.isArray(parsed) ? parsed.filter((c): c is number => Number.isInteger(c)) : [];
  });

  const [pinnedFundsData, setPinnedFundsData] = useState<PinnedFund[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // "Check past NAV date" — defaults to today (local time, not UTC).
  const [pastDateStr, setPastDateStr] = useState<string>(todayISO);

  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('groq_api_key') || '');
  const [summary, setSummary] = useState<string>(() => localStorage.getItem('groq_latest_summary') || '');

  // Comparison page state lives here so it survives tab switches.
  const [compSelectedFunds, setCompSelectedFunds] = useState<PinnedFund[]>([]);
  const [compMetric, setCompMetric] = useState<'NAV' | '7D' | '15D' | '30D'>('NAV');
  const [compVisibleFunds, setCompVisibleFunds] = useState<{ [schemeCode: number]: boolean }>({});
  const [compDatePreset, setCompDatePreset] = useState<'7D' | '15D' | '30D' | '90D' | '1Y' | '3Y' | 'ALL' | 'CUSTOM'>('1Y');
  const [compStartDate, setCompStartDate] = useState<string>(() => shiftISODate(todayISO(), -365));
  const [compEndDate, setCompEndDate] = useState<string>(todayISO);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const handleSaveApiKey = async (newKey: string) => {
    setApiKey(newKey);
    writeStorage('groq_api_key', newKey);
    showToast('API Key updated successfully!');
  };

  const handleUpdateSummary = async (newSummary: string) => {
    setSummary(newSummary);
    writeStorage('groq_latest_summary', newSummary);
  };

  useEffect(() => writeStorage(LOCAL_STORAGE_KEY, JSON.stringify(pinnedSchemeCodes)), [pinnedSchemeCodes]);
  useEffect(() => writeStorage(HIDDEN_STORAGE_KEY, JSON.stringify(hiddenSchemeCodes)), [hiddenSchemeCodes]);
  useEffect(() => writeStorage(TAB_STORAGE_KEY, JSON.stringify(activeTab)), [activeTab]);

  // ---- Loading pinned funds -------------------------------------------------
  const loadSeq = useRef(0);
  const loadPinnedFunds = useCallback(
    async (force = false) => {
      const seq = ++loadSeq.current;
      if (force) setIsRefreshing(true);
      else setIsLoading(true);

      const total = pinnedSchemeCodes.length;
      let done = 0;
      setSplashStatus(total ? `Fetching latest NAVs (0/${total})…` : 'Ready');
      const results = await Promise.all(
        pinnedSchemeCodes.map(code =>
          fetchFundDetail(code, force).then(f => {
            done++;
            setSplashStatus(`Fetching latest NAVs (${done}/${total})…`);
            return f;
          })
        )
      );
      if (seq !== loadSeq.current) return; // a newer load superseded this one
      setPinnedFundsData(results);
      setLastUpdated(new Date());
      setIsLoading(false);
      setIsRefreshing(false);
      hideSplash();
      const failed = results.filter(f => f.loadError).length;
      if (failed) showToast(`${failed} scheme${failed > 1 ? 's' : ''} failed to load. Tap retry in the pinned list.`);
      else if (force) showToast('NAV data refreshed.');
    },
    [pinnedSchemeCodes, showToast]
  );

  useEffect(() => {
    loadPinnedFunds();
  }, [loadPinnedFunds]);

  const handleTogglePin = (schemeCode: number) => {
    if (pinnedSchemeCodes.includes(schemeCode)) {
      setPinnedSchemeCodes(prev => prev.filter(c => c !== schemeCode));
      setHiddenSchemeCodes(prev => prev.filter(c => c !== schemeCode));
      showToast('Removed from pinned list.');
    } else {
      setPinnedSchemeCodes(prev => [...prev, schemeCode]);
      showToast('Added to pinned list.');
    }
  };

  const handleToggleHide = (schemeCode: number) => {
    const isHidden = hiddenSchemeCodes.includes(schemeCode);
    setHiddenSchemeCodes(prev => (isHidden ? prev.filter(c => c !== schemeCode) : [...prev, schemeCode]));
    showToast(isHidden ? 'Scheme unhidden.' : 'Scheme hidden from all pages.');
  };

  const handleRetry = async (schemeCode: number) => {
    const fund = await fetchFundDetail(schemeCode, true);
    setPinnedFundsData(prev => prev.map(f => (f.schemeCode === schemeCode ? fund : f)));
    showToast(fund.loadError ? `Still failing: ${fund.loadError}` : 'Scheme loaded.');
  };

  // ---- Search (debounced, ignores out-of-order responses) -------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MFSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const searchSeq = useRef(0);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const seq = ++searchSeq.current;
    const t = window.setTimeout(async () => {
      const results = await searchSchemes(q);
      if (seq === searchSeq.current) {
        setSearchResults(results);
        setIsSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setShowSearchModal(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, []);

  const goToTab = (id: number) => {
    setActiveTab(id);
    setSidebarOpen(false);
    document.querySelector('.content-body')?.scrollTo({ top: 0 });
  };

  // Funds shown on pages: loaded successfully and not hidden.
  const visiblePinnedFundsData = useMemo(
    () => pinnedFundsData.filter(f => !f.loadError && !hiddenSchemeCodes.includes(f.schemeCode)),
    [pinnedFundsData, hiddenSchemeCodes]
  );

  const latestNavDate = useMemo(() => {
    const dates = visiblePinnedFundsData.map(f => f.latestNavDate?.getTime() || 0).filter(Boolean);
    return dates.length ? new Date(Math.max(...dates)) : null;
  }, [visiblePinnedFundsData]);

  return (
    <div className="app-container">
      {toastMessage && (
        <div className="toast-msg" role="status">
          {toastMessage}
        </div>
      )}

      {/* Mobile drawer backdrop */}
      <div className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Left Sidebar (drawer on mobile) */}
      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Navigation">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <TrendingUp size={20} />
          </div>
          <div className="brand-text">
            <h1>AMFI Mutual Fund</h1>
            <p>Realtime Analytics</p>
          </div>
          <button className="icon-btn sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-menu">
          <span className="menu-title">Pages & Dashboards</span>
          {PAGES.map(p => {
            const Icon = p.icon;
            return (
              <button key={p.id} onClick={() => goToTab(p.id)} className={`menu-item ${activeTab === p.id ? 'active' : ''}`}>
                <span className="menu-item-icon">
                  <Icon size={18} />
                </span>
                <span>
                  {p.id}. {p.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-pinned-section">
          <div className="pinned-title-row">
            <span className="menu-title" style={{ margin: 0 }}>
              Pinned Schemes
            </span>
            <span className="pinned-badge-count">{pinnedSchemeCodes.length}</span>
          </div>

          <div className="pinned-list no-scrollbar">
            {pinnedSchemeCodes.length === 0 ? (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No funds pinned. Use the search bar to find and pin schemes.</span>
            ) : isLoading && pinnedFundsData.length === 0 ? (
              pinnedSchemeCodes.map(c => <div key={c} className="skeleton" style={{ height: '44px' }} />)
            ) : (
              pinnedFundsData.map(fund => {
                const isHidden = hiddenSchemeCodes.includes(fund.schemeCode);
                return (
                  <div key={fund.schemeCode} className={`pinned-chip ${fund.loadError ? 'pinned-chip-error' : ''}`}>
                    <div className="pinned-chip-info" style={isHidden ? { filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none' } : undefined}>
                      <span className="pinned-chip-name" title={fund.schemeName}>
                        {fund.schemeName}
                      </span>
                      {fund.loadError ? (
                        <span className="pinned-chip-nav" style={{ color: 'var(--color-danger)' }}>
                          {fund.loadError}
                        </span>
                      ) : (
                        <span className="pinned-chip-nav">
                          {fmtNav(fund.latestNav, 2)}{' '}
                          <span className={pctClass(fund.dayChangePct)}>{fmtPct(fund.dayChangePct)}</span>
                          {fund.isStale && (
                            <span title={`Last NAV ${fund.navAsOf}`} style={{ color: 'var(--color-warning)' }}>
                              {' '}
                              · stale
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                      {fund.loadError ? (
                        <button onClick={() => handleRetry(fund.schemeCode)} className="pinned-chip-close" title="Retry loading" aria-label="Retry loading">
                          <RotateCcw size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleHide(fund.schemeCode)}
                          className="pinned-chip-close"
                          title={isHidden ? 'Unhide scheme' : 'Hide scheme from all pages'}
                          aria-label={isHidden ? 'Unhide scheme' : 'Hide scheme'}
                        >
                          {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      )}
                      <button onClick={() => handleTogglePin(fund.schemeCode)} className="pinned-chip-close" title="Unpin scheme" aria-label="Unpin scheme">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {lastUpdated && (
            <div className="sidebar-updated">
              Data as of {latestNavDate ? formatDateDisplay(latestNavDate) : '—'} · synced {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      </aside>

      {/* Right Content Pane */}
      <div className="app-content">
        <header className="top-toolbar">
          <button className="icon-btn menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={20} />
            {pinnedFundsData.some(f => f.loadError) && <span className="dot-alert" />}
          </button>

          <div className="search-wrapper" ref={searchBoxRef}>
            <Search size={16} className="search-icon-left" />
            <input
              type="search"
              inputMode="search"
              placeholder="Search & pin schemes (name or code)…"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setShowSearchModal(true);
              }}
              onFocus={() => setShowSearchModal(true)}
              className="search-input-field"
              aria-label="Search schemes"
            />
            {searchQuery && (
              <button
                className="search-clear-right"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}

            {showSearchModal && searchQuery.trim().length >= 2 && (
              <div className="search-dropdown">
                <div className="search-dropdown-head">
                  <span>{isSearching ? 'Searching AMFI…' : `Results (${searchResults.length})`}</span>
                  <button onClick={() => setShowSearchModal(false)}>Close</button>
                </div>
                {isSearching && searchResults.length === 0 ? (
                  <div className="search-empty">Searching AMFI…</div>
                ) : searchResults.length === 0 ? (
                  <div className="search-empty">No matches found</div>
                ) : (
                  searchResults.map(item => {
                    const isPinned = pinnedSchemeCodes.includes(item.schemeCode);
                    return (
                      <div key={item.schemeCode} className="search-result-row">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="search-result-name">{item.schemeName}</div>
                          <div className="search-result-code">Code: {item.schemeCode}</div>
                        </div>
                        <button
                          onClick={() => handleTogglePin(item.schemeCode)}
                          className={`btn ${isPinned ? 'btn-danger-outline' : 'btn-primary'}`}
                          style={{ padding: '6px 10px', fontSize: '0.72rem' }}
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

          <div className="toolbar-actions">
            <div className="past-date-box" title="NAV comparison date used on pages 1, 2 and 4">
              <Calendar size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <label htmlFor="past-date" className="hide-sm">
                Check Past NAV Date:
              </label>
              <input
                id="past-date"
                type="date"
                value={pastDateStr}
                max={todayISO()}
                onChange={e => {
                  const v = e.target.value || todayISO();
                  setPastDateStr(v);
                  showToast(`Comparing against NAV on ${formatDateDisplay(v)}`);
                }}
                className="date-picker-input"
              />
              {pastDateStr !== todayISO() && (
                <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setPastDateStr(todayISO())} title="Reset to today" aria-label="Reset date to today">
                  <X size={12} />
                </button>
              )}
            </div>

            <button onClick={() => loadPinnedFunds(true)} disabled={isRefreshing || isLoading} className="btn btn-outline refresh-btn" title="Fetch latest NAVs" aria-label="Refresh NAVs">
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        <main className="content-body">
          {activeTab === 1 && (
            <Page1FundExplorer pinnedFunds={visiblePinnedFundsData} onTogglePin={handleTogglePin} isLoading={isLoading} colorPalette={COLOR_PALETTE} pastDate={pastDateStr} />
          )}
          {activeTab === 2 && <Page2NAVComparisonGrid pinnedFunds={visiblePinnedFundsData} isLoading={isLoading} pastDate={pastDateStr} />}
          {activeTab === 3 && <Page3AMCIndividual pinnedFunds={visiblePinnedFundsData} isLoading={isLoading} />}
          {activeTab === 4 && (
            <Page4ConclusionRanking
              pinnedFunds={visiblePinnedFundsData}
              isLoading={isLoading}
              pastDate={pastDateStr}
              apiKey={apiKey}
              summary={summary}
              onUpdateSummary={handleUpdateSummary}
            />
          )}
          {activeTab === 5 && (
            <Page5Comparison
              pinnedFunds={visiblePinnedFundsData}
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
          {activeTab === 6 && <Page5DeveloperControls apiKey={apiKey} onSaveApiKey={handleSaveApiKey} />}
          <footer className="app-footer">
            NAV data: AMFI via mfapi.in. Returns under 1 year are simple annualised; 1 year and above are CAGR. Past performance does not guarantee future returns.
          </footer>
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="bottom-nav" aria-label="Pages">
          {PAGES.map(p => {
            const Icon = p.icon;
            return (
              <button key={p.id} className={activeTab === p.id ? 'active' : ''} onClick={() => goToTab(p.id)} aria-label={p.label}>
                <Icon size={20} />
                <span>{p.short}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
