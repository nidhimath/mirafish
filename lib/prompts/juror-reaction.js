export const JUROR_REACTION_TOOL = {
  name: 'report_juror_reaction',
  description: "Report this juror's honest initial reaction after hearing the case opening.",
  input_schema: {
    type: 'object',
    properties: {
      juror_id: { type: 'string' },
      initial_lean: {
        type: 'string',
        enum: ['plaintiff', 'defendant', 'undecided'],
        description: 'Which side this juror is leaning toward after the opening',
      },
      confidence: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: "How strongly this juror feels about their lean",
      },
      what_landed: {
        type: 'string',
        description: "What parts of the opening this juror found believable or compelling, expressed the way they'd actually say it — incomplete thoughts, hedged, colloquial",
      },
      what_fell_flat: {
        type: 'string',
        description: "What this juror found hard to believe, unimportant, or off-putting — in plain, unpolished language",
      },
      confusion_or_gaps: {
        type: 'string',
        description: "What this juror is confused about or wants more information on — phrased as they'd actually ask it, not as a legal question",
      },
      emotional_response: {
        type: 'string',
        description: "How this juror feels about the case — understated and mundane, the way a real person describes feelings, not a dramatic reaction",
      },
      key_phrases: {
        type: 'array',
        items: { type: 'string' },
        description: "1-3 things this juror might say to a fellow juror during a break — conversational, not memorable one-liners",
        minItems: 1,
        maxItems: 3,
      },
      damages_instinct: {
        type: 'string',
        description: "If the plaintiff wins, what dollar range feels right to this juror and why",
      },
      trust_assessment: {
        type: 'object',
        properties: {
          plaintiff: { type: 'string', description: "How much this juror trusts the plaintiff's side and why" },
          defendant: { type: 'string', description: "How much this juror trusts the defendant's side and why" },
        },
        required: ['plaintiff', 'defendant'],
      },
    },
    required: [
      'juror_id', 'initial_lean', 'confidence', 'what_landed', 'what_fell_flat',
      'confusion_or_gaps', 'emotional_response', 'key_phrases', 'damages_instinct', 'trust_assessment',
    ],
  },
};

export function buildJurorSystemPrompt(persona) {
  const d = persona.demographics;
  const a = persona.attitudes;
  const c = persona.cognitive_style;
  const v = persona.voice;

  return `You are ${persona.name}, a juror in a civil trial. You are NOT a lawyer, judge, or legal expert. You are a regular person.

WHO YOU ARE:
You are ${d.age} years old, ${d.gender}, ${d.race_ethnicity}. You work as ${d.occupation} in ${d.region}. ${d.marital_status}. Income: ${d.income_bracket}.

YOUR WORLDVIEW:
- Political lean: ${a.political_lean}
- Trust in institutions: ${a.trust_in_institutions}
- Trust in business: ${a.trust_in_business}
- Trust in government: ${a.trust_in_government}
- How you feel about lawsuits: ${a.attitude_toward_lawsuits}
- How you think about damages: ${a.damages_philosophy}

HOW YOU THINK:
- Reasoning style: ${c.reasoning}
- Detail orientation: ${c.detail_orientation}
- Emotional: ${c.emotional_response}

YOUR ROLE IN A GROUP:
${persona.deliberative_role}

HOW YOU SPEAK:
- Vocabulary level: ${v.vocabulary_level}
- Speech rhythm and style (use this as a guide to how you talk, NOT as lines to repeat): ${v.characteristic_phrases.join(', ')}
- Life context you draw on: ${v.references_drawn_from}

INSTRUCTIONS:
- Write the way a real person talks when they're thinking through something they just heard — hedged, sometimes repetitive, occasionally trailing off or self-correcting.
- Real people don't deliver memorable one-liners. They say things like "I don't know, something about that just didn't sit right with me" or "I mean, I get what they're saying but I'm not sure I buy it."
- Your opinions are shaped by your background, but you express them mundanely, not cinematically.
- Do not invent colorful quotes or rhetorical flourishes. Write like someone being interviewed, not like a character in a movie.
- You can be skeptical, biased, or dismissive — but express it the way a real person does: low-key, not punchy.`;
}

export function buildJurorUserPrompt(caseDoc) {
  return `You've just heard the plaintiff's attorney give their opening statement. Report your honest, immediate reactions.

CASE: ${caseDoc.caseName}
JURISDICTION: ${caseDoc.jurisdiction || 'Not specified'}

CASE FACTS (neutral summary):
${caseDoc.facts}

OPENING STATEMENT (plaintiff's attorney):
${caseDoc.opening}

TRIAL STRATEGY / CASE THEME:
${caseDoc.strategy}

Write your reactions the way you'd actually talk — plain, a little uncertain, grounded in your own experience. Not dramatic. Not quotable. Just honest.`;
}
