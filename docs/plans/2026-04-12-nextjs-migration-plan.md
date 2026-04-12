# Next.js Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate ScholarMind from Vite + React to Next.js App Router with server-side API routes.

**Architecture:** Single `"use client"` page with all UI logic, two Route Handlers for Anthropic API calls, proper Tailwind CSS via PostCSS. API key stays in `.env` and is only accessed server-side.

**Tech Stack:** Next.js 15, React 18, Tailwind CSS 3, Recharts, PostCSS

---

### Task 1: Swap Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Remove Vite dependencies and add Next.js + Tailwind**

Run:
```bash
npm uninstall vite @vitejs/plugin-react
npm install next tailwindcss postcss autoprefixer
```

**Step 2: Update package.json scripts**

Replace the `scripts` section in `package.json` with:
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start"
}
```

**Step 3: Verify package.json is correct**

Run: `cat package.json`
Expected: no vite references, next/tailwindcss/postcss/autoprefixer in dependencies, scripts point to next

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: swap vite deps for next, tailwind, postcss"
```

---

### Task 2: Create Next.js and Tailwind Config Files

**Files:**
- Create: `next.config.js`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`

**Step 1: Create next.config.js**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

**Step 2: Create tailwind.config.js**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

**Step 3: Create postcss.config.js**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Step 4: Commit**

```bash
git add next.config.js tailwind.config.js postcss.config.js
git commit -m "chore: add next, tailwind, postcss config files"
```

---

### Task 3: Create App Layout and Global Styles

**Files:**
- Create: `app/globals.css`
- Create: `app/layout.jsx`

**Step 1: Create app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
```

**Step 2: Create app/layout.jsx**

```jsx
import './globals.css';

export const metadata = {
  title: 'ScholarMind',
  description: 'Multi-Agent AI Researcher Debate Simulator',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

**Step 3: Commit**

```bash
git add app/globals.css app/layout.jsx
git commit -m "feat: add root layout and tailwind globals"
```

---

### Task 4: Create Agent API Route

**Files:**
- Create: `app/api/agent/route.js`

**Step 1: Create the route handler**

```js
const MODEL = 'claude-sonnet-4-20250514';

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const { agent, topic, priorText } = await request.json();

  const system = `You are ${agent.name}, an AI researcher known for ${agent.contributions}. \
Your epistemic prior: ${agent.prior} \
Respond in 2-3 sentences max, direct and intellectually honest, grounded in your research background. \
You may update your position if another researcher makes a compelling argument. \
After your response output a JSON block wrapped in belief tags exactly like this: \
<belief>{"position":"one sentence","confidence":0.0,"moved":false,"cruxes":["crux 1","crux 2"]}</belief>`;

  const user = priorText
    ? `Debate topic: "${topic}"\n\nPrior statements:\n${priorText}\n\nRespond to the ongoing debate.`
    : `Debate topic: "${topic}"\n\nGive your opening position.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
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
```

Note: No `anthropic-dangerous-direct-browser-access` header needed — this runs server-side.

**Step 2: Commit**

```bash
git add app/api/agent/route.js
git commit -m "feat: add /api/agent route handler"
```

---

### Task 5: Create Synthesis API Route

**Files:**
- Create: `app/api/synthesis/route.js`

**Step 1: Create the route handler**

```js
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
```

**Step 2: Commit**

```bash
git add app/api/synthesis/route.js
git commit -m "feat: add /api/synthesis route handler"
```

---

### Task 6: Migrate App.jsx to app/page.jsx

**Files:**
- Create: `app/page.jsx`
- Source: `src/App.jsx` (reference only)

**Step 1: Create app/page.jsx**

Copy all of `src/App.jsx` into `app/page.jsx` with these changes:

1. Add `"use client";` as the first line
2. Remove `ApiKeyScreen` component entirely
3. Remove `apiKey` state and the `if (!apiKey)` gate
4. Replace `callAgent` function — instead of calling Anthropic directly, call our route:

```js
async function callAgent(agent, topic, priorText) {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, topic, priorText }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.text;
}
```

5. Replace `callSynthesis` function similarly:

```js
async function callSynthesis(topic, transcript) {
  const res = await fetch('/api/synthesis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, transcript }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.text;
}
```

6. Update all call sites to remove the `apiKey` argument:
   - `callAgent(apiKey, agent, topic, priorText)` → `callAgent(agent, topic, priorText)`
   - `callSynthesis(apiKey, topic, transcript)` → `callSynthesis(topic, transcript)`

7. Remove the `apiKey` dependency from `useCallback` deps arrays

8. Remove the "Change API Key" button from the header

**Step 2: Verify no references to apiKey remain**

Search `app/page.jsx` for `apiKey` — should find zero matches.

**Step 3: Commit**

```bash
git add app/page.jsx
git commit -m "feat: migrate App.jsx to Next.js client page with server-side API calls"
```

---

### Task 7: Fix .env Variable Name

**Files:**
- Modify: `.env`

**Step 1: Rename the env var**

Change `ANTHROPIC-API-KEY=...` to `ANTHROPIC_API_KEY=...` (hyphens to underscores). Next.js cannot read env vars with hyphens.

**Step 2: Do not commit** (.env is in .gitignore)

---

### Task 8: Remove Old Vite Files

**Files:**
- Delete: `vite.config.js`
- Delete: `src/main.jsx`
- Delete: `src/App.jsx`
- Delete: `index.html`

**Step 1: Remove the files**

```bash
rm vite.config.js index.html src/main.jsx src/App.jsx
rmdir src
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove vite config and old src/ files"
```

---

### Task 9: Update .gitignore for Next.js

**Files:**
- Modify: `.gitignore`

**Step 1: Update .gitignore**

Replace contents with:
```
.env
node_modules
.next
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: update gitignore for next.js"
```

---

### Task 10: Smoke Test

**Step 1: Install dependencies**

Run: `npm install`

**Step 2: Start dev server**

Run: `npm run dev`
Expected: Next.js dev server starts on http://localhost:3000

**Step 3: Verify the page loads**

Open http://localhost:3000 — should see the ScholarMind UI with topic selector, agent cards, and empty transcript area (no API key screen).

**Step 4: Verify API route works**

Run a quick curl test:
```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"agent":{"name":"Chris Olah","contributions":"mechanistic interpretability","prior":"We should not deploy systems we cannot understand."},"topic":"Will scaling alone produce general reasoning?","priorText":""}'
```
Expected: JSON response with `{ "text": "..." }`
