export const DELIBERATION_TOOL = {
  name: 'simulate_deliberation',
  description: 'Simulate the jury deliberation room conversation, showing how jurors interact and influence each other.',
  input_schema: {
    type: 'object',
    properties: {
      transcript: {
        type: 'array',
        description: 'Ordered list of juror turns in the deliberation room',
        items: {
          type: 'object',
          properties: {
            speaker_id: { type: 'string', description: 'Juror ID' },
            speaker_name: { type: 'string', description: 'Juror first name' },
            text: {
              type: 'string',
              description: 'What this juror said — plain, conversational, the way a real person talks in a group setting. Not polished or quotable.',
            },
            opinion_change: {
              type: 'object',
              nullable: true,
              description: 'Only include if this turn marks a shift in lean. Null otherwise.',
              properties: {
                from: { type: 'string', enum: ['plaintiff', 'defendant', 'undecided'] },
                to: { type: 'string', enum: ['plaintiff', 'defendant', 'undecided'] },
              },
              required: ['from', 'to'],
            },
          },
          required: ['speaker_id', 'speaker_name', 'text'],
        },
        minItems: 18,
        maxItems: 35,
      },
      final_positions: {
        type: 'array',
        description: 'Each juror\'s final lean after deliberation completes',
        items: {
          type: 'object',
          properties: {
            juror_id: { type: 'string' },
            final_lean: { type: 'string', enum: ['plaintiff', 'defendant', 'undecided'] },
            changed: { type: 'boolean', description: 'Whether this juror changed from their initial lean' },
          },
          required: ['juror_id', 'final_lean', 'changed'],
        },
      },
      final_vote: {
        type: 'object',
        properties: {
          plaintiff: { type: 'number' },
          defendant: { type: 'number' },
          undecided: { type: 'number' },
        },
        required: ['plaintiff', 'defendant', 'undecided'],
      },
      deliberation_summary: {
        type: 'string',
        description: '2-3 sentences describing what shifted the room and who drove the outcome',
      },
    },
    required: ['transcript', 'final_positions', 'final_vote', 'deliberation_summary'],
  },
};

export function buildDeliberationPrompt(caseDoc, reactions, jurors) {
  const jurorProfiles = jurors.map((j) => {
    const r = reactions.find((rx) => rx.juror_id === j.id);
    const lean = r?.initial_lean ?? 'undecided';
    const confidence = r?.confidence ?? 'low';
    return `${j.name} (${j.demographics?.occupation}, ${j.demographics?.age}yo ${j.demographics?.gender}) — initial lean: ${lean} / ${confidence} confidence
  Deliberative role: ${j.deliberative_role}
  What landed for them: ${r?.what_landed ?? 'N/A'}
  What fell flat: ${r?.what_fell_flat ?? 'N/A'}
  Key phrases they used: ${r?.key_phrases?.join('; ') ?? 'N/A'}`;
  }).join('\n\n');

  const system = `You are simulating the closed-door deliberation of a mock jury for attorney trial preparation.
You know each juror's background, personality, and initial reaction to the case. Your job is to write a realistic transcript of how they talk to each other — who speaks up, who pushes back, who stays quiet, who changes their mind and why.

RULES:
- Write exactly like real people talk in a group: interruptions, hedging, circling back, changing the subject, agreeing to disagree.
- Jurors reference specific things they heard in the opening. They don't use legal terms correctly. They compare the case to their own experiences.
- Opinion changes must feel earned — someone says something that actually lands, not just because it's time for the story to move.
- Include moments of conflict, not just harmony. Include jurors who dig in and don't fully budge.
- The foreperson (whoever the group informally accepts) should call for votes and try to move things along.
- Don't make every turn a speech. Short replies, agreements, and pushbacks are realistic.`;

  const user = `Case: ${caseDoc.caseName}
Jurisdiction: ${caseDoc.jurisdiction || 'Not specified'}

Case Facts:
${caseDoc.facts}

Opening Statement (plaintiff's attorney):
${caseDoc.opening}

--- JUROR PROFILES AND INITIAL REACTIONS ---

${jurorProfiles}

---

Now simulate the deliberation. The jurors have just entered the jury room. Write the transcript of their full discussion, including the final vote. Show who shifts and why.`;

  return { system, user };
}
