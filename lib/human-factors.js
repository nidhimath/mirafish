// Human-factors layer for the Judge agent.
//
// After the judge produces its purely-logical verdict, this module decides
// whether realistic human pressures (fatigue, conformity, anchoring, anxiety,
// etc.) cause the juror to deviate. It is deliberately separate from the LLM
// call so the math is auditable and reproducible.
//
// Adapted from the FDA Advisory Committee design to a legal-jury context:
//   patient_testimony  → emotional_appeal (a recent affect-laden moment)
//   fda_staff_position → judge_instruction (an external authority cue)
//   yes/no/abstain     → plaintiff/defendant/undecided
//
// All factor weights are tunable constants at the bottom of the file.

// ── Tunable constants ───────────────────────────────────────────────────────
export const TUNING = {
  BASE_DEVIATION: 0.1,           // baseline ~10% chance a human deviates from logic
  MIN_DEVIATION: 0.05,
  MAX_DEVIATION: 0.45,
  END_OF_MEETING_MULTIPLIER: 1.5,
  FATIGUE_PER_HOUR_OVER_5: 0.05,
  EMOTIONAL_APPEAL_BASE: 0.18,   // pulls toward plaintiff if recent + original=defendant
  EMOTIONAL_APPEAL_WINDOW_TURNS: 6,
  AUTHORITY_ANCHORING_BASE: 0.1,
  BANDWAGON_STRONG_THRESHOLD: 0.75,
  BANDWAGON_EXTREME_THRESHOLD: 0.9,
  BANDWAGON_STRONG_BASE: 0.2,
  BANDWAGON_EXTREME_BASE: 0.35,
  CAREER_RISK_BASE: 0.15,
  CAREER_RISK_MIN: 0.6,
  CONTRARIAN_PROBABILITY: 0.08,
  CONFIRMATION_BIAS_WEIGHT: -0.2,
  NEUROTICISM_SPIKE_WEIGHT: 0.25,
  NEUROTICISM_SPIKE_WINDOW_TURNS: 4,
  NEUROTICISM_THRESHOLD: 0.7,
  ATTENTION_DROP_TURNS_THRESHOLD: 12,
  END_OF_MEETING_TURN_RATIO: 0.85,
  END_OF_MEETING_PRESSURE_MIN: 0.6,
};

// ── Big-Five derivation from a juror profile ────────────────────────────────
// Our personas don't carry numeric Big-Five scores, but the prose fields
// (deliberative_role, cognitive_style, attitudes) carry enough signal to
// derive proxy scores in [0, 1]. Higher = more of that trait.
export function deriveBigFive(juror) {
  const blob = `
    ${juror.deliberative_role ?? ''}
    ${juror.cognitive_style?.reasoning ?? ''}
    ${juror.cognitive_style?.emotional_response ?? ''}
    ${juror.attitudes?.attitude_toward_lawsuits ?? ''}
    ${juror.attitudes?.trust_in_institutions ?? ''}
    ${juror.attitudes?.damages_philosophy ?? ''}
  `.toLowerCase();

  const has = (re) => re.test(blob);

  // Agreeableness — high for influencers, deferrers, harmony-seekers; low for holdouts.
  let A = 0.5;
  if (has(/holdout|digs in|hard to budge|stubborn|skeptical|blunt|hardened/)) A -= 0.25;
  if (has(/comes around|natural influencer|harmony|consensus|deferential|quiet/)) A += 0.2;
  if (has(/empathetic|fairness|kind/)) A += 0.1;

  // Conscientiousness — high for detail-oriented, rule-followers, evidence-driven.
  let C = 0.5;
  if (has(/detail|trained to notice|practical|evidence|notes|methodical|careful/)) C += 0.2;
  if (has(/blunt|simplifies|gut|impulsive/)) C -= 0.15;

  // Neuroticism — high for anxious, easily-swayed-by-fear; low for hardened/calm.
  let N = 0.4;
  if (has(/anxious|worried|fearful|easily upset|sensitive|tearful/)) N += 0.3;
  if (has(/hardened|controlled|calm|unflappable|level/)) N -= 0.2;
  if (has(/safety|caution|risk-averse/)) N += 0.1;

  // Openness — high for curious, abstract; low for "common-sense, practical" thinkers.
  let O = 0.5;
  if (has(/curious|abstract|theoretical|nuanced|reflective/)) O += 0.2;
  if (has(/common-sense|plain and simple|practical|blunt/)) O -= 0.2;

  // Extraversion — high for natural influencers, talkers; low for quiet/observers.
  let E = 0.5;
  if (has(/natural influencer|leader|talker|outgoing|coach|teacher/)) E += 0.2;
  if (has(/quiet|reserved|observer|introvert/)) E -= 0.2;

  const clamp = (v) => Math.max(0, Math.min(1, v));
  return { A: clamp(A), C: clamp(C), N: clamp(N), O: clamp(O), E: clamp(E) };
}

// ── Career-risk proxy ───────────────────────────────────────────────────────
// Original FDA model uses real career_risk; jurors don't have careers tied to
// the verdict, but their *attitude toward lawsuits* + trust in institutions
// produces an analogous "I don't want to look unreasonable to the judge / room"
// signal. Returns 0..1.
export function deriveCareerRisk(juror) {
  const blob = `${juror.attitudes?.attitude_toward_lawsuits ?? ''} ${juror.attitudes?.trust_in_institutions ?? ''}`.toLowerCase();
  let r = 0.4;
  if (/strongly skeptical|out of control|gaming/.test(blob)) r += 0.3;
  if (/follows rules|trusts authority|defers/.test(blob)) r += 0.2;
  if (/independent|contrarian|low trust/.test(blob)) r -= 0.15;
  return Math.max(0, Math.min(1, r));
}

// ── Individual factor functions ─────────────────────────────────────────────

export function fatigueEffect(meetingHour) {
  if (meetingHour <= 5) return null;
  const weight = TUNING.FATIGUE_PER_HOUR_OVER_5 * (meetingHour - 5);
  return {
    factor_name: 'FATIGUE_EFFECT',
    weight,
    direction: 'lowers_threshold',
    active_because: `Hour ${meetingHour} of meeting — decision fatigue increases conformity`,
  };
}

export function emotionalAppealSurge(turnsSinceAppeal, originalPosition) {
  if (turnsSinceAppeal == null || turnsSinceAppeal > TUNING.EMOTIONAL_APPEAL_WINDOW_TURNS) return null;
  // Only fires if original position was defendant — the appeal pulls *toward* plaintiff.
  if (originalPosition !== 'defendant') return null;
  const decay = 1.0 - turnsSinceAppeal / TUNING.EMOTIONAL_APPEAL_WINDOW_TURNS;
  return {
    factor_name: 'EMOTIONAL_APPEAL_SURGE',
    weight: TUNING.EMOTIONAL_APPEAL_BASE * decay,
    direction: '+toward_plaintiff',
    active_because: `Emotional moment in transcript ${turnsSinceAppeal} turn(s) ago, decay ${decay.toFixed(2)}`,
  };
}

export function authorityAnchoring(speakerOrder, agreeableness) {
  // speakerOrder: 1 = this juror was the first to speak (foreperson-like anchor for others).
  // The factor fires for anyone who is NOT the first speaker but is influenced by them.
  if (speakerOrder === 1) return null;
  return {
    factor_name: 'AUTHORITY_ANCHORING',
    weight: TUNING.AUTHORITY_ANCHORING_BASE * agreeableness,
    direction: '+toward_first_speaker_position',
    active_because: `First speaker (foreperson-like) anchored the room; agreeableness ${agreeableness.toFixed(2)} amplifies anchoring`,
  };
}

export function bandwagonThreshold(socialPressureAgainst, agreeableness) {
  if (socialPressureAgainst > TUNING.BANDWAGON_EXTREME_THRESHOLD) {
    return {
      factor_name: 'BANDWAGON_EXTREME',
      weight: TUNING.BANDWAGON_EXTREME_BASE * agreeableness,
      direction: '+toward_majority',
      active_because: `${(socialPressureAgainst * 100).toFixed(0)}% of group opposes member; conformity pressure is extreme`,
    };
  }
  if (socialPressureAgainst > TUNING.BANDWAGON_STRONG_THRESHOLD) {
    return {
      factor_name: 'BANDWAGON_STRONG',
      weight: TUNING.BANDWAGON_STRONG_BASE * agreeableness,
      direction: '+toward_majority',
      active_because: `${(socialPressureAgainst * 100).toFixed(0)}% of group opposes member; strong conformity pressure`,
    };
  }
  return null;
}

export function careerRiskDampening(careerRisk, conscientiousness, judgeInstructionPosition, originalPosition) {
  if (careerRisk < TUNING.CAREER_RISK_MIN || judgeInstructionPosition == null) return null;
  if (judgeInstructionPosition === originalPosition) return null;
  const resistance = conscientiousness;
  const weight = TUNING.CAREER_RISK_BASE * (1 - resistance);
  return {
    factor_name: 'CAREER_RISK_DAMPENING',
    weight,
    direction: `+toward_${judgeInstructionPosition}`,
    active_because: `External authority (judge's instruction) cuts against original position; career-risk ${careerRisk.toFixed(2)}, conscientiousness resistance ${(resistance * 100).toFixed(0)}%`,
  };
}

export function contrarianStreak(memberRecentVotes, majorityPosition) {
  if (!memberRecentVotes || memberRecentVotes.length < 3) return null;
  const last3 = memberRecentVotes.slice(-3);
  if (!last3.every((v) => v === majorityPosition)) return null;
  return {
    factor_name: 'CONTRARIAN_STREAK',
    weight: TUNING.CONTRARIAN_PROBABILITY,
    direction: '+toward_dissent',
    active_because: "Last 3 votes matched majority; 'I'm not a rubber stamp' reaction",
  };
}

export function confirmationBiasDrift(reasoningStyle, newEvidenceAddressesStyle) {
  if (newEvidenceAddressesStyle) return null;
  return {
    factor_name: 'CONFIRMATION_BIAS_DRIFT',
    weight: TUNING.CONFIRMATION_BIAS_WEIGHT,
    direction: 'raises_threshold',
    active_because: `Reasoning style "${reasoningStyle ?? 'unspecified'}" reinforces original position; new evidence does not address its core concern`,
  };
}

export function neuroticismSpike(turnsSinceSafetyConcern, neuroticism) {
  if (turnsSinceSafetyConcern == null) return null;
  if (turnsSinceSafetyConcern > TUNING.NEUROTICISM_SPIKE_WINDOW_TURNS) return null;
  if (neuroticism < TUNING.NEUROTICISM_THRESHOLD) return null;
  return {
    factor_name: 'NEUROTICISM_SPIKE',
    weight: TUNING.NEUROTICISM_SPIKE_WEIGHT,
    direction: '+toward_defendant',
    active_because: `Recent harm/risk discussion + high neuroticism (${neuroticism.toFixed(2)}) → anxiety-driven caution (status-quo / no-liability bias)`,
  };
}

export function endOfMeetingCascade(meetingHour, totalHours, socialPressureMax) {
  const ratio = totalHours > 0 ? meetingHour / totalHours : 0;
  if (ratio < TUNING.END_OF_MEETING_TURN_RATIO) return null;
  if (socialPressureMax < TUNING.END_OF_MEETING_PRESSURE_MIN) return null;
  return {
    factor_name: 'END_OF_MEETING_CASCADE',
    weight: 0,
    direction: 'multiplier_1.5x',
    active_because: `Late in deliberation (${(ratio * 100).toFixed(0)}% through) + ${(socialPressureMax * 100).toFixed(0)}% pressure — "let's just finish" effect`,
  };
}

export function attentionState(turnsSinceBreak) {
  if (turnsSinceBreak == null || turnsSinceBreak < TUNING.ATTENTION_DROP_TURNS_THRESHOLD) return null;
  const drop = Math.min(0.6, (turnsSinceBreak - TUNING.ATTENTION_DROP_TURNS_THRESHOLD) / 10);
  if (drop < 0.2) return null;
  return {
    factor_name: 'ATTENTION_DROP',
    weight: drop * 0.1,
    direction: 'reduces_processing',
    active_because: `${turnsSinceBreak} turns without a break; juror may not be fully processing arguments`,
  };
}

// ── Orchestrator ────────────────────────────────────────────────────────────
//
// applyHumanFactors({
//   logicalVerdict,            // "WARRANTED" | "UNWARRANTED"
//   juror,                     // persona object
//   originalPosition,          // 'plaintiff' | 'defendant' | 'undecided'
//   meetingState,              // see schema below
//   reasoningStyle,            // string (juror.cognitive_style.reasoning)
//   newEvidenceAddressesStyle, // bool — does the trigger argument address the juror's actual style?
//   seed,                      // float [0,1) for reproducible random draw
// })
//
// MeetingState fields:
//   meetingHour, totalHours,
//   turnsSinceEmotionalAppeal, turnsSinceSafetyConcern, turnsSinceBreak,
//   socialPressureAgainstMember, socialPressureMax,
//   speakerOrder, judgeInstructionPosition,
//   memberRecentVotes, majorityPosition
export function applyHumanFactors({
  logicalVerdict,
  juror,
  originalPosition,
  meetingState,
  newEvidenceAddressesStyle = true,
  seed,
}) {
  const big = deriveBigFive(juror);
  const careerRisk = deriveCareerRisk(juror);

  const factors = [
    fatigueEffect(meetingState.meetingHour),
    emotionalAppealSurge(meetingState.turnsSinceEmotionalAppeal, originalPosition),
    authorityAnchoring(meetingState.speakerOrder, big.A),
    bandwagonThreshold(meetingState.socialPressureAgainstMember ?? 0, big.A),
    careerRiskDampening(careerRisk, big.C, meetingState.judgeInstructionPosition, originalPosition),
    contrarianStreak(meetingState.memberRecentVotes, meetingState.majorityPosition),
    confirmationBiasDrift(juror.cognitive_style?.reasoning, newEvidenceAddressesStyle),
    neuroticismSpike(meetingState.turnsSinceSafetyConcern, big.N),
    endOfMeetingCascade(meetingState.meetingHour, meetingState.totalHours, meetingState.socialPressureMax ?? 0),
    attentionState(meetingState.turnsSinceBreak),
  ].filter((f) => f != null);

  const baseDeviation = TUNING.BASE_DEVIATION;
  const totalAdjustment = factors
    .filter((f) => f.direction !== 'multiplier_1.5x')
    .reduce((sum, f) => sum + f.weight, 0);

  let multiplier = 1.0;
  for (const f of factors) {
    if (f.direction === 'multiplier_1.5x') multiplier *= TUNING.END_OF_MEETING_MULTIPLIER;
  }

  let finalDeviation = (baseDeviation + totalAdjustment) * multiplier;
  finalDeviation = Math.max(TUNING.MIN_DEVIATION, Math.min(TUNING.MAX_DEVIATION, finalDeviation));

  const randomDraw = seed;
  const deviated = randomDraw < finalDeviation;

  const finalVerdict = deviated
    ? (logicalVerdict === 'WARRANTED' ? 'UNWARRANTED' : 'WARRANTED')
    : logicalVerdict;

  return {
    factors_applied: factors,
    big_five: big,
    career_risk: careerRisk,
    base_deviation: baseDeviation,
    final_deviation_probability: finalDeviation,
    random_draw: randomDraw,
    deviated_from_logic: deviated,
    deviation_explanation: deviated ? generateDeviationExplanation(factors) : null,
    logical_verdict: logicalVerdict,
    final_verdict: finalVerdict,
  };
}

// ── Deviation explanation ──────────────────────────────────────────────────
const DEVIATION_TEMPLATES = {
  EMOTIONAL_APPEAL_SURGE: 'Was visibly moved by an emotional moment in deliberation despite ongoing technical concerns',
  FATIGUE_EFFECT: 'Appeared to defer to the room as deliberation wore on',
  BANDWAGON_STRONG: 'Folded to group pressure rather than dissent alone',
  BANDWAGON_EXTREME: 'Could not maintain dissent against a near-unanimous room',
  AUTHORITY_ANCHORING: "Anchored on the foreperson's opening framing",
  CAREER_RISK_DAMPENING: "Hedged toward the judge's instruction language",
  CONTRARIAN_STREAK: 'Voted against the majority on principle after several aligned votes',
  NEUROTICISM_SPIKE: 'Recent harm/risk discussion triggered anxiety-driven caution',
  END_OF_MEETING_CASCADE: 'Joined the emerging consensus in the final stretch of deliberation',
  ATTENTION_DROP: 'Did not fully engage with the new argument',
  CONFIRMATION_BIAS_DRIFT: "New argument did not address the juror's core concern",
};

export function generateDeviationExplanation(factors) {
  if (!factors.length) return 'Unexplained deviation from logic';
  const top = factors.reduce((a, b) => (Math.abs(a.weight) >= Math.abs(b.weight) ? a : b));
  return DEVIATION_TEMPLATES[top.factor_name] ?? `Deviation driven by ${top.factor_name}`;
}

// ── MeetingState builder from a transcript ──────────────────────────────────
// Heuristic mapping from the deliberation transcript into the structured state
// the engine needs. This keeps the engine pure and testable.
export function buildMeetingState({ transcript, changeIndex, juror, jurors, originalLean }) {
  const turn = transcript[changeIndex];
  const total = transcript.length;

  // "Hour" proxy: 1..8 mapped from turn position. Turn 0 → hour 1, last → hour 8.
  const meetingHour = Math.max(1, Math.min(8, Math.ceil(((changeIndex + 1) / total) * 8)));

  // Look back for emotional / safety cues in the preceding window.
  const lookback = transcript.slice(Math.max(0, changeIndex - 8), changeIndex);
  const findTurnsAgo = (re) => {
    for (let i = lookback.length - 1; i >= 0; i--) {
      if (re.test(lookback[i].text ?? '')) return lookback.length - i;
    }
    return null;
  };

  const turnsSinceEmotionalAppeal = findTurnsAgo(
    /(crying|tears|heartbreak|family|kids|child|widow|suffer|grief|devastat|imagine if|heart-?wrenching|broke down|her son|his daughter)/i
  );
  const turnsSinceSafetyConcern = findTurnsAgo(
    /(safety|harm|injur|danger|risk|kill|died|death|liability|hurt|catastroph)/i
  );

  // Speaker order: how many of *this juror's* prior turns appeared before this one.
  const memberPriorTurns = transcript
    .slice(0, changeIndex)
    .filter((t) => t.speaker_id === turn.speaker_id).length;
  const speakerOrder = memberPriorTurns + 1;

  // Reconstruct each juror's running lean up to (not including) this turn.
  const runningLean = {};
  for (const j of jurors) runningLean[j.id] = originalLean[j.id] ?? 'undecided';
  for (let i = 0; i < changeIndex; i++) {
    const t = transcript[i];
    if (t.opinion_change?.to) runningLean[t.speaker_id] = t.opinion_change.to;
  }

  const myLean = runningLean[turn.speaker_id] ?? 'undecided';
  const counts = { plaintiff: 0, defendant: 0, undecided: 0 };
  let total_known = 0;
  for (const id of Object.keys(runningLean)) {
    counts[runningLean[id]] = (counts[runningLean[id]] ?? 0) + 1;
    total_known += 1;
  }

  // Pressure against this juror = fraction of room with a *different* (non-undecided) lean.
  const opposedCount = Object.entries(counts)
    .filter(([lean]) => lean !== myLean && lean !== 'undecided')
    .reduce((s, [, c]) => s + c, 0);
  const denom = Math.max(1, total_known - 1); // exclude self
  const socialPressureAgainstMember = opposedCount / denom;
  const socialPressureMax = Math.max(counts.plaintiff, counts.defendant) / Math.max(1, total_known);

  // Majority position (excluding undecided).
  const majorityPosition = counts.plaintiff > counts.defendant
    ? 'plaintiff'
    : counts.defendant > counts.plaintiff
      ? 'defendant'
      : 'tie';

  // Member's recent votes: their last 3 leans recorded across the transcript.
  const memberLeanHistory = [];
  let curr = originalLean[turn.speaker_id] ?? 'undecided';
  for (let i = 0; i < changeIndex; i++) {
    const t = transcript[i];
    if (t.speaker_id !== turn.speaker_id) continue;
    if (t.opinion_change?.to) {
      curr = t.opinion_change.to;
      memberLeanHistory.push(curr);
    } else {
      memberLeanHistory.push(curr);
    }
  }

  // turnsSinceBreak proxy: turns since last time *this juror* spoke.
  let turnsSinceBreak = null;
  for (let i = changeIndex - 1; i >= 0; i--) {
    if (transcript[i].speaker_id === turn.speaker_id) {
      turnsSinceBreak = changeIndex - i;
      break;
    }
  }
  if (turnsSinceBreak == null) turnsSinceBreak = changeIndex;

  return {
    meetingHour,
    totalHours: 8,
    turnsSinceEmotionalAppeal,
    turnsSinceSafetyConcern,
    turnsSinceBreak,
    socialPressureAgainstMember,
    socialPressureMax,
    speakerOrder,
    judgeInstructionPosition: null, // not modeled in our jury sim; reserved for future
    memberRecentVotes: memberLeanHistory.slice(-3),
    majorityPosition,
  };
}
