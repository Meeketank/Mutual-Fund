import { PinnedFund } from '../types/mf';

// Helper metrics for system prompt
const REFERENCE_METRICS = `
Default Schemes Reference Metrics:
- Aditya Birla Sun Life Money Manager Fund: AUM ₹28,778 Cr, Expense Ratio 0.37% (rank 8 on cost)
- Axis Money Market Fund: AUM ₹7,600 Cr, Expense Ratio 0.15% (rank 1 on cost)
- Bandhan Money Market Fund: AUM ₹3,600 Cr, Expense Ratio 0.16% (rank 3 on cost)
- ICICI Prudential Money Market Fund: AUM ₹31,085 Cr, Expense Ratio 0.22% (rank 4 on cost)
- Kotak Money Market Fund: AUM ₹32,331 Cr, Expense Ratio 0.21% (rank 2 on cost)
- Nippon India Money Market Fund: AUM ₹11,500 Cr, Expense Ratio 0.19% (rank 5 on cost)
- UTI Money Market Fund: AUM ₹9,200 Cr, Expense Ratio 0.17% (rank 2 on cost)
- HSBC Liquid Fund: AUM ₹19,663 Cr, Expense Ratio 0.19% (rank 2 on cost)
- Baroda BNP Paribas Liquid Fund: AUM ₹11,380 Cr, Expense Ratio 0.18% (rank 1 on cost)
`;

export async function generateGroqSummary(apiKey: string, rankingsData: any[]): Promise<string> {
  if (!apiKey) {
    throw new Error('Groq API Key is not configured. Please add it in the Developer Controls tab.');
  }

  // Format rankings data as a compact pipe-separated table to minimize token usage
  const compactPayload = rankingsData.map(r => 
    `${r.fundName} | ISIN: ${r.isin} | NAV: ${r.latestNav} | Date: ${r.navAsOf} | 7D: ${r.return7d}% | 15D: ${r.return15d}% | 30D: ${r.return30d}% | Rank: ${r.overallRank}`
  ).join('\n');

  const systemPrompt = `You are a professional financial analyst specialized in Indian Mutual Funds.
Analyze the following mutual funds and compute comparative insights.
Important instructions:
- Provide observations and conclusions in detail.
- You must integrate both the return metrics (7D, 15D, 30D) from the input payload and the AMC Reference Metrics (AUM and Expense Ratio) listed below.
- Keep the tone highly professional, objective, and clear.
- Frame your response in markdown format with two clear sections: "Observations" (numbered list) and "Executive Summary" (bullet list of key callouts and final takeaways).

${REFERENCE_METRICS}`;

  const userPrompt = `Here is the current mutual fund performance rankings data (compact format):
${compactPayload}

Generate the observations list and executive summary matching the following structure:
Observations
1. Aditya Birla Sun Life Money Manager Fund delivered the highest 30-day rolling return (0.90%) among the combined shortlist, but it also carries the second-highest expense ratio (0.37%, rank 8) — the outperformance is coming at a real cost.
2. [Generate similar descriptive bullet points for other schemes referencing their NAV, returns, AUM, and Expense ratios...]

Executive Summary
Best Return: ...
Best Overall Balance: ...
Largest Fund by AUM: ...
Lowest Cost: ...
Weakest Overall: ...
Overall Insight: ...`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Groq API responded with status ${response.status}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || 'No summary generated.';
}

export async function fetchLocalConfig(): Promise<{ apiKey: string; summary: string }> {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Failed to fetch local configuration from backend middleware', e);
  }
  
  // Fallback to localStorage
  return {
    apiKey: localStorage.getItem('groq_api_key') || '',
    summary: localStorage.getItem('groq_latest_summary') || ''
  };
}

export async function saveLocalConfig(apiKey: string, summary: string): Promise<void> {
  localStorage.setItem('groq_api_key', apiKey);
  localStorage.setItem('groq_latest_summary', summary);

  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ apiKey, summary })
    });
  } catch (e) {
    console.error('Failed to write configuration to local JSON file via middleware', e);
  }
}
