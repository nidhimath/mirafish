import { createClient } from '@supabase/supabase-js';
import { extractText } from 'unpdf';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const BUCKET = 'papers';
const CHUNK_SIZE = 500;   // target tokens per chunk (approx words)
const CHUNK_OVERLAP = 50; // overlap in words

if (!SUPABASE_URL || !SUPABASE_KEY || !VOYAGE_API_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// Text chunking
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeText(text) {
  // Remove null bytes and invalid Unicode escape sequences
  return text.replace(/\0/g, '').replace(/\\u[0-9a-fA-F]{0,3}(?![0-9a-fA-F])/g, '');
}

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end >= words.length) break;
    start += chunkSize - overlap;
  }

  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Voyage AI embeddings
// ─────────────────────────────────────────────────────────────────────────────

async function embedTexts(texts, inputType = 'document') {
  // Voyage API has a limit per request, batch in groups of 128
  const BATCH_SIZE = 128;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        input: batch,
        model: 'voyage-3',
        input_type: inputType,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Voyage API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    allEmbeddings.push(...data.data.map((d) => d.embedding));

    if (i + BATCH_SIZE < texts.length) {
      // Small delay between batches to avoid rate limits
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return allEmbeddings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ingestion
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // Load metadata
  const metaPath = join(__dirname, 'papers-meta.json');
  const papersMeta = JSON.parse(readFileSync(metaPath, 'utf-8'));

  if (papersMeta.length === 0) {
    console.log('No papers in papers-meta.json. Add entries and rerun.');
    return;
  }

  // List files in storage bucket
  const { data: files, error: listErr } = await supabase.storage.from(BUCKET).list();
  if (listErr) {
    console.error('Failed to list storage bucket:', listErr.message);
    process.exit(1);
  }

  const fileNames = new Set(files.map((f) => f.name));
  console.log(`Found ${fileNames.size} files in storage bucket "${BUCKET}"`);

  for (const meta of papersMeta) {
    if (!fileNames.has(meta.filename)) {
      console.warn(`⚠ Skipping "${meta.filename}" — not found in storage bucket`);
      continue;
    }

    console.log(`\n── Processing: ${meta.title}`);

    // 1. Download PDF
    const { data: fileData, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(meta.filename);

    if (dlErr) {
      console.error(`  ✗ Download failed: ${dlErr.message}`);
      continue;
    }

    // 2. Extract text
    const uint8 = new Uint8Array(await fileData.arrayBuffer());
    let text;
    try {
      const result = await extractText(uint8);
      text = sanitizeText(result.text.join('\n'));
    } catch (e) {
      console.error(`  ✗ PDF parse failed: ${e.message}`);
      continue;
    }

    if (!text || text.trim().length < 50) {
      console.warn(`  ⚠ Very little text extracted, skipping`);
      continue;
    }

    console.log(`  Extracted ${text.length} chars`);

    // 3. Chunk
    const chunks = chunkText(text);
    console.log(`  Split into ${chunks.length} chunks`);

    // 4. Embed
    console.log(`  Embedding ${chunks.length} chunks via Voyage AI...`);
    let embeddings;
    try {
      embeddings = await embedTexts(chunks);
    } catch (e) {
      console.error(`  ✗ Embedding failed: ${e.message}`);
      continue;
    }

    // 5. Insert paper metadata
    const { data: paper, error: insertErr } = await supabase
      .from('papers')
      .insert({
        title: meta.title,
        description: meta.description || null,
        authors: meta.authors,
        source_url: meta.source_url || null,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error(`  ✗ Paper insert failed: ${insertErr.message}`);
      continue;
    }

    console.log(`  Inserted paper: ${paper.id}`);

    // 6. Insert chunks + embeddings
    const chunkRows = chunks.map((content, i) => ({
      paper_id: paper.id,
      chunk_index: i,
      content,
      embedding: embeddings[i],
    }));

    // Insert in batches of 50 to avoid payload limits
    const INSERT_BATCH = 50;
    let inserted = 0;
    for (let i = 0; i < chunkRows.length; i += INSERT_BATCH) {
      const batch = chunkRows.slice(i, i + INSERT_BATCH);
      const { error: chunkErr } = await supabase.from('paper_chunks').insert(batch);
      if (chunkErr) {
        console.error(`  ✗ Chunk insert failed at batch ${i}: ${chunkErr.message}`);
        break;
      }
      inserted += batch.length;
    }

    console.log(`  ✓ Inserted ${inserted}/${chunks.length} chunks`);
  }

  console.log('\n✓ Ingestion complete');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
