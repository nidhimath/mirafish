const OA_BASE = 'https://api.openalex.org';
const SLEEP_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDeepMindAuthors() {
  // OpenAlex supports institution-level filtering and server-side h_index sort
  const pages = [1, 2, 3];
  const candidates = [];

  for (const page of pages) {
    if (candidates.length >= 250) break;
    const url =
      `${OA_BASE}/authors` +
      `?filter=last_known_institution.display_name.search:deepmind` +
      `&sort=summary_stats.h_index:desc` +
      `&per-page=100&page=${page}` +
      `&select=id,display_name,last_known_institution,summary_stats,works_count`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'mirafish/1.0 (mailto:research@mirafish.ai)' },
    });
    if (!res.ok) throw new Error(`OpenAlex author fetch failed: HTTP ${res.status}`);
    const data = await res.json();
    const authors = data.results ?? [];
    if (authors.length === 0) break;
    candidates.push(...authors);
    await sleep(SLEEP_MS);
  }

  return candidates;
}

async function fetchAuthorWorks(openAlexId) {
  // Strip URL prefix to get bare ID, e.g. "A123"
  const id = openAlexId.replace('https://openalex.org/', '');
  const url =
    `${OA_BASE}/works` +
    `?filter=author.id:${id}` +
    `&sort=cited_by_count:desc` +
    `&per-page=50` +
    `&select=id,title,publication_year,cited_by_count,primary_location,authorships`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'mirafish/1.0 (mailto:research@mirafish.ai)' },
  });
  if (!res.ok) throw new Error(`OpenAlex works fetch failed for ${id}: HTTP ${res.status}`);
  const data = await res.json();
  return data.results ?? [];
}

export async function GET() {
  try {
    // ── Step 1: Collect up to 250 DeepMind-affiliated authors ──
    const candidates = await fetchDeepMindAuthors();
    console.log(`Collected ${candidates.length} DeepMind candidate authors`);

    // ── Step 2: Sort by h-index descending, take top 50 ──
    candidates.sort(
      (a, b) => (b.summary_stats?.h_index ?? 0) - (a.summary_stats?.h_index ?? 0)
    );
    const top50 = candidates.slice(0, 50);

    if (top50.length > 0) {
      const maxH = top50[0].summary_stats?.h_index ?? 0;
      const minH = top50[top50.length - 1].summary_stats?.h_index ?? 0;
      console.log(`Top 50 researchers: h-index range ${minH} to ${maxH}`);
    }

    // ── Step 3: Fetch papers for each of the top 50 ──
    const researchers = [];
    for (let i = 0; i < top50.length; i++) {
      const author = top50[i];
      const hIndex = author.summary_stats?.h_index ?? 0;
      console.log(`[${i + 1}/${top50.length}] ${author.display_name} (h=${hIndex})...`);

      let papers = [];
      try {
        const works = await fetchAuthorWorks(author.id);
        papers = works.map((w) => ({
          paperId: w.id,
          title: w.title,
          year: w.publication_year,
          citationCount: w.cited_by_count,
          venue: w.primary_location?.source?.display_name ?? null,
          authors: (w.authorships ?? []).map((a) => ({
            authorId: a.author?.id,
            name: a.author?.display_name,
          })),
        }));
      } catch (err) {
        console.error(`  Failed: ${err.message}`);
      }

      researchers.push({
        authorId: author.id,
        name: author.display_name,
        institution: author.last_known_institution?.display_name ?? null,
        paperCount: author.works_count ?? 0,
        hIndex,
        papers,
      });

      await sleep(SLEEP_MS);
    }

    return Response.json({ researchers });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
