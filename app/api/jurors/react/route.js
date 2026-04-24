import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildJurorSystemPrompt, buildJurorUserPrompt, JUROR_REACTION_TOOL } from '../../../../lib/prompts/juror-reaction.js';

export const maxDuration = 120;

const MODEL = 'claude-opus-4-7';

let _personas = null;
function loadPersonas() {
  if (!_personas) {
    _personas = JSON.parse(readFileSync(join(process.cwd(), 'data', 'juror_personas.json'), 'utf8'));
  }
  return _personas;
}

function sampleJurors(personas, n = 12) {
  const shuffled = [...personas].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function getJurorReaction(client, persona, caseDoc, caseCacheKey) {
  const systemPrompt = buildJurorSystemPrompt(persona);
  const userPrompt = buildJurorUserPrompt(caseDoc);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [JUROR_REACTION_TOOL],
    tool_choice: { type: 'tool', name: 'report_juror_reaction' },
    system: [
      {
        type: 'text',
        text: `You are participating in a mock jury simulation for attorney trial preparation. The case details below are the same for all jurors.\n\nCASE CONTEXT:\n${caseCacheKey}`,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: systemPrompt,
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolUse = message.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error(`No tool use response for juror ${persona.id}`);

  return { ...toolUse.input, juror_id: persona.id };
}

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const { caseDoc } = await request.json();
  if (!caseDoc?.facts || !caseDoc?.opening) {
    return Response.json({ error: 'caseDoc must include facts and opening' }, { status: 400 });
  }

  const personas = loadPersonas();
  const sampled = sampleJurors(personas);
  const client = new Anthropic({ apiKey });

  // Build a stable string for the cache prefix — same for all 12 calls
  const caseCacheKey = `Case: ${caseDoc.caseName}\nJurisdiction: ${caseDoc.jurisdiction || 'Not specified'}\n\nCase Facts:\n${caseDoc.facts}\n\nOpening Statement:\n${caseDoc.opening}\n\nTrial Strategy:\n${caseDoc.strategy}`;

  const reactionPromises = sampled.map((persona) =>
    getJurorReaction(client, persona, caseDoc, caseCacheKey).catch((err) => ({
      juror_id: persona.id,
      error: err.message,
      initial_lean: 'undecided',
      confidence: 'low',
      what_landed: '',
      what_fell_flat: '',
      confusion_or_gaps: '',
      emotional_response: '',
      key_phrases: [],
      damages_instinct: '',
      trust_assessment: { plaintiff: '', defendant: '' },
    }))
  );

  const reactions = await Promise.all(reactionPromises);

  return Response.json({ reactions, jurors: sampled });
}
