const MODEL = 'claude-sonnet-4-20250514';

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const { agent, topic, priorText } = await request.json();

  const system = `You are ${agent.name}, an AI researcher known for ${agent.contributions}. \
Your epistemic prior: ${agent.prior} \
Respond in 2-3 sentences max, direct and intellectually honest, grounded in your research background. \
You may update your position if another researcher makes a compelling argument. \
After your response output a JSON block wrapped in belief tags exactly like this: \
<belief>{"position":"one sentence","confidence":0.0,"moved":false,"cruxes":["crux 1","crux 2"]}</belief>`;

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
