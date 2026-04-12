# Researcher Simulation Endpoint — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an `author_papers` table and `/api/researcher` endpoint so any ingested author can be queried to simulate their thinking, grounded in their papers via RAG.

**Architecture:** New Supabase join table `author_papers` maps author names to paper IDs. Updated `match_paper_chunks` RPC accepts optional `filter_paper_ids` array. New Next.js API route looks up an author's papers, fetches relevant chunks via vector search, and calls Claude with the excerpts as context.

**Tech Stack:** Supabase (Postgres + pgvector), Voyage AI embeddings, Anthropic Claude API, Next.js App Router

---

### Task 1: Create `author_papers` table in Supabase

**Files:**
- Reference: `scripts/ingest.mjs` (to understand `papers` table shape)

**Step 1: Run SQL in Supabase dashboard**

Go to Supabase → SQL Editor and run:

```sql
CREATE TABLE author_papers (
  id SERIAL PRIMARY KEY,
  author_name TEXT NOT NULL,
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_author_papers_unique ON author_papers (author_name, paper_id);
CREATE INDEX idx_author_papers_author ON author_papers (author_name);
```

**Step 2: Verify table exists**

Run in SQL Editor:

```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'author_papers';
```

Expected: 3 rows — `id` (integer), `author_name` (text), `paper_id` (uuid)

---

### Task 2: Update `match_paper_chunks` RPC to accept `filter_paper_ids`

**Files:**
- Modify: Supabase SQL Editor (the existing `match_paper_chunks` function)

**Step 1: Check current RPC definition**

Run in SQL Editor:

```sql
SELECT prosrc FROM pg_proc WHERE proname = 'match_paper_chunks';
```

Note the current function body.

**Step 2: Replace the RPC with updated version**

Run in SQL Editor (use `CREATE OR REPLACE`). The key change is adding `filter_paper_ids UUID[] DEFAULT NULL` parameter and an additional WHERE clause:

```sql
CREATE OR REPLACE FUNCTION match_paper_chunks(
  query_embedding VECTOR(1024),
  match_threshold FLOAT,
  match_count INT,
  filter_authors TEXT[] DEFAULT NULL,
  filter_paper_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  paper_id UUID,
  chunk_index INT,
  content TEXT,
  title TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    pc.id,
    pc.paper_id,
    pc.chunk_index,
    pc.content,
    p.title,
    1 - (pc.embedding <=> query_embedding) AS similarity
  FROM paper_chunks pc
  JOIN papers p ON p.id = pc.paper_id
  WHERE 1 - (pc.embedding <=> query_embedding) > match_threshold
    AND (filter_authors IS NULL OR p.authors @> filter_authors)
    AND (filter_paper_ids IS NULL OR pc.paper_id = ANY(filter_paper_ids))
  ORDER BY pc.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

> **Note:** The return columns and existing `filter_authors` logic must match what's already there. Inspect the current function in Step 1 and adapt the above accordingly — the critical addition is the `filter_paper_ids` parameter and the `AND (filter_paper_ids IS NULL OR pc.paper_id = ANY(filter_paper_ids))` clause.

**Step 3: Verify the RPC works with the new parameter**

Run in SQL Editor:

```sql
SELECT * FROM match_paper_chunks(
  (SELECT embedding FROM paper_chunks LIMIT 1),
  0.3,
  5,
  NULL,
  NULL
);
```

Expected: Returns rows (same behavior as before when both filters are NULL).

---

### Task 3: Update `ingest.mjs` to populate `author_papers`

**Files:**
- Modify: `scripts/ingest.mjs:166-183` (after paper insert, before chunk insert)

**Step 1: Add `author_papers` insert after paper insert**

In `scripts/ingest.mjs`, after the paper insert block (line ~183), add:

```javascript
    // 5b. Insert author-paper mappings
    if (meta.authors && meta.authors.length > 0) {
      const authorRows = meta.authors.map((name) => ({
        author_name: name,
        paper_id: paper.id,
      }));

      const { error: authorErr } = await supabase
        .from('author_papers')
        .upsert(authorRows, { onConflict: 'author_name,paper_id' });

      if (authorErr) {
        console.error(`  ✗ Author-paper mapping failed: ${authorErr.message}`);
      } else {
        console.log(`  ✓ Mapped ${authorRows.length} author(s) to paper`);
      }
    }
```

**Step 2: Verify by re-ingesting**

Run: `node scripts/ingest.mjs`

Expected: See "Mapped 1 author(s) to paper" for the Bo Dai paper (will skip if paper already exists — you may need to delete and re-ingest, or manually insert the mapping for existing papers).

**Step 3: Commit**

```bash
git add scripts/ingest.mjs
git commit -m "feat: populate author_papers table during ingestion"
```

---

### Task 4: Create `/api/researcher` endpoint

**Files:**
- Create: `app/api/researcher/route.js`
- Reference: `app/api/agent/route.js` (similar pattern)
- Reference: `app/lib/supabase.js`, `app/lib/voyage.js`

**Step 1: Create the route file**

Create `app/api/researcher/route.js`:

```javascript
import { supabase } from '../../lib/supabase.js';
import { embedQuery } from '../../lib/voyage.js';

const MODEL = 'claude-sonnet-4-20250514';

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const { author, query } = await request.json();

  if (!author || !query) {
    return Response.json({ error: 'author and query are required' }, { status: 400 });
  }

  // 1. Look up paper IDs for this author
  const { data: authorPapers, error: lookupErr } = await supabase
    .from('author_papers')
    .select('paper_id')
    .eq('author_name', author);

  if (lookupErr) {
    return Response.json({ error: `Author lookup failed: ${lookupErr.message}` }, { status: 500 });
  }

  if (!authorPapers || authorPapers.length === 0) {
    return Response.json({ error: `No papers found for author: ${author}` }, { status: 404 });
  }

  const paperIds = authorPapers.map((row) => row.paper_id);

  // 2. Embed the query
  let embedding;
  try {
    embedding = await embedQuery(query);
  } catch (err) {
    return Response.json({ error: `Embedding failed: ${err.message}` }, { status: 500 });
  }

  // 3. Fetch relevant chunks from this author's papers
  const { data: chunks, error: ragErr } = await supabase.rpc('match_paper_chunks', {
    query_embedding: embedding,
    match_threshold: 0.3,
    match_count: 8,
    filter_paper_ids: paperIds,
  });

  if (ragErr) {
    return Response.json({ error: `RAG search failed: ${ragErr.message}` }, { status: 500 });
  }

  // 4. Build context from retrieved chunks
  const excerpts = (chunks || [])
    .map((c) => `[From "${c.title}"]: ${c.content}`)
    .join('\n\n');

  const ragContext = excerpts
    ? `\n\nRelevant excerpts from your published research:\n${excerpts}`
    : '';

  const system = `You are ${author}, a researcher. Respond to questions based on your published research. Be direct and intellectually honest. Ground your answers in your actual work.${ragContext}`;

  // 5. Call Claude
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

  // 6. Return response with sources
  const sources = (chunks || []).map((c) => ({
    title: c.title,
    excerpt: c.content.slice(0, 200),
  }));

  return Response.json({
    author,
    response: data.content[0].text,
    sources,
  });
}
```

**Step 2: Test with curl**

```bash
curl -X POST http://localhost:3000/api/researcher \
  -H 'Content-Type: application/json' \
  -d '{"author": "Bo Dai", "query": "What is your approach to policy optimization?"}'
```

Expected: JSON response with `author`, `response`, and `sources` fields.

**Step 3: Commit**

```bash
git add app/api/researcher/route.js
git commit -m "feat: add /api/researcher endpoint for author simulation"
```

---

### Task 5: Backfill `author_papers` for existing papers

**Step 1: Backfill via SQL**

For any papers already ingested before Task 3, run in Supabase SQL Editor:

```sql
INSERT INTO author_papers (author_name, paper_id)
SELECT UNNEST(authors), id FROM papers
ON CONFLICT (author_name, paper_id) DO NOTHING;
```

**Step 2: Verify**

```sql
SELECT * FROM author_papers;
```

Expected: One row per author-paper pair for all ingested papers.
