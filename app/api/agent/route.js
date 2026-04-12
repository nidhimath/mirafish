import { supabase } from '../../lib/supabase.js';
import { embedQuery } from '../../lib/voyage.js';

const MODEL = 'claude-sonnet-4-20250514';

async function fetchRAGContext(topic, agentName) {
  try {
    const embedding = await embedQuery(topic);
    const { data, error } = await supabase.rpc('match_paper_chunks', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: 0.5,
      match_count: 5,
      filter_authors: [agentName],
    });

    if (error || !data?.length) return '';

    const excerpts = data
      .map((c) => `[From "${c.title}"]: ${c.content}`)
      .join('\n\n');

    return `\n\nRelevant excerpts from your published research:\n${excerpts}`;
  } catch {
    // RAG is best-effort — if it fails, the agent still works with its base persona
    return '';
  }
}

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const { agent, topic, priorText } = await request.json();

  // Fetch RAG context from the researcher's own papers
  const ragContext = await fetchRAGContext(topic, agent.name);

  const system = `You are ${agent.name}, an AI researcher known for ${agent.contributions}. \
Your epistemic prior: ${agent.prior} \
Respond in 2-3 sentences max, direct and intellectually honest, grounded in your research background. \
You may update your position if another researcher makes a compelling argument. \
After your response output a JSON block wrapped in belief tags exactly like this: \
<belief>{"position":"one sentence","confidence":0.0,"moved":false,"cruxes":["crux 1","crux 2"]}</belief>${ragContext}`;

  const user = priorText
    ? `Debate topic: "${topic}"\n\nPrior statements:\n${priorText}\n\nRespond to the ongoing debate.`
    : `Debate topic: "${topic}"\n\nGive your opening position.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const e = await res.json();
      msg = e.error?.message || msg;
    } catch {}
    return Response.json({ error: msg }, { status: res.status });
  }

  const data = await res.json();
  return Response.json({ text: data.content[0].text });
}
