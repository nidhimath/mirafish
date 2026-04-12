import { writeFileSync } from 'fs';

const S2_BASE = 'https://api.semanticscholar.org/graph/v1';
const SLEEP_MS = 500;
const OUT_FILE = new URL('../deepmind_researchers.json', import.meta.url).pathname;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAuthorPage(offset) {
  const url =
    `${S2_BASE}/author/search` +
    `?query=Google+DeepMind` +
    `&fields=authorId,name,affiliations,paperCount,hIndex` +
    `&limit=100&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Author search failed: HTTP ${res.status}`);
  return res.json();
}

async function fetchAuthorPapers(authorId) {
  const url =
    `${S2_BASE}/author/${authorId}/papers` +
    `?fields=title,year,citationCount,venue,authors&limit=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Papers fetch failed for ${authorId}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  // ── Step 1: Collect up to 250 authors across 3 pages ──
  const candidates = [];
  for (const offset of [0, 100, 200]) {
    if (candidates.length >= 250) break;
    console.log(`Fetching author page at offset ${offset}...`);
    const data = await fetchAuthorPage(offset);
    const authors = data.data ?? [];
    if (authors.length === 0) break;
    candidates.push(...authors);
    console.log(`  Authors so far: ${candidates.length}`);
    await sleep(SLEEP_MS);
  }

  // ── Step 2: Sort by h-index descending, take top 50 ──
  candidates.sort((a, b) => (b.hIndex ?? 0) - (a.hIndex ?? 0));
  const top50 = candidates.slice(0, 50);
  const maxH = top50[0]?.hIndex ?? 0;
  const minH = top50[top50.length - 1]?.hIndex ?? 0;
  console.log(`\nTop 50 researchers: h-index range ${minH} to ${maxH}\n`);

  // ── Step 3: Fetch papers for each of the top 50 ──
  const researchers = [];
  for (let i = 0; i < top50.length; i++) {
    const author = top50[i];
    process.stdout.write(`[${i + 1}/${top50.length}] ${author.name} (h=${author.hIndex ?? 0})... `);

    let papers = [];
    try {
      const data = await fetchAuthorPapers(author.authorId);
      papers = data.data ?? [];
      console.log(`${papers.length} papers`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }

    researchers.push({
      authorId: author.authorId,
      name: author.name,
      affiliations: author.affiliations ?? [],
      paperCount: author.paperCount ?? 0,
      hIndex: author.hIndex ?? 0,
      papers,
    });

    await sleep(SLEEP_MS);
  }

  writeFileSync(OUT_FILE, JSON.stringify({ researchers }, null, 2));
  console.log(`\nSaved ${researchers.length} researchers → ${OUT_FILE}`);
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(1); });
