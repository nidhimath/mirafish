// Verbose demo of the human-factors pipeline.
// Simulates a logical verdict (no LLM call) and shows which factors fire.
//
//   node tests/demo-pipeline.js

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyHumanFactors, buildMeetingState, deriveBigFive } from '../lib/human-factors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jurors = JSON.parse(readFileSync(join(__dirname, 'fixtures/jurors.json'), 'utf8'));

// Synthetic deliberation transcript with one opinion change near the end.
const transcript = [
  { speaker_id: 'juror_influencer', speaker_name: 'Marcus', text: 'I think the plaintiff has a real case here. The injury was serious.' },
  { speaker_id: 'juror_holdout', speaker_name: 'Deborah', text: "I'm not so sure. People sue over everything these days. Plain and simple." },
  { speaker_id: 'juror_anxious', speaker_name: 'Sarah', text: 'But if there was real harm and it was preventable, doesn\'t that matter?' },
  { speaker_id: 'juror_influencer', speaker_name: 'Marcus', text: 'The expert was pretty clear about the safety failure. People got hurt.' },
  { speaker_id: 'juror_anxious', speaker_name: 'Sarah', text: 'And honestly, the way that family broke down on the stand — that stuck with me.' },
  { speaker_id: 'juror_holdout', speaker_name: 'Deborah', text: 'Look, half the room is leaning plaintiff already. I get it.' },
  { speaker_id: 'juror_holdout', speaker_name: 'Deborah', text: "Okay, fine. I'll go with plaintiff. There was real harm.",
    opinion_change: { from: 'defendant', to: 'plaintiff' } },
];

const originalLean = {
  juror_influencer: 'plaintiff',
  juror_anxious: 'plaintiff',
  juror_holdout: 'defendant',
};

const changeIndex = transcript.findIndex((t) => t.opinion_change);
const turn = transcript[changeIndex];
const juror = jurors.find((j) => j.id === turn.speaker_id);

console.log('═══════════════════════════════════════════════════════════');
console.log('  HUMAN-FACTORS PIPELINE DEMO');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Juror: ${juror.name} (${juror.deliberative_role})`);
console.log(`Opinion change: ${turn.opinion_change.from} → ${turn.opinion_change.to}`);
console.log(`Quote: "${turn.text}"\n`);

const big = deriveBigFive(juror);
console.log('Derived Big-Five:');
console.log(`  A=${big.A.toFixed(2)}  C=${big.C.toFixed(2)}  N=${big.N.toFixed(2)}  O=${big.O.toFixed(2)}  E=${big.E.toFixed(2)}\n`);

const meetingState = buildMeetingState({ transcript, changeIndex, juror, jurors, originalLean });
console.log('MeetingState:');
console.log('  meetingHour            =', meetingState.meetingHour, '/', meetingState.totalHours);
console.log('  turnsSinceEmotional    =', meetingState.turnsSinceEmotionalAppeal);
console.log('  turnsSinceSafety       =', meetingState.turnsSinceSafetyConcern);
console.log('  turnsSinceBreak        =', meetingState.turnsSinceBreak);
console.log('  speakerOrder           =', meetingState.speakerOrder);
console.log('  pressureAgainstMember  =', meetingState.socialPressureAgainstMember.toFixed(2));
console.log('  pressureMax            =', meetingState.socialPressureMax.toFixed(2));
console.log('  majority               =', meetingState.majorityPosition);
console.log('  recentVotes            =', JSON.stringify(meetingState.memberRecentVotes), '\n');

// Simulate two scenarios: the LLM said WARRANTED, and the seed lands low → flip.
for (const seed of [0.05, 0.5, 0.95]) {
  const result = applyHumanFactors({
    logicalVerdict: 'WARRANTED',
    juror,
    originalPosition: turn.opinion_change.from,
    meetingState,
    newEvidenceAddressesStyle: false, // pretend the trigger argument doesn't address her practical-skeptic style
    seed,
  });
  console.log(`── seed=${seed.toFixed(2)} ────────────────────────────────`);
  console.log(`  Factors fired (${result.factors_applied.length}):`);
  for (const f of result.factors_applied) {
    console.log(`    [${f.factor_name}] w=${f.weight.toFixed(3)} dir=${f.direction}`);
    console.log(`        ${f.active_because}`);
  }
  console.log(`  base=${result.base_deviation}  P(deviate)=${result.final_deviation_probability.toFixed(3)}  roll=${result.random_draw.toFixed(3)}`);
  console.log(`  logical=${result.logical_verdict}  →  final=${result.final_verdict}  ${result.deviated_from_logic ? '(FLIPPED)' : '(held)'}`);
  if (result.deviation_explanation) console.log(`  Explanation: "${result.deviation_explanation}"`);
  console.log('');
}
