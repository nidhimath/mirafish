'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

// ── Helpers ──────────────────────────────────────────────────────────────────

const LEAN_STYLES = {
  plaintiff: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Plaintiff' },
  defendant: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', label: 'Defendant' },
  undecided: { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-400', label: 'Undecided' },
};

const CONFIDENCE_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };
const CONFIDENCE_BAR = { low: 'w-1/3', medium: 'w-2/3', high: 'w-full' };

function formatDemographics(d) {
  if (!d) return '';
  return `${d.age}, ${d.gender} · ${d.occupation}`;
}

// ── Juror Card ────────────────────────────────────────────────────────────────

function JurorCard({ juror, reaction, onClick }) {
  const lean = reaction?.initial_lean ?? 'undecided';
  const style = LEAN_STYLES[lean] ?? LEAN_STYLES.undecided;
  const hasError = !!reaction?.error;

  return (
    <button
      onClick={onClick}
      className={`text-left w-full bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-all duration-150 hover:-translate-y-0.5 ${
        hasError ? 'border-red-200 opacity-60' : `border-slate-200 hover:border-slate-300`
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-semibold text-slate-800 text-sm">{juror.name}</p>
          <p className="text-xs text-slate-400 mt-0.5 leading-tight">{formatDemographics(juror.demographics)}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${style.bg} ${style.text} ${style.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </div>

      {hasError ? (
        <p className="text-xs text-red-400 italic">Reaction unavailable</p>
      ) : (
        <>
          <div className="mb-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">Confidence</span>
              <span className="text-xs text-slate-500">{CONFIDENCE_LABEL[reaction?.confidence]}</span>
            </div>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${style.dot} ${CONFIDENCE_BAR[reaction?.confidence] ?? 'w-1/3'} transition-all`} />
            </div>
          </div>

          {reaction?.key_phrases?.[0] && (
            <p className="text-xs text-slate-600 italic leading-relaxed line-clamp-2">
              "{reaction.key_phrases[0]}"
            </p>
          )}
        </>
      )}
    </button>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ juror, reaction, onClose }) {
  if (!juror || !reaction) return null;
  const lean = reaction.initial_lean ?? 'undecided';
  const style = LEAN_STYLES[lean] ?? LEAN_STYLES.undecided;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="font-bold text-slate-800">{juror.name}</h3>
            <p className="text-xs text-slate-400">{juror.demographics?.occupation} · {juror.demographics?.region}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full border ${style.bg} ${style.text} ${style.border}`}>
              <span className={`w-2 h-2 rounded-full ${style.dot}`} />
              {style.label}
            </span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Demographics + attitudes */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              ['Age', juror.demographics?.age],
              ['Gender', juror.demographics?.gender],
              ['Race / ethnicity', juror.demographics?.race_ethnicity],
              ['Education', juror.demographics?.education],
              ['Income', juror.demographics?.income_bracket],
              ['Politics', juror.attitudes?.political_lean],
            ].map(([label, val]) => val && (
              <div key={label}>
                <p className="text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-slate-700 font-medium capitalize">{val}</p>
              </div>
            ))}
          </div>

          <hr className="border-slate-100" />

          {/* Key phrases */}
          {reaction.key_phrases?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">How they'd describe this case</p>
              <div className="flex flex-wrap gap-2">
                {reaction.key_phrases.map((phrase, i) => (
                  <span key={i} className="bg-slate-50 border border-slate-200 text-slate-700 text-xs px-3 py-1 rounded-full italic">
                    "{phrase}"
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reaction sections */}
          {[
            ['What Landed', reaction.what_landed, 'text-emerald-700'],
            ['What Fell Flat', reaction.what_fell_flat, 'text-red-600'],
            ['Confusion / Gaps', reaction.confusion_or_gaps, 'text-amber-600'],
            ['Emotional Response', reaction.emotional_response, 'text-slate-700'],
            ['Damages Instinct', reaction.damages_instinct, 'text-slate-700'],
          ].filter(([, val]) => val).map(([label, val, color]) => (
            <div key={label}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${color}`}>{label}</p>
              <p className="text-sm text-slate-700 leading-relaxed">{val}</p>
            </div>
          ))}

          {/* Trust assessment */}
          {(reaction.trust_assessment?.plaintiff || reaction.trust_assessment?.defendant) && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Trust Assessment</p>
              <div className="grid grid-cols-2 gap-3">
                {reaction.trust_assessment.plaintiff && (
                  <div className="bg-emerald-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-emerald-700 mb-1">Plaintiff Side</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{reaction.trust_assessment.plaintiff}</p>
                  </div>
                )}
                {reaction.trust_assessment.defendant && (
                  <div className="bg-red-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-red-600 mb-1">Defendant Side</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{reaction.trust_assessment.defendant}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Deliberative role */}
          {juror.deliberative_role && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">Deliberative Role</p>
              <p className="text-xs text-indigo-800 leading-relaxed">{juror.deliberative_role}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Vote Summary Strip ────────────────────────────────────────────────────────

function VoteSummary({ reactions }) {
  const counts = reactions.reduce((acc, r) => {
    if (!r.error) acc[r.initial_lean] = (acc[r.initial_lean] ?? 0) + 1;
    return acc;
  }, { plaintiff: 0, defendant: 0, undecided: 0 });

  const confMap = { low: 1, medium: 2, high: 3 };
  const valid = reactions.filter((r) => !r.error && r.confidence);
  const avgConf = valid.length
    ? valid.reduce((s, r) => s + (confMap[r.confidence] ?? 1), 0) / valid.length
    : 0;
  const avgLabel = avgConf >= 2.5 ? 'High' : avgConf >= 1.5 ? 'Medium' : 'Low';

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-6 items-center">
      {[
        { lean: 'plaintiff', count: counts.plaintiff },
        { lean: 'undecided', count: counts.undecided },
        { lean: 'defendant', count: counts.defendant },
      ].map(({ lean, count }) => {
        const s = LEAN_STYLES[lean];
        return (
          <div key={lean} className="flex items-center gap-3">
            <span className={`text-3xl font-bold ${s.text}`}>{count}</span>
            <div>
              <p className={`text-xs font-semibold ${s.text}`}>{s.label}</p>
              <p className="text-xs text-slate-400">of 12</p>
            </div>
          </div>
        );
      })}
      <div className="ml-auto text-right">
        <p className="text-xs text-slate-400 uppercase tracking-wide">Avg. confidence</p>
        <p className="text-sm font-semibold text-slate-700">{avgLabel}</p>
      </div>
    </div>
  );
}

// ── Themes Panel ─────────────────────────────────────────────────────────────

function ThemesPanel({ caseDoc, reactions, jurors }) {
  const [themes, setThemes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function synthesize() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/jurors/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseDoc, reactions, jurors }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setThemes(data.themes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!themes && !loading) {
    return (
      <div className="bg-slate-950 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-base">Synthesize Themes</p>
            <p className="text-slate-400 text-sm mt-1">
              Analyze cross-juror patterns — what landed, what failed, damages instincts, watch list.
            </p>
          </div>
          <button
            onClick={synthesize}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Generate →
          </button>
        </div>
        {error && <p className="mt-4 text-red-400 text-sm">{error} — <button onClick={synthesize} className="underline">retry</button></p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-slate-950 rounded-xl p-6 text-white flex items-center gap-3">
        <svg className="w-5 h-5 animate-spin text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <p className="text-slate-300 text-sm">Analyzing jury patterns…</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 rounded-xl p-6 text-white">
      <div className="flex items-center justify-between mb-5">
        <p className="font-bold text-base">Jury Themes Analysis</p>
        <button onClick={() => setThemes(null)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">↺ Regenerate</button>
      </div>

      {/* Attorney briefing */}
      {themes.attorney_briefing && (
        <div className="bg-indigo-900/50 border border-indigo-700 rounded-lg p-4 mb-5">
          <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wide mb-2">Attorney Briefing</p>
          <p className="text-sm text-indigo-100 leading-relaxed">{themes.attorney_briefing}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {[
          { title: 'What Landed', items: themes.what_landed, color: 'text-emerald-400', dot: 'bg-emerald-400' },
          { title: 'What Fell Flat', items: themes.what_fell_flat, color: 'text-red-400', dot: 'bg-red-400' },
          { title: 'Confusions & Gaps', items: themes.confusions, color: 'text-amber-400', dot: 'bg-amber-400' },
        ].map(({ title, items, color, dot }) => items?.length > 0 && (
          <div key={title}>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${color}`}>{title}</p>
            <ul className="space-y-1.5">
              {items.map((item, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-300 leading-relaxed">
                  <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0 mt-1`} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {themes.damages_distribution && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 text-slate-400">Damages Distribution</p>
            <div className="space-y-2 text-xs text-slate-300">
              <p className="leading-relaxed">{themes.damages_distribution.summary}</p>
              {themes.damages_distribution.low_end && (
                <p className="text-slate-400"><span className="text-red-400 font-medium">Skeptics:</span> {themes.damages_distribution.low_end}</p>
              )}
              {themes.damages_distribution.high_end && (
                <p className="text-slate-400"><span className="text-emerald-400 font-medium">Sympathetic:</span> {themes.damages_distribution.high_end}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {themes.watch_list?.length > 0 && (
        <div className="mt-5 pt-5 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Watch List</p>
          <ul className="space-y-2">
            {themes.watch_list.map((item, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-300 leading-relaxed">
                <span className="text-amber-400 shrink-0">⚑</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Judge Verdict Drawer ──────────────────────────────────────────────────────

function JudgeVerdictDrawer({ verdict, turn, juror, onClose }) {
  const isWarranted = verdict.verdict === 'WARRANTED';
  const accent = isWarranted
    ? { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' }
    : { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };

  const hf = verdict.human_factors;
  const deviated = !!hf?.deviated_from_logic;
  const logicalLabel = verdict.logical_verdict ?? verdict.verdict;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <span>⚖</span> Judge Evaluation
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {verdict.speaker_name}
              {juror && ` · ${juror.demographics?.occupation}`} · {turn.opinion_change?.from} → {turn.opinion_change?.to}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full border ${accent.bg} ${accent.text} ${accent.border}`}>
              {isWarranted ? 'Warranted' : 'Unwarranted'}
            </span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Deviation banner */}
          {deviated && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">Human factors flipped this verdict</span>
                <span className="text-xs font-mono text-purple-600">{logicalLabel} → {verdict.verdict}</span>
              </div>
              <p className="text-sm text-purple-900 leading-relaxed">{hf.deviation_explanation}</p>
              {verdict.regenerated_rationale && (
                <div className="mt-3 pt-3 border-t border-purple-200">
                  <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">Public-record rationale</p>
                  <p className="text-sm text-purple-900 italic leading-relaxed">"{verdict.regenerated_rationale}"</p>
                </div>
              )}
            </div>
          )}

          {/* The juror's quote */}
          <div className="bg-slate-50 border-l-4 border-slate-300 rounded-r-md px-4 py-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">What they said</p>
            <p className="text-sm text-slate-700 italic leading-relaxed">"{turn.text}"</p>
          </div>

          {/* Logical evaluation narrative */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Logical Evaluation</p>
            <p className="text-sm text-slate-700 leading-relaxed">{verdict.evaluation}</p>
          </div>

          {/* Bias flags */}
          {verdict.bias_flags?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Bias Flags</p>
              <div className="flex flex-wrap gap-2">
                {verdict.bias_flags.map((flag) => (
                  <span key={flag} className="bg-amber-50 border border-amber-200 text-amber-700 text-xs font-mono px-2 py-1 rounded">
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Score + threshold breakdown */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              ['Reasoning quality', `${verdict.reasoning_quality_score} / 4`],
              ['Stubbornness input (S)', verdict.stubbornness_input?.toFixed(2)],
              ['Base threshold (S × 3)', verdict.stubbornness_threshold?.toFixed(2)],
              ['Randomness seed (R)', verdict.randomness_seed?.toFixed(2)],
              ['Randomness adj. (R−0.5)×0.6', verdict.randomness_adjustment?.toFixed(2)],
              ['Adjusted threshold', verdict.adjusted_threshold?.toFixed(2)],
            ].map(([label, val]) => (
              <div key={label} className="bg-slate-50 rounded-md px-3 py-2">
                <p className="text-slate-400 mb-0.5">{label}</p>
                <p className="text-slate-700 font-semibold font-mono">{val ?? '—'}</p>
              </div>
            ))}
          </div>

          {/* Human factors breakdown */}
          {hf && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Human Factors Layer</p>
                <span className={`text-xs font-mono ${deviated ? 'text-purple-700' : 'text-slate-500'}`}>
                  P(deviate) = {hf.final_deviation_probability.toFixed(3)} · roll {hf.random_draw.toFixed(3)} → {deviated ? 'DEVIATED' : 'held'}
                </span>
              </div>

              {/* Big Five */}
              {hf.big_five && (
                <div className="grid grid-cols-5 gap-2 text-xs">
                  {Object.entries(hf.big_five).map(([k, v]) => (
                    <div key={k} className="bg-white rounded px-2 py-1.5 border border-slate-100 text-center">
                      <p className="text-slate-400 uppercase tracking-wide" style={{ fontSize: '0.65rem' }}>{k}</p>
                      <p className="text-slate-700 font-mono font-semibold">{v.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Factors fired */}
              {hf.factors_applied?.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500">Factors that fired:</p>
                  {hf.factors_applied.map((f, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 text-xs bg-white rounded px-3 py-2 border border-slate-100">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono font-semibold text-slate-700">{f.factor_name}</p>
                        <p className="text-slate-500 leading-snug mt-0.5">{f.active_because}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-slate-700">w = {f.weight.toFixed(3)}</p>
                        <p className="text-slate-400 text-[10px]">{f.direction}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No human factors fired — pure logic verdict.</p>
              )}
            </div>
          )}

          {/* Recommended action */}
          <div className={`rounded-lg p-3 border ${accent.bg} ${accent.border}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${accent.text}`}>Recommended action</p>
            <p className={`text-sm font-mono ${accent.text}`}>{verdict.recommended_action}</p>
          </div>

          {/* Feedback */}
          {verdict.feedback_to_member && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Feedback to juror</p>
              <p className="text-sm text-slate-700 leading-relaxed">{verdict.feedback_to_member}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Deliberation Panel ────────────────────────────────────────────────────────

function DeliberationPanel({ caseDoc, reactions, jurors }) {
  const [deliberation, setDeliberation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verdicts, setVerdicts] = useState(null); // array of judge verdicts, indexed by turn_index
  const [judging, setJudging] = useState(false);
  const [judgeError, setJudgeError] = useState('');
  const [selectedVerdict, setSelectedVerdict] = useState(null);

  async function runJudge(transcript) {
    setJudging(true);
    setJudgeError('');
    try {
      const res = await fetch('/api/jurors/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, jurors, reactions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setVerdicts(data.verdicts);
    } catch (err) {
      setJudgeError(err.message);
    } finally {
      setJudging(false);
    }
  }

  async function simulate() {
    setLoading(true);
    setError('');
    setVerdicts(null);
    try {
      const res = await fetch('/api/jurors/deliberate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseDoc, reactions, jurors }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDeliberation(data.deliberation);
      runJudge(data.deliberation.transcript);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!deliberation && !loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-slate-800 text-base">Jury Room Transcript</p>
            <p className="text-slate-500 text-sm mt-1">
              Simulate how these jurors would actually talk to each other — who moves, who digs in, and what swings the room.
            </p>
          </div>
          <button
            onClick={simulate}
            className="shrink-0 bg-slate-900 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Simulate →
          </button>
        </div>
        {error && <p className="mt-4 text-red-500 text-sm">{error} — <button onClick={simulate} className="underline">retry</button></p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mt-6 flex items-center gap-3">
        <svg className="w-5 h-5 animate-spin text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <p className="text-slate-500 text-sm">Simulating jury room deliberation…</p>
      </div>
    );
  }

  const { transcript, final_positions, final_vote, deliberation_summary } = deliberation;

  const leanColors = {
    plaintiff: { name: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    defendant: { name: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' },
    undecided: { name: 'text-slate-500', bg: 'bg-slate-100', border: 'border-slate-200', dot: 'bg-slate-400' },
  };

  const jurorInitialLean = Object.fromEntries(
    reactions.map((r) => [r.juror_id, r.initial_lean ?? 'undecided'])
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm mt-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="font-bold text-slate-800 text-base">Jury Room Transcript</p>
          {judging && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Judge evaluating opinion changes…
            </span>
          )}
          {!judging && verdicts && (
            <span className="text-xs text-slate-500">
              Judge: {verdicts.filter((v) => v.verdict === 'WARRANTED').length} warranted · {verdicts.filter((v) => v.verdict === 'UNWARRANTED').length} unwarranted
              {judgeError && <span className="text-red-500"> · error</span>}
            </span>
          )}
        </div>
        <button onClick={() => { setDeliberation(null); setVerdicts(null); }} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">↺ Regenerate</button>
      </div>

      {/* Summary */}
      {deliberation_summary && (
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <p className="text-sm text-slate-600 leading-relaxed">{deliberation_summary}</p>
        </div>
      )}

      {/* Transcript */}
      <div className="px-6 py-5 space-y-4 max-h-[600px] overflow-y-auto">
        {transcript.map((turn, i) => {
          const juror = jurors.find((j) => j.id === turn.speaker_id);
          const currentLean = jurorInitialLean[turn.speaker_id] ?? 'undecided';
          const leanStyle = leanColors[currentLean] ?? leanColors.undecided;
          const hasChange = turn.opinion_change != null;
          const verdict = hasChange ? verdicts?.find((v) => v.turn_index === i) : null;

          if (hasChange && turn.opinion_change) {
            jurorInitialLean[turn.speaker_id] = turn.opinion_change.to;
          }

          return (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 flex flex-col items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${leanStyle.dot}`}>
                  {turn.speaker_name?.[0] ?? '?'}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs font-semibold ${leanStyle.name}`}>{turn.speaker_name}</span>
                  {juror && (
                    <span className="text-xs text-slate-400">{juror.demographics?.occupation}</span>
                  )}
                  {hasChange && turn.opinion_change && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${leanColors[turn.opinion_change.to]?.bg} ${leanColors[turn.opinion_change.to]?.text ?? 'text-slate-700'} ${leanColors[turn.opinion_change.to]?.border}`}>
                      {turn.opinion_change.from} → {turn.opinion_change.to}
                    </span>
                  )}
                  {verdict && !verdict.error && (
                    <button
                      onClick={() => setSelectedVerdict({ verdict, turn, juror })}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                        verdict.verdict === 'WARRANTED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      }`}
                      title="Click for judge evaluation"
                    >
                      ⚖ {verdict.verdict === 'WARRANTED' ? 'Warranted' : 'Unwarranted'}
                      {verdict.bias_flags?.length > 0 && ` · ${verdict.bias_flags.length} flag${verdict.bias_flags.length > 1 ? 's' : ''}`}
                    </button>
                  )}
                  {verdict?.human_factors?.deviated_from_logic && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200"
                      title={verdict.human_factors.deviation_explanation}
                    >
                      ⤺ flipped by human factors
                    </span>
                  )}
                  {hasChange && !verdict && judging && (
                    <span className="text-xs text-slate-400 italic">judging…</span>
                  )}
                  {verdict?.error && (
                    <span className="text-xs text-red-400 italic" title={verdict.error}>judge error</span>
                  )}
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{turn.text}</p>
              </div>
            </div>
          );
        })}
      </div>

      {selectedVerdict && (
        <JudgeVerdictDrawer
          {...selectedVerdict}
          onClose={() => setSelectedVerdict(null)}
        />
      )}

      {/* Final vote */}
      {final_vote && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Final Vote</p>
          <div className="flex items-center gap-6 flex-wrap">
            {[
              { lean: 'plaintiff', count: final_vote.plaintiff },
              { lean: 'undecided', count: final_vote.undecided },
              { lean: 'defendant', count: final_vote.defendant },
            ].map(({ lean, count }) => {
              const s = LEAN_STYLES[lean];
              return (
                <div key={lean} className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${s.text}`}>{count}</span>
                  <span className={`text-xs font-semibold ${s.text}`}>{s.label}</span>
                </div>
              );
            })}

            {/* Who changed */}
            {final_positions?.some((p) => p.changed) && (
              <div className="ml-auto text-right">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Changed minds</p>
                <p className="text-sm font-semibold text-slate-700">
                  {final_positions.filter((p) => p.changed).map((p) => {
                    const j = jurors.find((jj) => jj.id === p.juror_id);
                    return j?.name ?? p.juror_id;
                  }).join(', ')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ResultsPage({ params }) {
  const { id } = use(params);
  const [session, setSession] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [selected, setSelected] = useState(null); // { juror, reaction }

  useEffect(() => {
    const raw = localStorage.getItem(`jury_session_${id}`);
    if (!raw) { setNotFound(true); return; }
    try {
      setSession(JSON.parse(raw));
    } catch {
      setNotFound(true);
    }
  }, [id]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <p className="text-slate-500 text-sm">Session not found. It may have expired or been cleared.</p>
        <Link href="/new" className="text-indigo-600 text-sm font-medium hover:underline">Start a new simulation →</Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    );
  }

  const { caseDoc, reactions, jurors } = session;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-950 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/new" className="text-slate-500 hover:text-slate-300 text-xs transition-colors">← New case</Link>
          <div>
            <h1 className="font-bold text-base tracking-tight">JuryMind</h1>
            <p className="text-slate-500 text-xs">{caseDoc.caseName}{caseDoc.jurisdiction ? ` · ${caseDoc.jurisdiction}` : ''}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <VoteSummary reactions={reactions} />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
          {jurors.map((juror) => {
            const reaction = reactions.find((r) => r.juror_id === juror.id);
            return (
              <JurorCard
                key={juror.id}
                juror={juror}
                reaction={reaction}
                onClick={() => setSelected({ juror, reaction })}
              />
            );
          })}
        </div>

        <ThemesPanel caseDoc={caseDoc} reactions={reactions} jurors={jurors} />
        <DeliberationPanel caseDoc={caseDoc} reactions={reactions} jurors={jurors} />
      </main>

      {selected && (
        <DetailDrawer
          juror={selected.juror}
          reaction={selected.reaction}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
