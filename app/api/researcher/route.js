import { supabase } from '../../lib/supabase.js';
import { embedQuery } from '../../lib/voyage.js';

const MODEL = 'claude-sonnet-4-20250514';

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const { author, query } = await request.json();

  // 1. Validate inputs
  if (!author || !query) {
    return Response.json(
      { error: 'Both "author" and "query" are required' },
      { status: 400 }
    );
  }

  // 2. Look up paper IDs from author_papers table
  const { data: authorPapers, error: lookupError } = await supabase
    .from('author_papers')
    .select('paper_id')
    .eq('author_name', author);

  if (lookupError) {
    return Response.json(
      { error: `Author lookup failed: ${lookupError.message}` },
      { status: 500 }
    );
  }

  if (!authorPapers || authorPapers.length === 0) {
    return Response.json(
      { error: `No papers found for author: ${author}` },
      { status: 404 }
    );
  }

  const paperIds = authorPapers.map((row) => row.paper_id);

  // 3. Embed the query via Voyage AI
  let embedding;
  try {
    embedding = await embedQuery(query);
  } catch (err) {
    return Response.json(
      { error: `Embedding failed: ${err.message}` },
      { status: 500 }
    );
  }

  // 4. Call match_paper_chunks RPC with paper ID filter
  const { data: chunks, error: rpcError } = await supabase.rpc('match_paper_chunks', {
    query_embedding: embedding,
    match_threshold: 0.3,
    match_count: 8,
    filter_authors: null,
    filter_paper_ids: paperIds,
  });

  if (rpcError) {
    return Response.json(
      { error: `Supabase RPC failed: ${rpcError.message}` },
      { status: 500 }
    );
  }

  // 5. Build system prompt with RAG excerpts
  let ragContext = '';
  if (chunks && chunks.length > 0) {
    const excerpts = chunks
      .map((c) => `[From "${c.title}"]: ${c.content}`)
      .join('\n\n');
    ragContext = `\n\nRelevant excerpts from your published research:\n${excerpts}`;
  }

  const system = `You are ${author}, a researcher. Respond to questions based on your published research. Be direct and intellectually honest. Ground your answers in your actual work.${ragContext}`;

  // 6. Call Claude via Anthropic API
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
      messages: [{ role: 'user', content: query }],
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

  // 7. Build sources array
  const sources = (chunks || []).map((c) => ({
    title: c.title,
    excerpt: c.content.slice(0, 200),
  }));

  return Response.json({
    author,
    response: data.content?.[0]?.text ?? '',
    sources,
  });
}
