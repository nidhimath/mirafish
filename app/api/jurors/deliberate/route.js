import Anthropic from '@anthropic-ai/sdk';
import { buildDeliberationPrompt, DELIBERATION_TOOL } from '../../../../lib/prompts/deliberation.js';

export const maxDuration = 120;

const MODEL = 'claude-opus-4-7';

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const { caseDoc, reactions, jurors } = await request.json();
  if (!reactions?.length || !jurors?.length) {
    return Response.json({ error: 'reactions and jurors arrays are required' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const { system, user } = buildDeliberationPrompt(caseDoc, reactions, jurors);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    tools: [DELIBERATION_TOOL],
    tool_choice: { type: 'tool', name: 'simulate_deliberation' },
    system,
    messages: [{ role: 'user', content: user }],
  });

  const toolUse = message.content.find((b) => b.type === 'tool_use');
  if (!toolUse) {
    return Response.json({ error: 'No deliberation returned' }, { status: 500 });
  }

  return Response.json({ deliberation: toolUse.input });
}
