export interface MFSearchResult {
  schemeCode: number;
  schemeName: string;
}

export interface MFHistoricalDataPoint {
  date: string; // DD-MM-YYYY
  nav: string;  // e.g. "105.4321"
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

export interface PinnedFund {
  schemeCode: number;
  schemeName: string;
  isin: string;
  amc: string;
  launchDate: string;
  latestNav: number;
  navAsOf: string;
  historicalData: {
    date: string;
    nav: number;
    parsedDate: Date;
  }[];
  // Calculated Rolling Returns (from real NAV history)
  return7d: number;
  return15d: number;
  return30d: number;
  return7dAnn: number;
  return15dAnn: number;
  return30dAnn: number;
}

export interface GranularNAVRow {
  id: string;
  fundName: string;
  date: string;
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

export interface RankingRow {
  schemeCode: number;
  fundName: string;
  isin: string;
  amc: string;
  latestNav: number;
  navAsOf: string;
  return30d: number;
  returnRank: number;
  overallScore: number;
  overallRank: number;
}
