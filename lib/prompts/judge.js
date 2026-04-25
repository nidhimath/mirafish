export const JUDGE_TOOL = {
  name: 'evaluate_opinion_change',
  description: 'Return a structured evaluation of whether a juror\'s opinion change is genuinely warranted.',
  input_schema: {
    type: 'object',
    properties: {
      evaluation: {
        type: 'string',
        description:
          '2-4 sentences explaining the reasoning. Write this BEFORE committing to a score — do not work backwards from a desired verdict.',
      },
      reasoning_quality_score: {
        type: 'integer',
        minimum: 1,
        maximum: 4,
        description:
          '1=Capitulation (sycophantic, mirrors others, no engagement). 2=Weak shift (some engagement, shallow). 3=Substantive shift (acknowledges what changed and why prior reasoning is now insufficient). 4=Compelling shift (new info directly invalidates a key premise).',
      },
      bias_flags: {
        type: 'array',
        description: 'Empty list if none. Any flag forces reasoning_quality_score to 1.',
        items: {
          type: 'string',
          enum: [
            'AGREEABILITY_BIAS',
            'MIRROR_BIAS',
            'AUTHORITY_BIAS',
            'STYLE_INCONSISTENCY',
          ],
        },
      },
      stubbornness_threshold: {
        type: 'number',
        description: 'S × 3.0',
      },
      randomness_adjustment: {
        type: 'number',
        description: '(R - 0.5) × 0.6',
      },
      adjusted_threshold: {
        type: 'number',
        description: 'stubbornness_threshold + randomness_adjustment',
      },
      verdict: {
        type: 'string',
        enum: ['WARRANTED', 'UNWARRANTED'],
      },
      recommended_action: {
        type: 'string',
        enum: ['ALLOW_CHANGE', 'RETAIN_POSITION', 'REDUCE_CONFIDENCE'],
      },
      feedback_to_member: {
        type: 'string',
        description:
          'One short sentence to the juror about what would actually justify a position change, if anything.',
      },
    },
    required: [
      'evaluation',
      'reasoning_quality_score',
      'bias_flags',
      'stubbornness_threshold',
      'randomness_adjustment',
      'adjusted_threshold',
      'verdict',
      'recommended_action',
      'feedback_to_member',
    ],
  },
};

const JUDGE_SYSTEM = `You are the JUDGE AGENT in a multi-agent mock-jury deliberation simulation. Your role is NOT to participate in the deliberation. Your role is to evaluate whether a juror agent's proposed opinion change is GENUINELY WARRANTED by the reasoning presented, or whether it reflects sycophantic agreement, mirror bias, authority bias, or unjustified capitulation.

═══════════════════════════════════════════════════════════════
EVALUATION FRAMEWORK
═══════════════════════════════════════════════════════════════

Step 1 — REASONING_QUALITY_SCORE (1-4 integer):
  1 = Capitulation. New rationale shows no genuine engagement with new evidence. Mirrors another juror's wording, defers without substance, or abandons prior reasoning without explanation. Sycophantic agreement.
  2 = Weak shift. Some engagement but reasoning is shallow or doesn't directly address the original concern.
  3 = Substantive shift. Reasoning addresses the original concern. Juror explicitly acknowledges what changed and why prior reasoning is now insufficient.
  4 = Compelling shift. New information directly invalidates a key premise of the original position. Reasoning is specific and consistent with the juror's reasoning style.

Step 2 — STUBBORNNESS_THRESHOLD:
  threshold = S × 3.0
  S=0.8 → 2.4 (needs reasoning ≥ 2.4)
  S=0.3 → 0.9 (low bar)
  S=1.0 → 3.0 (only score-4 reasoning works)

Step 3 — RANDOMNESS_INJECTION:
  adjusted_threshold = threshold + (R - 0.5) × 0.6
  Shifts the bar by ±0.3 points to simulate that even the same person, on a different day, may evaluate slightly differently. Do NOT skip this step.

Step 4 — VERDICT:
  IF reasoning_quality_score >= adjusted_threshold → "WARRANTED"
  ELSE → "UNWARRANTED"

═══════════════════════════════════════════════════════════════
BIAS CHECKS (apply BEFORE step 4 — any flag forces score = 1)
═══════════════════════════════════════════════════════════════

  ☐ AGREEABILITY_BIAS: New rationale uses phrases like "I see your point", "you're right", "good point" without specific engagement.
  ☐ MIRROR_BIAS: New rationale paraphrases another juror's argument without adding the juror's own perspective.
  ☐ AUTHORITY_BIAS: Juror changed primarily because a high-status / dominant speaker said it, without engaging the substance.
  ☐ STYLE_INCONSISTENCY: New rationale conflicts with the juror's documented reasoning style or attitudes (e.g., a "potential holdout — strongly skeptical of lawsuits" suddenly accepting an emotional appeal without explanation).

═══════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════

- Write the "evaluation" field FIRST and use it to think through the decision before assigning the score. Do not work backwards from a desired verdict.
- Be skeptical. Real deliberations contain plenty of unjustified shifts; do not rubber-stamp every change.
- Use the juror's profile (deliberative_role, attitudes, cognitive_style) to judge whether the shift is in character.
- Use the triggering arguments (the transcript turns leading up to the change) to judge whether the rationale is substantive or just mirrors what was said.`;

function buildContextWindow(transcript, changeIndex, windowSize = 6) {
  const start = Math.max(0, changeIndex - windowSize);
  const turns = transcript.slice(start, changeIndex + 1);
  return turns
    .map((t, i) => {
      const isTarget = start + i === changeIndex;
      const tag = isTarget ? ' ← OPINION CHANGE TURN' : '';
      return `[${start + i}] ${t.speaker_name}: ${t.text}${tag}`;
    })
    .join('\n');
}

export function buildJudgeUserPrompt({
  juror,
  reaction,
  transcript,
  changeIndex,
  stubbornness,
  randomnessSeed,
}) {
  const turn = transcript[changeIndex];
  const change = turn.opinion_change;
  const contextWindow = buildContextWindow(transcript, changeIndex);

  const profile = `Name: ${juror.name}
Demographics: ${juror.demographics?.age}yo ${juror.demographics?.gender}, ${juror.demographics?.occupation}, ${juror.demographics?.region}
Political lean: ${juror.attitudes?.political_lean}
Attitude toward lawsuits: ${juror.attitudes?.attitude_toward_lawsuits}
Damages philosophy: ${juror.attitudes?.damages_philosophy}
Reasoning style: ${juror.cognitive_style?.reasoning}
Emotional response: ${juror.cognitive_style?.emotional_response}
Deliberative role: ${juror.deliberative_role}
Characteristic phrases: ${juror.voice?.characteristic_phrases?.join(' | ')}`;

  const original = `Initial lean: ${reaction?.initial_lean ?? 'undecided'} (${reaction?.confidence ?? 'low'} confidence)
What landed for them initially: ${reaction?.what_landed ?? 'N/A'}
What fell flat initially: ${reaction?.what_fell_flat ?? 'N/A'}
Damages instinct: ${reaction?.damages_instinct ?? 'N/A'}`;

  const proposed = `New lean: ${change.to} (changed from ${change.from})
What they said in the moment of change:
"${turn.text}"`;

  return `JUROR_PROFILE:
${profile}

ORIGINAL_POSITION:
${original}

PROPOSED_NEW_POSITION:
${proposed}

TRIGGERING TRANSCRIPT (preceding turns leading up to the change):
${contextWindow}

STUBBORNNESS_SCORE (S): ${stubbornness.toFixed(2)}
RANDOMNESS_SEED (R): ${randomnessSeed.toFixed(2)}

Now evaluate this opinion change using the framework. Remember to write "evaluation" FIRST, apply bias checks BEFORE the verdict, and compute the adjusted_threshold using the supplied randomness seed.`;
}

export const JUDGE_SYSTEM_PROMPT = JUDGE_SYSTEM;

// ── Deviation rationale prompt ──────────────────────────────────────────────
// When the human-factors layer flips a logical verdict, we ask the model to
// write a publicly-defensible rationale that doesn't admit to the underlying
// human factor (jurors don't say "I gave in to the room"). The rationale must
// sound technically grounded.

export function buildDeviationRationaleSystem() {
  return `You write the official-record rationales that committee members would actually give. You never admit to social pressure, fatigue, anchoring, or anxiety as the reason for a vote — you reframe in technically defensible language ("balance of considerations", "weighing the unmet need", "given the totality of evidence", "the standard of proof", etc.).

Rules:
- 2-3 sentences max.
- Sound technically grounded; the rationale should be plausible to a reader who doesn't know the underlying human factor.
- Stay in character for the juror: vocabulary level, characteristic phrasing, attitudes.
- Never reference the human factor by name. Never say "I was tired" or "the room was against me".
- Output ONLY the rationale text — no preamble, no quotes.`;
}

export function buildDeviationRationaleUser({ juror, logicalPosition, finalPosition, deviationFactor, originalQuote }) {
  return `JUROR: ${juror.name}, ${juror.demographics?.occupation}
VOICE: vocabulary level ${juror.voice?.vocabulary_level ?? 'middle'}; characteristic phrases: ${juror.voice?.characteristic_phrases?.slice(0, 3).join(' | ') ?? 'N/A'}
DELIBERATIVE ROLE: ${juror.deliberative_role ?? 'N/A'}

LOGICAL POSITION (what reasoning alone would have produced): ${logicalPosition}
ACTUAL VOTE (after the human factor): ${finalPosition}
HIDDEN HUMAN FACTOR (do NOT mention this in the rationale): ${deviationFactor}

What the juror said in the moment of the change (for tone reference):
"${originalQuote}"

Write the 2-3 sentence rationale this juror would give for the official record.`;
}

// Heuristic: derive a stubbornness score (0-1) from a juror's deliberative_role text.
// Higher = harder to budge.
export function deriveStubbornness(juror) {
  const text = `${juror.deliberative_role ?? ''} ${juror.cognitive_style?.reasoning ?? ''} ${juror.attitudes?.attitude_toward_lawsuits ?? ''}`.toLowerCase();

  let s = 0.5;
  if (/holdout|digs in|hard to budge|hard to move|stubborn|won't budge|dig in/.test(text)) s += 0.35;
  if (/strongly skeptical|hardened|blunt|firm/.test(text)) s += 0.1;
  if (/comes around|persuadable|open|flexible|sways|shifts easily|easily influenced/.test(text)) s -= 0.2;
  if (/follows|deferential|quiet|goes with the room/.test(text)) s -= 0.15;
  if (/natural influencer|leader|foreperson/.test(text)) s += 0.05;
  return Math.max(0.05, Math.min(0.95, s));
}
