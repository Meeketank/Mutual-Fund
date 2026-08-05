import { PinnedFund } from '../types/mf';

export async function generateGroqSummary(apiKey: string, rankingsData: any[]): Promise<string> {
  if (!apiKey) {
    throw new Error('Groq API Key is not configured. Please add it in the Developer Controls tab.');
  }

  // Format rankings data as a compact pipe-separated table to minimize token usage
  const compactPayload = rankingsData.map(r => 
    `${r.fundName} | ISIN: ${r.isin} | NAV: ${r.latestNav} | Date: ${r.navAsOf} | 7D: ${r.return7d}% | 15D: ${r.return15d}% | 30D: ${r.return30d}% | Rank: ${r.overallRank}`
  ).join('\n');

  const systemPrompt = `You are a professional financial analyst specialized in Indian Mutual Funds.
Analyze the provided mutual funds and compute comparative insights based on their performance.
Important instructions:
- Provide observations and conclusions in detail.
- You must analyze the return metrics (7D, 15D, 30D) from the input payload.
- Keep the tone highly professional, objective, and clear.
- Frame your response in markdown format with two clear sections: "Observations" (numbered list) and "Executive Summary" (bullet list of key callouts and final takeaways).`;

  const userPrompt = `Here is the current mutual fund performance rankings data (compact format):
${compactPayload}

Generate the observations list and executive summary matching the following structure:
Observations
1. [Analyze first scheme and its performance metrics...]
2. [Analyze next scheme...]

Executive Summary
Best Return: ...
Best Short-term Return (7D): ...
Best Mid-term Return (15D): ...
Best Long-term Return (30D): ...
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

export async function fetchLocalConfig(savePath: string): Promise<{ apiKey: string; summary: string; pinnedSchemes: number[] }> {
  if (savePath) {
    try {
      const res = await fetch(`/api/config?path=${encodeURIComponent(savePath)}`);
      if (res.ok) {
        const data = await res.json();
        return {
          apiKey: data.apiKey || '',
          summary: data.summary || '',
          pinnedSchemes: Array.isArray(data.pinnedSchemes) ? data.pinnedSchemes : []
        };
      }
    } catch (e) {
      console.warn('Failed to fetch local configuration from backend middleware', e);
    }
  }

  // Fallback to localStorage
  try {
    const storedPinned = localStorage.getItem('amfi_pinned_scheme_codes_v1');
    return {
      apiKey: localStorage.getItem('groq_api_key') || '',
      summary: localStorage.getItem('groq_latest_summary') || '',
      pinnedSchemes: storedPinned ? JSON.parse(storedPinned) : []
    };
  } catch (e) {
    return {
      apiKey: localStorage.getItem('groq_api_key') || '',
      summary: localStorage.getItem('groq_latest_summary') || '',
      pinnedSchemes: []
    };
  }
}

export async function saveLocalConfig(
  apiKey: string,
  summary: string,
  pinnedSchemes: number[],
  savePath: string
): Promise<boolean> {
  // Sync to localStorage as fallback
  localStorage.setItem('groq_api_key', apiKey);
  localStorage.setItem('groq_latest_summary', summary);
  localStorage.setItem('amfi_pinned_scheme_codes_v1', JSON.stringify(pinnedSchemes));

  if (!savePath) {
    return false; // Indicates path not set, did not write to server path
  }

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ apiKey, summary, pinnedSchemes, path: savePath })
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to write configuration to local JSON file via middleware', e);
    return false;
  }
}

