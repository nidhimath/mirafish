# ScholarMind: Vite React → Next.js App Router Migration

## Summary

Migrate ScholarMind from a Vite + React SPA to Next.js App Router. Move Anthropic API calls server-side via Route Handlers, set up proper Tailwind CSS, and remove the client-side API key input.

## Decisions

- **App Router** (not Pages Router)
- **Server-side API calls** — API key read from `.env` (`ANTHROPIC_API_KEY`), no client-side key entry
- **Single client file** — all UI stays in `app/page.jsx` with `"use client"`
- **Proper Tailwind** — PostCSS + config, no CDN

## File Structure

```
app/
├── layout.jsx              # Root layout (html, body, Tailwind globals)
├── globals.css             # @tailwind directives + body style
├── page.jsx                # "use client" — all current App.jsx UI logic
├── api/
│   ├── agent/route.js      # POST: calls Anthropic for agent responses
│   └── synthesis/route.js  # POST: calls Anthropic for synthesis
tailwind.config.js
postcss.config.js
next.config.js
package.json
.env                        # ANTHROPIC_API_KEY
```

## API Routes

### POST /api/agent
- **Request body:** `{ agent, topic, priorText }`
- **Server:** reads `ANTHROPIC_API_KEY` from env, calls Anthropic Messages API
- **Response:** `{ text: "..." }` or `{ error: "..." }` with status code

### POST /api/synthesis
- **Request body:** `{ topic, transcript }`
- **Server:** reads `ANTHROPIC_API_KEY` from env, calls Anthropic Messages API
- **Response:** `{ text: "..." }` or `{ error: "..." }` with status code

## Client Changes (page.jsx)

- Add `"use client"` directive
- Remove `ApiKeyScreen` component and `apiKey` state
- Replace direct Anthropic `fetch()` calls with `fetch('/api/agent', ...)` and `fetch('/api/synthesis', ...)`
- All other state, components, and UI remain identical

## Tailwind Setup

- `tailwind.config.js`: content scans `./app/**/*.{js,jsx}`
- `postcss.config.js`: tailwindcss + autoprefixer
- `globals.css`: `@tailwind base/components/utilities` + body reset
- Remove CDN `<script>` tag from HTML

## Removed Files

- `vite.config.js`
- `src/main.jsx`
- `index.html`
- `@vitejs/plugin-react` and `vite` dependencies
