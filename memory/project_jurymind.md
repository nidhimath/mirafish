---
name: Project: JuryMind
description: Next.js mock jury simulator for trial attorneys — replaced ScholarMind in the mirafish repo
type: project
---

Mirafish was pivoted from ScholarMind (DeepMind researcher debate simulator) to JuryMind (mock jury simulator for trial attorneys).

**What was built:**
- `/new` — attorney pastes case doc (case facts + opening statement + trial strategy), hits submit
- `/results/[id]` — vote split, 12 juror cards, click-to-expand detail drawer, synthesized themes panel
- `data/juror_personas.json` — 24 hand-crafted juror personas (edit without redeploy)
- `lib/parse-case.js` — markdown section parser
- `lib/prompts/` — juror-reaction.js and themes-synthesis.js with Claude tool use schemas
- `app/api/jurors/react/route.js` — samples 12 jurors, runs 12 parallel Opus calls with prompt caching
- `app/api/jurors/themes/route.js` — synthesizes cross-juror patterns into attorney briefing

**Key architecture decisions:**
- Results stored in localStorage keyed by UUID; no database
- Model: claude-opus-4-7
- Structured output via tool use (not JSON mode)
- Prompt caching: case context cached as shared prefix across 12 parallel calls
- Phase 1 only: 12 independent reactions (no deliberation yet)

**What's NOT built yet (phase 2+):**
- Deliberation (jurors talking to each other)
- Venue-aware juror sampling
- PDF upload
- Persistent sessions
- Side-by-side opening comparison
