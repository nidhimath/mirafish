# JuryMind

A mock jury simulator for trial attorneys. Paste your case document and get parallel reactions from 12 simulated jurors, each reading your opening through their own demographic lens and personal worldview.

## What it does

1. **Paste a case document** on `/new` — case facts, your opening statement, and trial strategy
2. **12 jurors are sampled** from a pool of 24 hand-crafted personas covering a realistic cross-section of age, occupation, race, education, and political lean
3. **Each juror reacts independently** via a parallel Claude API call — what landed, what fell flat, their emotional response, damages instinct, and which side they're leaning toward
4. **Results page** shows a vote split, individual juror cards (click any to expand), and an optional AI-synthesized themes panel that identifies cross-juror patterns and gives direct attorney guidance

## Getting started

```bash
npm install
```

Add your Anthropic API key to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/new`.

## Document format

Paste a plain-text document into the textarea using this structure:

```
Case: [Case name]
Jurisdiction
[City, State]

Case Facts
[Neutral summary, 200–500 words]

Opening Statement
[The attorney's opening, 300–1000 words]

Trial Strategy
[Case theme and strategic approach, 100–300 words]
```

A sample case (Henderson v. Crestview Chemical) is pre-loaded — click **Load sample case** to try it.

## Project structure

```
data/
  juror_personas.json       24 hand-crafted juror personas — edit without redeploying

lib/
  parse-case.js             Parses the markdown case document into structured fields
  prompts/
    juror-reaction.js       Juror system prompt builder + tool schema
    themes-synthesis.js     Themes synthesis prompt + tool schema

app/
  new/page.jsx              Case input form
  results/[id]/page.jsx     Results view: vote summary, juror grid, themes panel
  api/jurors/
    react/route.js          POST: samples 12 jurors, runs parallel Claude calls
    themes/route.js         POST: synthesizes cross-juror patterns
```

## Editing personas

`data/juror_personas.json` contains 24 personas. Edit freely — no redeployment needed (the API route reads the file at request time). Each persona has `demographics`, `attitudes`, `cognitive_style`, `deliberative_role`, and `voice` fields that drive how Claude responds in character.

## Known limitations and what's next

**Current MVP limitations:**
- Results live in browser `localStorage` only — they don't survive a browser clear and can't be shared via URL
- Jurors are sampled randomly — no venue-aware sampling (e.g., rural Georgia vs. Manhattan jury pools behave differently)
- Phase 1 only: 12 independent reactions, no deliberation (jurors talking to each other)
- Plain text paste only — no PDF upload
- 12 parallel Claude Opus calls take ~20–40 seconds depending on API load
- No session history — each submission is ephemeral

**Phase 2 — deliberation:**
- Run multiple rounds where jurors read each other's positions and update their lean
- Model social dynamics: who influences whom, who digs in, who flips
- Show belief drift over rounds (the conviction chart from ScholarMind translates directly here)

**Phase 3 — venue sampling:**
- Weight persona selection by jurisdiction demographics
- Allow attorneys to define the venue profile and see how it shifts the panel composition

**Other near-term improvements:**
- Persistent sessions (database or file-based)
- PDF upload via the `unpdf` package already in dependencies
- Side-by-side comparison: same case, two different openings
- Export to PDF for client presentations
