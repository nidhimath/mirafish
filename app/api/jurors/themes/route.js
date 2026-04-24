import Anthropic from '@anthropic-ai/sdk';
import { buildThemesPrompt, THEMES_SYNTHESIS_TOOL } from '../../../../lib/prompts/themes-synthesis.js';

export const maxDuration = 60;

const MODEL = 'claude-opus-4-7';

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const { caseDoc, reactions, jurors } = await request.json();
  if (!reactions?.length) {
    return Response.json({ error: 'reactions array is required' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const { system, user } = buildThemesPrompt(caseDoc, reactions, jurors);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [THEMES_SYNTHESIS_TOOL],
    tool_choice: { type: 'tool', name: 'synthesize_jury_themes' },
    system,
    messages: [{ role: 'user', content: user }],
  });

  const toolUse = message.content.find((b) => b.type === 'tool_use');
  if (!toolUse) {
    return Response.json({ error: 'No synthesis returned' }, { status: 500 });
  }

  return Response.json({ themes: toolUse.input });
}
