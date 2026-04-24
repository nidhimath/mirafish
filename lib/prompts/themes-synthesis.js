export const THEMES_SYNTHESIS_TOOL = {
  name: 'synthesize_jury_themes',
  description: 'Synthesize cross-juror patterns into an attorney-facing briefing.',
  input_schema: {
    type: 'object',
    properties: {
      what_landed: {
        type: 'array',
        items: { type: 'string' },
        description: 'Top 3-5 themes from what resonated across jurors, each as a brief insight',
      },
      what_fell_flat: {
        type: 'array',
        items: { type: 'string' },
        description: 'Top 3-5 themes from what failed to land, each as a brief insight',
      },
      confusions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Top 3-5 recurring confusions or gaps jurors want addressed',
      },
      damages_distribution: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Overall pattern in how jurors are thinking about damages' },
          low_end: { type: 'string', description: 'What skeptical jurors are thinking' },
          high_end: { type: 'string', description: 'What sympathetic jurors are thinking' },
        },
        required: ['summary', 'low_end', 'high_end'],
      },
      attorney_briefing: {
        type: 'string',
        description: '2-3 sentences of direct advice for the attorney: what is working, what needs work, and what is most at risk',
      },
      watch_list: {
        type: 'array',
        items: { type: 'string' },
        description: '2-4 specific jurors to watch — holdout risks, persuadable swings, strong advocates — with one sentence on each',
      },
    },
    required: ['what_landed', 'what_fell_flat', 'confusions', 'damages_distribution', 'attorney_briefing', 'watch_list'],
  },
};

export function buildThemesPrompt(caseDoc, reactions, jurors) {
  const reactionsText = reactions.map((r, i) => {
    const juror = jurors.find((j) => j.id === r.juror_id);
    const name = juror?.name ?? r.juror_id;
    const occ = juror?.demographics?.occupation ?? '';
    return `--- ${name} (${occ}) | Lean: ${r.initial_lean} | Confidence: ${r.confidence} ---
What landed: ${r.what_landed}
What fell flat: ${r.what_fell_flat}
Confusion: ${r.confusion_or_gaps}
Emotional response: ${r.emotional_response}
Damages instinct: ${r.damages_instinct}
Key phrases: ${r.key_phrases?.join('; ')}`;
  }).join('\n\n');

  return {
    system: `You are a senior jury consultant analyzing mock juror reactions for a trial attorney.
Your job is to identify patterns across the panel that tell the attorney what is working, what is failing, and where the trial can be won or lost.
Be direct, specific, and actionable. The attorney is about to go to trial.`,
    user: `Case: ${caseDoc.caseName}
Jurisdiction: ${caseDoc.jurisdiction || 'Not specified'}

Here are reactions from ${reactions.length} mock jurors after hearing the opening statement:

${reactionsText}

Synthesize the patterns. Be specific — cite which jurors when relevant. Give the attorney something actionable.`,
  };
}
