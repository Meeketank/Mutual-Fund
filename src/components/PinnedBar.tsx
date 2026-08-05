import React from 'react';
import { Pin, X } from 'lucide-react';
import { PinnedFund } from '../types/mf';

interface PinnedBarProps {
  pinnedFunds: PinnedFund[];
  onUnpinFund: (schemeCode: number) => void;
  colorPalette: string[];
}

export const PinnedBar: React.FC<PinnedBarProps> = ({
  pinnedFunds,
  onUnpinFund,
  colorPalette
}) => {
  if (pinnedFunds.length === 0) {
    return (
      <div className="bg-slate-100 border-b border-slate-200 py-2 px-4 text-xs text-slate-500 text-center flex items-center justify-center gap-2">
        <Pin size={14} className="text-blue-600" />
        <span>No mutual funds currently pinned. Use the search bar to find and pin funds to power comparisons!</span>
      </div>
    );
  }

  return (
    <div className="bg-white border-b border-slate-200 py-2.5 px-4 sticky top-[108px] z-40 shadow-xs">
      <div className="max-w-7xl mx-auto flex items-center gap-3 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 flex-shrink-0 pr-2 border-r border-slate-200">
          <Pin size={14} className="text-blue-600" />
          <span>Pinned Funds ({pinnedFunds.length}):</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          {pinnedFunds.map((fund, idx) => {
            const isPos = fund.return30d >= 0;
            const dotColor = colorPalette[idx % colorPalette.length];
            return (
              <div
                key={fund.schemeCode}
                className="flex items-center gap-2 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1 text-xs font-medium transition-all flex-shrink-0 shadow-xs"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: dotColor }}
                ></span>

                <div className="flex items-center gap-2 max-w-[240px]">
                  <span className="text-slate-800 truncate font-semibold" title={fund.schemeName}>
                    {fund.schemeName}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    ₹{fund.latestNav.toFixed(2)}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      isPos ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {isPos ? '+' : ''}{fund.return30d.toFixed(1)}%
                  </span>
                </div>

                <button
                  onClick={() => onUnpinFund(fund.schemeCode)}
                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-0.5 rounded transition-colors"
                  title="Unpin Fund"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
