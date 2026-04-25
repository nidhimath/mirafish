import Anthropic from '@anthropic-ai/sdk';
import {
  JUDGE_TOOL,
  JUDGE_SYSTEM_PROMPT,
  buildJudgeUserPrompt,
  deriveStubbornness,
  buildDeviationRationaleSystem,
  buildDeviationRationaleUser,
} from '../../../../lib/prompts/judge.js';
import { applyHumanFactors, buildMeetingState } from '../../../../lib/human-factors.js';

export const maxDuration = 120;

const MODEL = 'claude-opus-4-7';

async function evaluateChange(client, args) {
  const userPrompt = buildJudgeUserPrompt(args);
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    tools: [JUDGE_TOOL],
    tool_choice: { type: 'tool', name: 'evaluate_opinion_change' },
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const toolUse = message.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error('Judge returned no tool use');
  return toolUse.input;
}

async function regenerateRationale(client, args) {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: buildDeviationRationaleSystem(),
    messages: [{ role: 'user', content: buildDeviationRationaleUser(args) }],
  });
  const text = message.content.find((b) => b.type === 'text');
  return text?.text?.trim() ?? null;
}

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const { transcript, jurors, reactions } = await request.json();
  if (!Array.isArray(transcript) || !Array.isArray(jurors) || !Array.isArray(reactions)) {
    return Response.json(
      { error: 'transcript, jurors, and reactions arrays are required' },
      { status: 400 }
    );
  }

  const changeIndices = transcript
    .map((t, i) => (t.opinion_change ? i : -1))
    .filter((i) => i >= 0);

  if (changeIndices.length === 0) {
    return Response.json({ verdicts: [] });
  }

  const client = new Anthropic({ apiKey });

  const norm = (s) => (s ?? '').toString().trim().toLowerCase();
  function resolveJuror(turn) {
    const sid = norm(turn.speaker_id);
    const sname = norm(turn.speaker_name);
    return (
      jurors.find((j) => norm(j.id) === sid) ||
      jurors.find((j) => norm(j.name) === sid) ||
      jurors.find((j) => norm(j.name) === sname) ||
      jurors.find((j) => norm(j.id) === sname) ||
      jurors.find((j) => sname && norm(j.name).startsWith(sname)) ||
      jurors.find((j) => sid && norm(j.name).startsWith(sid))
    );
  }

  // Pre-build originalLean lookup once for the meeting-state builder.
  const originalLean = Object.fromEntries(
    reactions.map((r) => [r.juror_id, r.initial_lean ?? 'undecided'])
  );

  const evaluations = await Promise.all(
    changeIndices.map(async (changeIndex) => {
      const turn = transcript[changeIndex];
      const juror = resolveJuror(turn);
      const reaction = juror ? reactions.find((r) => r.juror_id === juror.id) : null;

      if (!juror) {
        return {
          turn_index: changeIndex,
          speaker_id: turn.speaker_id,
          speaker_name: turn.speaker_name,
          error: `Could not match transcript speaker (id="${turn.speaker_id}", name="${turn.speaker_name}") to any juror`,
        };
      }

      const stubbornness = deriveStubbornness(juror);
      const randomnessSeed = Math.random();

      try {
        // 1. Run the existing logical judge.
        const logical = await evaluateChange(client, {
          juror,
          reaction,
          transcript,
          changeIndex,
          stubbornness,
          randomnessSeed,
        });

        // 2. Build the meeting state from the transcript.
        const meetingState = buildMeetingState({
          transcript,
          changeIndex,
          juror,
          jurors,
          originalLean,
        });

        // 3. Decide whether human factors flip the verdict.
        const factorSeed = Math.random();
        const newEvidenceAddressesStyle = logical.reasoning_quality_score >= 3;
        const factorResult = applyHumanFactors({
          logicalVerdict: logical.verdict,
          juror,
          originalPosition: turn.opinion_change?.from ?? originalLean[juror.id],
          meetingState,
          newEvidenceAddressesStyle,
          seed: factorSeed,
        });

        // 4. If deviated, regenerate a publicly-defensible rationale.
        let regeneratedRationale = null;
        if (factorResult.deviated_from_logic) {
          try {
            regeneratedRationale = await regenerateRationale(client, {
              juror,
              logicalPosition: logical.verdict,
              finalPosition: factorResult.final_verdict,
              deviationFactor: factorResult.deviation_explanation,
              originalQuote: turn.text,
            });
          } catch {
            regeneratedRationale = null;
          }
        }

        return {
          turn_index: changeIndex,
          speaker_id: turn.speaker_id,
          speaker_name: turn.speaker_name,
          stubbornness_input: stubbornness,
          randomness_seed: randomnessSeed,
          // Logical judge fields:
          ...logical,
          logical_verdict: logical.verdict,
          // Final verdict (logical OR flipped by human factors):
          verdict: factorResult.final_verdict,
          // Human-factors layer:
          human_factors: {
            big_five: factorResult.big_five,
            career_risk: factorResult.career_risk,
            base_deviation: factorResult.base_deviation,
            final_deviation_probability: factorResult.final_deviation_probability,
            random_draw: factorResult.random_draw,
            deviated_from_logic: factorResult.deviated_from_logic,
            deviation_explanation: factorResult.deviation_explanation,
            factors_applied: factorResult.factors_applied,
            meeting_state: meetingState,
          },
          regenerated_rationale: regeneratedRationale,
        };
      } catch (err) {
        return {
          turn_index: changeIndex,
          speaker_id: turn.speaker_id,
          speaker_name: turn.speaker_name,
          error: err.message,
        };
      }
    })
  );

  return Response.json({ verdicts: evaluations });
}
