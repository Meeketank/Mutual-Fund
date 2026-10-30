export interface MFSearchResult {
  schemeCode: number;
  schemeName: string;
}

export interface MFHistoricalDataPoint {
  date: string; // DD-MM-YYYY
  nav: string; // e.g. "105.4321"
}

export interface MFMetaData {
  scheme_code: number;
  scheme_name: string;
  isin_growth?: string | null;
  isin_div_reinvestment?: string | null;
  fund_house: string;
  scheme_type?: string;
  scheme_category?: string;
}

export interface MFDetailResponse {
  meta: MFMetaData;
  data: MFHistoricalDataPoint[];
  status: string;
}

export interface NavHistoryPoint {
  date: string; // DD-MM-YYYY
  nav: number;
  parsedDate: Date;
}

export interface PinnedFund {
  schemeCode: number;
  schemeName: string;
  isin: string;
  amc: string;
  /** Official AMFI category, e.g. "Debt Scheme - Liquid Fund". */
  category: string;
  /** e.g. "Open Ended Schemes". */
  schemeType: string;
  /** Date of the first NAV available in the AMFI history. */
  launchDate: string;
  latestNav: number;
  navAsOf: string;
  latestNavDate: Date | null;
  /** Previous published NAV and the 1-day change. */
  prevNav: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  /** True when the latest NAV is more than 5 days old. */
  isStale: boolean;
  /** Newest first. */
  historicalData: NavHistoryPoint[];
  /** Oldest first (same points). */
  historyAsc: NavHistoryPoint[];

  // Point-to-point returns ending on the latest NAV. Null = not enough history.
  return7d: number | null;
  return15d: number | null;
  return30d: number | null;
  return7dAnn: number | null;
  return15dAnn: number | null;
  return30dAnn: number | null;
  return3m: number | null;
  return6m: number | null;
  return1y: number | null; // absolute = CAGR for exactly 1y
  return3y: number | null; // CAGR
  return5y: number | null; // CAGR
  returnSinceStart: number | null; // CAGR since first available NAV
  volatility1y: number | null;
  maxDrawdown1y: number | null;

  /** Set when the scheme failed to load. Such funds are only shown in the sidebar. */
  loadError?: string;
}

export interface GranularNAVRow {
  id: string;
  fundName: string;
  date: string;
  iso: string;
  isCarried: boolean;
  nav: number;
  openingNav: number;
  closingNav: number;
  delta: number;
  deltaPercent: number;
  rollingReturn7d: number | null;
  rollingReturn15d: number | null;
  rollingReturn30d: number | null;
  rollingReturn7dAnn: number | null;
  rollingReturn15dAnn: number | null;
  rollingReturn30dAnn: number | null;
}
