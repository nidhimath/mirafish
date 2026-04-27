'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseCaseDocument, validateCaseDoc } from '../../lib/parse-case.js';

// const PLACEHOLDER = `Case: Henderson v. Crestview Chemical Corp.
// Jurisdiction
// Macon County, Georgia

// Case Facts
// On March 14, 2022, Robert Henderson, a 47-year-old maintenance worker at the Crestview Chemical plant in Macon, Georgia, was exposed to a concentrated hydrogen sulfide leak while performing routine pipe inspection in Section 7 of the facility. Emergency response was delayed by approximately 22 minutes due to a malfunctioning alert system that Crestview's own safety audit had flagged as needing replacement fourteen months earlier. Henderson suffered acute respiratory injury and permanent 40% reduction in lung capacity. He spent 11 days in the ICU and has been unable to return to full-time work. He has two children, ages 9 and 14. Crestview Chemical Corp. is a subsidiary of Nexagen Industrial Holdings, which reported $340 million in net income last fiscal year. Internal documents show that plant management was aware of the alert system deficiency and had budgeted its replacement twice, only to defer it in favor of a facility expansion project.

// Opening Statement
// Ladies and gentlemen of the jury, Robert Henderson woke up on March 14th just like he had for 23 years — put on his boots, drove to that plant, and did his job. He trusted Crestview Chemical to keep him safe. That is the only thing we are going to ask you to decide in this case: did Crestview keep that promise?

// The evidence will show that Crestview knew. Not maybe. Not possibly. They knew. Fourteen months before the accident, their own safety inspectors submitted a report — Exhibit 3, which you will see — recommending that the Section 7 alert system be replaced within 90 days. That replacement was approved in the budget. Twice. And both times, the money was quietly moved to fund an expansion of the parking lot.

// Robert Henderson is not here asking for sympathy. He is here asking for accountability. He cannot run with his daughter anymore. He cannot climb a ladder without stopping to catch his breath. He will carry an oxygen monitor for the rest of his life. And Crestview Chemical will ask you to believe that none of that is their fault.

// We will prove otherwise. We will show you the internal emails. We will show you the budget transfers. We will put Crestview's own safety director on the stand. And at the end of this trial, we will ask you to hold this company to the same standard they were supposed to hold themselves.

// Trial Strategy
// Core theme: "They knew and they chose not to act." This is a knowing-inaction case, not an accident. The strategy is to keep the jury focused on the two budget deferrals as the central act of negligence, avoid getting lost in technical chemistry, and humanize Robert Henderson without making him seem like a professional victim. The defense will argue contributory negligence (Henderson entered a restricted zone) — we need to preemptively defuse that with the zone classification evidence showing it was not restricted on the day of the incident.`;

const PLACEHOLDER = `Case: Henderson v. Crestview Chemical Corp.
Jurisdiction
Macon County, Georgia

Case Facts
On March 14, 2022, Robert Henderson, a 47-year-old maintenance worker at the Crestview Chemical plant in Macon, Georgia, was exposed to a hydrogen sulfide leak while performing a pipe inspection in Section 7 of the facility. Henderson suffered respiratory injury and now has a disputed 25–40% reduction in lung capacity.

The leak was traced to a sudden valve failure that had passed inspection 11 days prior. At the time of the incident, Henderson had deviated from his assigned inspection route and entered an area that was undergoing partial maintenance procedures. Signage and internal logs indicate that the area required supervisor clearance, though testimony conflicts as to whether that restriction was clearly communicated.

Crestview’s alert system in Section 7 had been flagged in a prior audit as “recommended for upgrade,” but not categorized as a critical safety failure. On the day of the incident, a secondary manual alert system was operational, and two workers in adjacent zones reported hearing the alert within minutes. Company logs indicate that emergency response was initiated within 7–9 minutes, though Henderson estimates his exposure lasted over 20 minutes.

Medical experts disagree on whether Henderson’s current condition is solely attributable to the incident or partially due to a pre-existing respiratory condition documented in prior health screenings.

Opening Statement
Ladies and gentlemen of the jury,

This case is not about whether Robert Henderson was injured. He was. And everyone in this courtroom can agree that what happened to him is unfortunate.

But your role is not to decide whether the outcome was tragic. Your role is to decide whether Crestview Chemical was negligent — whether the company failed to act reasonably under the circumstances.

The evidence will show that Crestview maintained a comprehensive safety program, conducted regular inspections, and had multiple alert systems in place. In fact, the very valve involved in this incident had passed inspection less than two weeks earlier.

You will also hear that Mr. Henderson was not where he was assigned to be. He entered an area undergoing maintenance procedures — an area where access was restricted without supervisor clearance. That matters, because safety systems are designed to work within established protocols.

The plaintiff will focus on a recommendation to upgrade an alert system. But you will see that this was not classified as a critical issue, and that alternative safety measures were in place and functioning. You will hear testimony that alerts were triggered and that response teams were dispatched within minutes.

And you will hear from medical experts who disagree — not just slightly, but significantly — about the cause and extent of Mr. Henderson’s condition.

This case is not about a company ignoring safety. It is about a complex incident involving equipment failure, human decision-making, and systems that, while not perfect, were operating as designed.

At the end of this trial, we will ask you to return a verdict based not on sympathy, but on evidence — and that evidence will show that Crestview Chemical acted reasonably.

Trial Strategy 
Core theme: "This was an accident, not negligence."

The defense will focus on three areas of reasonable doubt:

1. **Causation ambiguity** — Emphasize conflicting timelines (7–9 minutes vs. 20+ minutes) and expert disagreement on whether Henderson’s long-term condition is fully attributable to the incident.

2. **Reasonableness of safety measures** — Show that the flagged alert system was not classified as critical, that inspections were up to date, and that backup alert mechanisms functioned as intended. Reinforce that no prior incidents had occurred in Section 7 in the past 6 years.

3. **Contributory conduct** — Introduce evidence that Henderson deviated from his assigned route and entered a partially restricted zone without clearance. Frame this not as blame, but as a breakdown in protocol that safety systems depend on.

The goal is not to prove perfection, but to demonstrate that Crestview met the standard of reasonable care under the circumstances, and that multiple factors — not negligence — led to this outcome.`;

function SectionBadge({ label, filled }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
        filled
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-slate-100 text-slate-400 border border-slate-200'
      }`}
    >
      {filled ? '✓' : '○'} {label}
    </span>
  );
}

export default function NewCasePage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const parsed = text.trim() ? parseCaseDocument(text) : null;
  const missing = parsed ? validateCaseDoc(parsed) : [];
  const canSubmit = parsed && missing.length === 0 && !loading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/jurors/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseDoc: parsed }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const sessionId = crypto.randomUUID();
      localStorage.setItem(
        `jury_session_${sessionId}`,
        JSON.stringify({ caseDoc: parsed, reactions: data.reactions, jurors: data.jurors })
      );

      router.push(`/results/${sessionId}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-950 text-white px-6 py-4 flex items-center gap-3">
        <div>
          <h1 className="font-bold text-base tracking-tight">JuryMind</h1>
          <p className="text-slate-500 text-xs">Mock Jury Simulator for Trial Attorneys</p>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-800">New Case Simulation</h2>
          <p className="text-sm text-slate-500 mt-1">
            Paste your case document below. 12 jurors will read your opening and report their reactions.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-1 mb-4">
          <div className="bg-slate-50 rounded-lg px-4 py-2.5 mb-1 text-xs text-slate-500 font-mono border border-slate-100">
            <span className="text-slate-400 select-none">Required format: </span>
            Case: [name] → Jurisdiction → [city, state] → Case Facts → [text] → Opening Statement → [text] → Trial Strategy → [text]
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            disabled={loading}
            rows={24}
            className="w-full px-4 py-3 text-sm text-slate-700 placeholder:text-slate-300 bg-white rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed disabled:opacity-60"
          />
        </div>

        {/* Parse status */}
        {text.trim() && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs text-slate-400 mr-1">Parsed:</span>
            <SectionBadge label="Case name" filled={!!parsed?.caseName} />
            <SectionBadge label="Jurisdiction" filled={!!parsed?.jurisdiction} />
            <SectionBadge label="Case Facts" filled={!!parsed?.facts} />
            <SectionBadge label="Opening Statement" filled={!!parsed?.opening} />
            <SectionBadge label="Trial Strategy" filled={!!parsed?.strategy} />
          </div>
        )}

        {missing.length > 0 && text.trim() && (
          <p className="text-xs text-amber-600 mb-4">
            Missing sections: {missing.join(', ')}. Check your formatting.
          </p>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Empaneling jury… this takes ~30s
              </>
            ) : (
              'Empanel Jury →'
            )}
          </button>
          {!text.trim() && (
            <button
              onClick={() => setText(PLACEHOLDER)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              Load sample case
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
