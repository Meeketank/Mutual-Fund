# AMFI Mutual Fund Analytics

Live NAVs, returns, rankings and side-by-side comparison for Indian mutual funds (data: AMFI via [mfapi.in](https://www.mfapi.in)).

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # calculation tests (uses real AMFI NAV fixtures)
npm run build
```

## How numbers are calculated

- "NAV on a date" = latest published NAV on or before that date.
- Returns under 1 year: absolute %, and simple annualised (`abs% × 365 / days`), the SEBI convention.
- 1 year and above: CAGR. Day counts are real calendar days between the two NAV dates.
- If a fund's history doesn't reach back far enough, the value shows "—" instead of a fake 0%.
- Weekends/holidays carry forward the previous business day's NAV (shown in grey).
- SIP: monthly instalment bought at the first NAV on/after each date; XIRR via Newton's method with bisection fallback.

All formulas live in `src/services/calc.ts` and are covered by `src/services/calc.test.ts`.
