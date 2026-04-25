import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  TUNING,
  fatigueEffect,
  emotionalAppealSurge,
  bandwagonThreshold,
  contrarianStreak,
  neuroticismSpike,
  endOfMeetingCascade,
  applyHumanFactors,
  generateDeviationExplanation,
  deriveBigFive,
  buildMeetingState,
} from '../lib/human-factors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jurors = JSON.parse(readFileSync(join(__dirname, 'fixtures/jurors.json'), 'utf8'));
const HOLDOUT = jurors.find((j) => j.id === 'juror_holdout');
const ANXIOUS = jurors.find((j) => j.id === 'juror_anxious');
const INFLUENCER = jurors.find((j) => j.id === 'juror_influencer');

// ── Individual factor tests ─────────────────────────────────────────────────

test('fatigue: does not fire at hour 3, fires at hour 6', () => {
  assert.equal(fatigueEffect(3), null);
  const f = fatigueEffect(6);
  assert.ok(f, 'should fire at hour 6');
  assert.equal(f.factor_name, 'FATIGUE_EFFECT');
  assert.equal(f.weight, TUNING.FATIGUE_PER_HOUR_OVER_5 * 1);
});

test('emotional appeal: only fires for defendant-leaning jurors', () => {
  assert.equal(emotionalAppealSurge(2, 'plaintiff'), null, 'plaintiff: skip');
  assert.equal(emotionalAppealSurge(2, 'undecided'), null, 'undecided: skip');
  const f = emotionalAppealSurge(2, 'defendant');
  assert.ok(f, 'defendant: fires');
  assert.equal(f.direction, '+toward_plaintiff');
});

test('emotional appeal: window respected', () => {
  assert.ok(emotionalAppealSurge(0, 'defendant'));
  assert.ok(emotionalAppealSurge(TUNING.EMOTIONAL_APPEAL_WINDOW_TURNS, 'defendant'));
  assert.equal(emotionalAppealSurge(TUNING.EMOTIONAL_APPEAL_WINDOW_TURNS + 1, 'defendant'), null);
  assert.equal(emotionalAppealSurge(null, 'defendant'), null);
});

test('bandwagon thresholds: 70% no fire, 80% STRONG, 95% EXTREME', () => {
  assert.equal(bandwagonThreshold(0.7, 0.5), null);
  const strong = bandwagonThreshold(0.8, 0.5);
  assert.ok(strong);
  assert.equal(strong.factor_name, 'BANDWAGON_STRONG');
  const extreme = bandwagonThreshold(0.95, 0.5);
  assert.ok(extreme);
  assert.equal(extreme.factor_name, 'BANDWAGON_EXTREME');
});

test('contrarian: only fires after 3 aligned votes', () => {
  assert.equal(contrarianStreak(['plaintiff', 'plaintiff'], 'plaintiff'), null);
  assert.equal(contrarianStreak(['plaintiff', 'defendant', 'plaintiff'], 'plaintiff'), null);
  const f = contrarianStreak(['plaintiff', 'plaintiff', 'plaintiff'], 'plaintiff');
  assert.ok(f);
});

test('neuroticism spike: requires recent safety cue + high N', () => {
  assert.equal(neuroticismSpike(null, 0.9), null);
  assert.equal(neuroticismSpike(2, 0.5), null, 'low N: no spike');
  assert.equal(neuroticismSpike(99, 0.9), null, 'too long ago');
  assert.ok(neuroticismSpike(2, 0.9));
});

test('end-of-meeting cascade: needs late hour AND high pressure', () => {
  assert.equal(endOfMeetingCascade(3, 8, 0.9), null, 'too early');
  assert.equal(endOfMeetingCascade(8, 8, 0.3), null, 'no pressure');
  assert.ok(endOfMeetingCascade(8, 8, 0.9));
});

// ── Big-Five derivation ─────────────────────────────────────────────────────

test('Big-Five: holdout is low-A, low-N; anxious is high-N; influencer is high-E', () => {
  const h = deriveBigFive(HOLDOUT);
  const a = deriveBigFive(ANXIOUS);
  const i = deriveBigFive(INFLUENCER);
  assert.ok(h.A < 0.5, `holdout A should be low, got ${h.A}`);
  assert.ok(h.N < 0.5, `holdout N should be low (hardened), got ${h.N}`);
  assert.ok(a.N > 0.6, `anxious N should be high, got ${a.N}`);
  assert.ok(i.E > 0.5, `influencer E should be high, got ${i.E}`);
});

// ── Orchestrator tests ──────────────────────────────────────────────────────

function baseState(overrides = {}) {
  return {
    meetingHour: 4,
    totalHours: 8,
    turnsSinceEmotionalAppeal: null,
    turnsSinceSafetyConcern: null,
    turnsSinceBreak: 3,
    socialPressureAgainstMember: 0.4,
    socialPressureMax: 0.5,
    speakerOrder: 2,
    judgeInstructionPosition: null,
    memberRecentVotes: ['undecided'],
    majorityPosition: 'plaintiff',
    ...overrides,
  };
}

test('deviation probability is clamped to [MIN, MAX]', () => {
  // Stack many positive factors to overshoot.
  const result = applyHumanFactors({
    logicalVerdict: 'WARRANTED',
    juror: ANXIOUS,
    originalPosition: 'defendant',
    meetingState: baseState({
      meetingHour: 8,
      turnsSinceEmotionalAppeal: 0,
      socialPressureAgainstMember: 0.95,
      socialPressureMax: 0.95,
      turnsSinceSafetyConcern: 1,
    }),
    seed: 0,
  });
  assert.ok(result.final_deviation_probability <= TUNING.MAX_DEVIATION + 1e-9);
  assert.ok(result.final_deviation_probability >= TUNING.MIN_DEVIATION - 1e-9);
});

test('deviation probability floor: even with no factors, never below MIN_DEVIATION', () => {
  const result = applyHumanFactors({
    logicalVerdict: 'WARRANTED',
    juror: HOLDOUT,
    originalPosition: 'defendant',
    meetingState: baseState(),
    newEvidenceAddressesStyle: true,
    seed: 0.99,
  });
  assert.ok(result.final_deviation_probability >= TUNING.MIN_DEVIATION - 1e-9);
});

test('seed determinism: same inputs + same seed → same verdict', () => {
  const args = {
    logicalVerdict: 'WARRANTED',
    juror: ANXIOUS,
    originalPosition: 'defendant',
    meetingState: baseState({ turnsSinceEmotionalAppeal: 1, meetingHour: 7 }),
    newEvidenceAddressesStyle: false,
    seed: 0.05,
  };
  const a = applyHumanFactors(args);
  const b = applyHumanFactors(args);
  assert.equal(a.final_verdict, b.final_verdict);
  assert.equal(a.deviated_from_logic, b.deviated_from_logic);
  assert.equal(a.final_deviation_probability, b.final_deviation_probability);
});

test('low seed (0.0) deviates; high seed (0.999) does not', () => {
  const state = baseState({ turnsSinceEmotionalAppeal: 1, meetingHour: 7 });
  const low = applyHumanFactors({
    logicalVerdict: 'WARRANTED',
    juror: ANXIOUS,
    originalPosition: 'defendant',
    meetingState: state,
    seed: 0.0,
  });
  const high = applyHumanFactors({
    logicalVerdict: 'WARRANTED',
    juror: ANXIOUS,
    originalPosition: 'defendant',
    meetingState: state,
    seed: 0.999,
  });
  assert.equal(low.deviated_from_logic, true);
  assert.equal(high.deviated_from_logic, false);
  assert.equal(low.final_verdict, 'UNWARRANTED');
  assert.equal(high.final_verdict, 'WARRANTED');
});

test('deviation explanation uses highest-weight factor', () => {
  const factors = [
    { factor_name: 'FATIGUE_EFFECT', weight: 0.05, direction: 'lowers_threshold', active_because: '' },
    { factor_name: 'BANDWAGON_EXTREME', weight: 0.3, direction: '+toward_majority', active_because: '' },
    { factor_name: 'AUTHORITY_ANCHORING', weight: 0.05, direction: '+toward_first_speaker_position', active_because: '' },
  ];
  const exp = generateDeviationExplanation(factors);
  assert.ok(exp.toLowerCase().includes('group') || exp.toLowerCase().includes('unanimous'));
});

test('deviation explanation: empty factors → fallback string', () => {
  assert.equal(generateDeviationExplanation([]), 'Unexplained deviation from logic');
});

// ── MeetingState builder ────────────────────────────────────────────────────

test('buildMeetingState: extracts emotional and safety cues from preceding turns', () => {
  const transcript = [
    { speaker_id: 'juror_influencer', speaker_name: 'Marcus', text: 'I think the kid was devastated, his family broke down on the stand' },
    { speaker_id: 'juror_anxious', speaker_name: 'Sarah', text: 'Yeah but we have to think about safety here, real harm was done' },
    { speaker_id: 'juror_holdout', speaker_name: 'Deborah', text: 'I just dont buy it', opinion_change: { from: 'defendant', to: 'plaintiff' } },
  ];
  const state = buildMeetingState({
    transcript,
    changeIndex: 2,
    juror: HOLDOUT,
    jurors,
    originalLean: { juror_holdout: 'defendant', juror_anxious: 'plaintiff', juror_influencer: 'plaintiff' },
  });
  assert.ok(state.turnsSinceEmotionalAppeal != null);
  assert.ok(state.turnsSinceSafetyConcern != null);
  assert.equal(state.majorityPosition, 'plaintiff');
  assert.ok(state.socialPressureAgainstMember > 0.5);
});

test('buildMeetingState: meetingHour scales 1..8 over the transcript length', () => {
  const mkTranscript = (n) =>
    Array.from({ length: n }, (_, i) => ({
      speaker_id: 'juror_holdout',
      speaker_name: 'Deborah',
      text: 'word',
    }));
  const t = mkTranscript(20);
  const first = buildMeetingState({ transcript: t, changeIndex: 0, juror: HOLDOUT, jurors, originalLean: {} });
  const last = buildMeetingState({ transcript: t, changeIndex: 19, juror: HOLDOUT, jurors, originalLean: {} });
  assert.equal(first.meetingHour, 1);
  assert.equal(last.meetingHour, 8);
});
