import { supabase } from '../../lib/supabase.js';
import { embedQuery } from '../../lib/voyage.js';

export async function POST(request) {
  const { query, authors } = await request.json();

  if (!query) {
    return Response.json({ error: 'query is required' }, { status: 400 });
  }

  // 1. Embed the query
  let embedding;
  try {
    embedding = await embedQuery(query);
  } catch (err) {
    return Response.json({ error: `Embedding failed: ${err.message}` }, { status: 500 });
  }

  // 2. Call the match function
  const { data, error } = await supabase.rpc('match_paper_chunks', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: 0.5,
    match_count: 8,
    filter_authors: authors || null,
  });

  if (error) {
    return Response.json({ error: `Supabase RPC failed: ${error.message}` }, { status: 500 });
  }

  return Response.json({ chunks: data });
}
