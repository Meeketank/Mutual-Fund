import React, { useState } from 'react';
import {
  TrendingUp,
  Search,
  Pin,
  RefreshCw,
  Award,
  Grid,
  BarChart3,
  ListFilter,
  CheckCircle2,
  X
} from 'lucide-react';
import { MFSearchResult } from '../types/mf';
import { searchSchemes } from '../services/amfiApi';

interface HeaderProps {
  activeTab: number;
  setActiveTab: (tab: number) => void;
  pinnedCount: number;
  onPinScheme: (schemeCode: number) => void;
  pinnedCodes: number[];
  onRefreshData: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  pinnedCount,
  onPinScheme,
  pinnedCodes,
  onRefreshData,
  isRefreshing
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MFSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

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

  const navItems = [
    { id: 1, label: '1. Fund Details & Explorer', icon: ListFilter },
    { id: 2, label: '2. Pinned NAV Grid', icon: Grid },
    { id: 3, label: '3. AMC Individual', icon: BarChart3 },
    { id: 4, label: '4. Conclusion & Ranks', icon: Award }
  ];

  return (
    <header className="app-header">
      {/* Top Header Bar */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <TrendingUp size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 font-heading">
                AMFI Mutual Fund Realtime Analytics
              </h1>
              <span className="badge badge-emerald flex items-center gap-1.5 py-0.5 text-[11px] font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                LIVE AMFI API
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Real-time NAV tracking, side-by-side historical comparison, and rolling return analytics
            </p>
          </div>
        </div>

        {/* Global Live Search Bar */}
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative w-full">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search 15,000+ AMFI schemes (e.g. Axis, HDFC, SBI, Liquid)..."
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => setShowSearchModal(true)}
                className="input-text pl-10 pr-8 text-xs py-2.5 rounded-lg border-slate-300 bg-white text-slate-900 placeholder-slate-400 shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Search Results Dropdown */}
            {showSearchModal && searchQuery.trim().length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto p-2">
                <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500 border-b border-slate-100 mb-1">
                  <span>Search Results ({searchResults.length})</span>
                  <button
                    onClick={() => setShowSearchModal(false)}
                    className="hover:text-slate-900 font-semibold"
                  >
                    Close
                  </button>
                </div>

                {isSearching ? (
                  <div className="p-4 text-center text-xs text-slate-500">Searching AMFI directory...</div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">No schemes found matching "{searchQuery}"</div>
                ) : (
                  searchResults.map(item => {
                    const isPinned = pinnedCodes.includes(item.schemeCode);
                    return (
                      <div
                        key={item.schemeCode}
                        className="flex items-center justify-between p-2.5 hover:bg-slate-50 rounded-lg group transition-colors border-b border-slate-50 last:border-none"
                      >
                        <div className="flex-1 pr-3">
                          <div className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                            {item.schemeName}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Scheme Code: {item.schemeCode}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            onPinScheme(item.schemeCode);
                          }}
                          className={`btn ${
                            isPinned ? 'btn-unpin text-xs py-1 px-2.5' : 'btn-pin text-xs py-1 px-2.5'
                          }`}
                        >
                          {isPinned ? (
                            <>
                              <CheckCircle2 size={13} /> Pinned
                            </>
                          ) : (
                            <>
                              <Pin size={13} /> Pin Fund
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <button
            onClick={onRefreshData}
            disabled={isRefreshing}
            className="btn btn-outline p-2.5 text-slate-600 hover:text-slate-900 rounded-lg"
            title="Refresh Live AMFI NAVs"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin text-blue-600' : ''} />
          </button>
        </div>

        {/* Pinned Funds Count Pill */}
        <div className="flex items-center gap-2">
          <span className="badge badge-blue text-xs font-mono py-1.5 px-3 flex items-center gap-1.5 shadow-sm">
            <Pin size={14} className="text-blue-600" />
            <span className="font-bold text-blue-700">{pinnedCount}</span> Pinned Funds
          </span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-t border-slate-200 bg-slate-50/80">
        <div className="max-w-7xl mx-auto px-4 flex items-center space-x-2 overflow-x-auto py-1.5">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`nav-tab ${activeTab === item.id ? 'active' : ''}`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
