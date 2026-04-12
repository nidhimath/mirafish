const MODEL = 'claude-sonnet-4-20250514';

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const { topic, transcript } = await request.json();

  const system = `You are a senior science journalist covering AI research. \
Analyze this debate transcript and write a 3-paragraph field report covering \
what positions emerged, who influenced whom, and what the unresolved crux is.`;

  const transcriptText = transcript
    .map((m) => `[Round ${m.round}] ${m.agentName} (${m.org}): ${m.statement}`)
    .join('\n\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [
        {
          role: 'user',
          content: `Debate topic: "${topic}"\n\nTranscript:\n${transcriptText}`,
        },
      ],
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
