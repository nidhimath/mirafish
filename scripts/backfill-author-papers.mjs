import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Fetch all papers with their authors
  const { data: papers, error } = await supabase
    .from('papers')
    .select('id, title, authors');

  if (error) {
    console.error('Failed to fetch papers:', error.message);
    process.exit(1);
  }

  console.log(`Found ${papers.length} papers`);

  let total = 0;

  for (const paper of papers) {
    if (!paper.authors || paper.authors.length === 0) {
      console.log(`  Skipping "${paper.title}" — no authors`);
      continue;
    }

    const rows = paper.authors.map((name) => ({
      author_name: name,
      paper_id: paper.id,
    }));

    const { error: upsertErr } = await supabase
      .from('author_papers')
      .upsert(rows, { onConflict: 'author_name,paper_id' });

    if (upsertErr) {
      console.error(`  ✗ Failed for "${paper.title}": ${upsertErr.message}`);
    } else {
      console.log(`  ✓ "${paper.title}" — ${rows.length} author(s)`);
      total += rows.length;
    }
  }

  console.log(`\n✓ Backfill complete: ${total} author-paper mappings`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
