import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-20250514';

const AGENTS = [
  {
    id: 'silver',
    name: 'David Silver',
    shortName: 'Silver',
    org: 'DeepMind',
    contributions: 'reinforcement learning, reward maximization, AlphaGo',
    prior:
      'Reward is enough; general intelligence emerges from optimizing a well-specified objective. Skeptical of alignment-first framings that constrain capability.',
    lineColor: '#1d4ed8',
  },
  {
    id: 'vinyals',
    name: 'Oriol Vinyals',
    shortName: 'Vinyals',
    org: 'DeepMind',
    contributions: 'sequence-to-sequence learning, AlphaStar, emergent behavior at scale',
    prior:
      'Scale plus architecture unlock surprising generalization; benchmark performance is real signal. Skeptical of interpretability as a deployment prerequisite.',
    lineColor: '#3b82f6',
  },
  {
    id: 'kohli',
    name: 'Pushmeet Kohli',
    shortName: 'Kohli',
    org: 'DeepMind',
    contributions: 'robustness, uncertainty quantification, real-world AI grounding',
    prior:
      'Models must be robust to distribution shift before we trust them. Skeptical of pure benchmark optimization.',
    lineColor: '#93c5fd',
  },
  {
    id: 'olah',
    name: 'Chris Olah',
    shortName: 'Olah',
    org: 'Anthropic',
    contributions: 'mechanistic interpretability, circuits, feature visualization',
    prior:
      'We should not deploy systems we cannot understand internally. Skeptical of scaling arguments that outpace understanding.',
    lineColor: '#c2410c',
  },
  {
    id: 'askell',
    name: 'Amanda Askell',
    shortName: 'Askell',
    org: 'Anthropic',
    contributions: 'RLHF, value alignment, model character and constitutional AI',
    prior:
      'Human feedback and constitutional principles are our best current tools for aligning behavior to values. Skeptical of purely capability-driven evals.',
    lineColor: '#f97316',
  },
  {
    id: 'bengio',
    name: 'Yoshua Bengio',
    shortName: 'Bengio',
    org: 'Academic',
    contributions: 'deep learning foundations, recurrent networks, generative models',
    prior:
      'The field moves too fast relative to our understanding of risks. Skeptical of both labs on deployment timelines.',
    lineColor: '#6b7280',
  },
];

const TOPICS = [
  'Is RLHF sufficient for alignment or do we need formal verification?',
  'Will scaling alone produce general reasoning?',
  'Should interpretability be required before frontier model deployment?',
  'Is reward maximization a safe foundation for AGI?',
  'Can AI systems be meaningfully aligned without understanding their internals?',
];

const ORG = {
  DeepMind: {
    badge: 'bg-blue-100 text-blue-700',
    bar: 'bg-blue-500',
    dot: 'bg-blue-500',
    ring: 'ring-blue-300',
    activeBorder: 'border-blue-400',
  },
  Anthropic: {
    badge: 'bg-orange-100 text-orange-700',
    bar: 'bg-orange-500',
    dot: 'bg-orange-500',
    ring: 'ring-orange-300',
    activeBorder: 'border-orange-400',
  },
  Academic: {
    badge: 'bg-gray-100 text-gray-600',
    bar: 'bg-gray-400',
    dot: 'bg-gray-400',
    ring: 'ring-gray-300',
    activeBorder: 'border-gray-400',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function parseBelief(text) {
  const match = text.match(/<belief>([\s\S]*?)<\/belief>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function stripBelief(text) {
  return text.replace(/<belief>[\s\S]*?<\/belief>/g, '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

async function callAgent(apiKey, agent, topic, priorText) {
  const system = `You are ${agent.name}, an AI researcher known for ${agent.contributions}. \
Your epistemic prior: ${agent.prior} \
Respond in 2-3 sentences max, direct and intellectually honest, grounded in your research background. \
You may update your position if another researcher makes a compelling argument. \
After your response output a JSON block wrapped in belief tags exactly like this: \
<belief>{"position":"one sentence","confidence":0.0,"moved":false,"cruxes":["crux 1","crux 2"]}</belief>`;

  const user = priorText
    ? `Debate topic: "${topic}"\n\nPrior statements:\n${priorText}\n\nRespond to the ongoing debate.`
    : `Debate topic: "${topic}"\n\nGive your opening position.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const e = await res.json();
      msg = e.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  return data.content[0].text;
}

async function callSynthesis(apiKey, topic, flatTranscript) {
  const system = `You are a senior science journalist covering AI research. \
Analyze this debate transcript and write a 3-paragraph field report covering \
what positions emerged, who influenced whom, and what the unresolved crux is.`;

  const transcriptText = flatTranscript
    .map((m) => `[Round ${m.round}] ${m.agentName} (${m.org}): ${m.statement}`)
    .join('\n\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [
        {
          role: 'user',
          content: `Debate topic: "${topic}"\n\nTranscript:\n${transcriptText}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const e = await res.json();
      msg = e.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  return data.content[0].text;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function ApiKeyScreen({ onSubmit }) {
  const [key, setKey] = useState('');

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-7">
          <div className="text-5xl mb-3">🧠</div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ScholarMind</h1>
          <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
            Multi-Agent AI Researcher Debate Simulator
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Anthropic API Key
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && key.trim() && onSubmit(key.trim())}
              placeholder="sk-ant-..."
              className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-300"
              autoFocus
            />
          </div>

          <button
            onClick={() => key.trim() && onSubmit(key.trim())}
            disabled={!key.trim()}
            className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Enter ScholarMind
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-5 text-center leading-relaxed">
          Your key lives in component state only — never stored or sent anywhere except
          Anthropic's API.
        </p>
      </div>
    </div>
  );
}

function AgentCard({ agent, belief, isActive }) {
  const orgStyle = ORG[agent.org];

  return (
    <div
      className={`bg-white rounded-xl border p-3.5 transition-all duration-200 ${
        isActive
          ? `${orgStyle.activeBorder} shadow-md ring-1 ${orgStyle.ring}`
          : 'border-slate-200 shadow-sm'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-sm leading-tight truncate">
            {agent.name}
          </p>
          <span
            className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${orgStyle.badge}`}
          >
            {agent.org}
          </span>
        </div>

        {belief?.moved && (
          <span className="shrink-0 text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">
            ↺ moved
          </span>
        )}
      </div>

      {/* Position */}
      <p className="text-xs text-slate-500 mt-2.5 leading-relaxed min-h-[2.5rem]">
        {belief?.position ?? (
          <span className="italic text-slate-300">No position yet</span>
        )}
      </p>

      {/* Confidence bar */}
      {belief ? (
        <div className="mt-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">Confidence</span>
            <span className="text-xs font-mono text-slate-500">
              {(belief.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${orgStyle.bar}`}
              style={{ width: `${Math.min(1, Math.max(0, belief.confidence)) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-2.5 h-1.5 bg-slate-100 rounded-full" />
      )}

      {/* Active pulse */}
      {isActive && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${orgStyle.dot}`} />
          <span className="text-xs text-slate-400 italic">thinking…</span>
        </div>
      )}
    </div>
  );
}

function RoundDivider({ round, active }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-slate-200" />
      <div
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide ${
          active
            ? 'bg-indigo-600 text-white'
            : 'bg-slate-100 text-slate-400'
        }`}
      >
        {active && (
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
        )}
        ROUND {round}
        {active && ' · RUNNING'}
      </div>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

function TranscriptMessage({ msg }) {
  const orgStyle = ORG[msg.org];

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-3">
      {/* Agent header */}
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span className={`w-2 h-2 rounded-full shrink-0 ${orgStyle.dot}`} />
        <span className="font-semibold text-slate-800 text-sm">{msg.agentName}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${orgStyle.badge}`}>
          {msg.org}
        </span>
        {msg.belief?.moved && (
          <span className="ml-auto text-xs text-amber-600 font-medium">↺ position updated</span>
        )}
      </div>

      {/* Statement */}
      <p className="text-sm text-slate-700 leading-relaxed">{msg.statement}</p>

      {/* Cruxes */}
      {msg.belief?.cruxes?.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-slate-50">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
            Cruxes
          </p>
          <ul className="space-y-1">
            {msg.belief.cruxes.map((crux, i) => (
              <li key={i} className="text-xs text-slate-500 italic flex gap-1.5">
                <span className="text-slate-300 shrink-0">•</span>
                {crux}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ThinkingBubble({ agent }) {
  const orgStyle = ORG[agent.org];
  return (
    <div className="bg-white rounded-xl border border-dashed border-slate-200 p-4 mb-3 opacity-80">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full animate-pulse shrink-0 ${orgStyle.dot}`} />
        <span className="font-semibold text-slate-700 text-sm">{agent.name}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${orgStyle.badge}`}>
          {agent.org}
        </span>
        <span className="ml-2 text-xs text-slate-400 italic animate-pulse">composing response…</span>
      </div>
    </div>
  );
}

// Custom tooltip for the chart
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-600 mb-1.5">Round {label}</p>
      {payload.map((p) => {
        const agent = AGENTS.find((a) => a.id === p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            <span className="text-slate-600">{agent?.shortName ?? p.dataKey}:</span>
            <span className="font-mono font-semibold text-slate-800">
              {(p.value * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [topic, setTopic] = useState(TOPICS[0]);
  const [numRounds, setNumRounds] = useState(3);

  const [isRunning, setIsRunning] = useState(false);
  const [runningRound, setRunningRound] = useState(null);
  const [runningAgentId, setRunningAgentId] = useState(null);

  // flat array: [{round, agentId, agentName, org, statement, belief}]
  const [transcript, setTranscript] = useState([]);
  // agentId -> latest belief object
  const [beliefState, setBeliefState] = useState({});
  // [{round: N, silver: 0.7, vinyals: 0.8, ...}]
  const [chartData, setChartData] = useState([]);

  const [debateComplete, setDebateComplete] = useState(false);
  const [error, setError] = useState('');

  const [synthesis, setSynthesis] = useState('');
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesisError, setSynthesisError] = useState('');

  const transcriptEndRef = useRef(null);

  // Auto-scroll transcript to bottom as messages arrive
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, runningAgentId]);

  // ── Debate runner ──────────────────────────────────────────────────────────

  const startDebate = useCallback(async () => {
    setIsRunning(true);
    setError('');
    setTranscript([]);
    setBeliefState({});
    setChartData([]);
    setDebateComplete(false);
    setSynthesis('');
    setSynthesisError('');
    setRunningRound(null);
    setRunningAgentId(null);

    const flat = [];          // local copy built round-by-round
    const beliefs = {};       // agentId -> latest belief
    const chart = [];         // chart entries

    try {
      for (let round = 1; round <= numRounds; round++) {
        setRunningRound(round);

        const roundEntry = { round };

        for (const agent of AGENTS) {
          setRunningAgentId(agent.id);

          const priorText =
            flat.length > 0
              ? flat
                  .map((m) => `[Round ${m.round}] ${m.agentName}: ${m.statement}`)
                  .join('\n')
              : '';

          let raw;
          try {
            raw = await callAgent(apiKey, agent, topic, priorText);
          } catch (err) {
            setError(`${agent.name} · Round ${round}: ${err.message}`);
            setIsRunning(false);
            setRunningRound(null);
            setRunningAgentId(null);
            return;
          }

          const belief = parseBelief(raw);
          const statement = stripBelief(raw);

          const msg = {
            round,
            agentId: agent.id,
            agentName: agent.name,
            org: agent.org,
            statement,
            belief,
          };

          flat.push(msg);
          if (belief) {
            beliefs[agent.id] = belief;
            roundEntry[agent.id] = Math.min(1, Math.max(0, belief.confidence));
          } else {
            roundEntry[agent.id] = beliefs[agent.id]?.confidence ?? 0.5;
          }

          // Push updates to React state after each agent so UI is live
          setTranscript([...flat]);
          setBeliefState({ ...beliefs });
        }

        chart.push(roundEntry);
        setChartData([...chart]);
        setRunningRound(null);
        setRunningAgentId(null);
      }

      setDebateComplete(true);
    } catch (err) {
      setError(`Unexpected error: ${err.message}`);
    } finally {
      setIsRunning(false);
      setRunningRound(null);
      setRunningAgentId(null);
    }
  }, [apiKey, topic, numRounds]);

  // ── Synthesis runner ───────────────────────────────────────────────────────

  const runSynthesis = useCallback(async () => {
    setSynthesizing(true);
    setSynthesisError('');
    try {
      const result = await callSynthesis(apiKey, topic, transcript);
      setSynthesis(result);
    } catch (err) {
      setSynthesisError(`Synthesis failed: ${err.message}`);
    } finally {
      setSynthesizing(false);
    }
  }, [apiKey, topic, transcript]);

  // ── Gate: API key screen ───────────────────────────────────────────────────

  if (!apiKey) {
    return <ApiKeyScreen onSubmit={setApiKey} />;
  }

  // ── Transcript render logic ────────────────────────────────────────────────

  const runningAgent = AGENTS.find((a) => a.id === runningAgentId);
  const lastRoundInTranscript =
    transcript.length > 0 ? transcript[transcript.length - 1].round : 0;
  const showRunningDivider =
    isRunning && runningRound !== null && runningRound > lastRoundInTranscript;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* ── Header ── */}
      <header className="shrink-0 bg-slate-950 text-white px-5 py-3.5 flex items-center justify-between shadow-xl z-10">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧠</span>
          <div>
            <h1 className="font-bold text-base leading-tight tracking-tight">ScholarMind</h1>
            <p className="text-slate-500 text-xs">Multi-Agent AI Researcher Debate Simulator</p>
          </div>
        </div>
        <button
          onClick={() => setApiKey('')}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Change API Key
        </button>
      </header>

      {/* ── Controls bar ── */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-5 py-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Topic dropdown */}
          <div className="flex-1 min-w-64">
            <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wide">
              Topic
            </label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isRunning}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700"
            >
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Rounds */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wide">
              Rounds
            </label>
            <select
              value={numRounds}
              onChange={(e) => setNumRounds(Number(e.target.value))}
              disabled={isRunning}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Start button */}
          <button
            onClick={startDebate}
            disabled={isRunning}
            className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isRunning ? (
              <>
                <svg
                  className="w-3.5 h-3.5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Round {runningRound} of {numRounds}…
              </>
            ) : transcript.length > 0 ? (
              '↺ Restart'
            ) : (
              'Start Debate'
            )}
          </button>
        </div>

        {/* Inline error */}
        {error && (
          <div className="mt-3 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={startDebate}
              className="ml-4 shrink-0 text-xs bg-red-100 hover:bg-red-200 text-red-700 font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* ── Main 3-column layout ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* LEFT: Agent cards */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3 space-y-2.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 pt-1">
            Researchers
          </p>
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              belief={beliefState[agent.id]}
              isActive={runningAgentId === agent.id}
            />
          ))}
        </aside>

        {/* CENTER: Debate transcript */}
        <main className="flex-1 overflow-y-auto px-5 py-4">
          {transcript.length === 0 && !isRunning && (
            <div className="h-full flex flex-col items-center justify-center text-center pb-16">
              <div className="text-6xl mb-4 opacity-60">💬</div>
              <h3 className="text-base font-semibold text-slate-600">No debate yet</h3>
              <p className="text-sm text-slate-400 mt-1">
                Choose a topic above and click{' '}
                <span className="font-medium text-slate-500">Start Debate</span>
              </p>
            </div>
          )}

          {(() => {
            // Render transcript grouped by round with dividers
            const elements = [];
            let lastRenderedRound = 0;

            for (const msg of transcript) {
              if (msg.round !== lastRenderedRound) {
                elements.push(
                  <RoundDivider key={`div-${msg.round}`} round={msg.round} active={false} />
                );
                lastRenderedRound = msg.round;
              }
              elements.push(<TranscriptMessage key={`${msg.agentId}-${msg.round}`} msg={msg} />);
            }

            // Running round divider (new round not yet in transcript)
            if (showRunningDivider) {
              elements.push(
                <RoundDivider
                  key={`div-running-${runningRound}`}
                  round={runningRound}
                  active={true}
                />
              );
            }

            // Thinking bubble for the active agent
            if (isRunning && runningAgent) {
              elements.push(
                <ThinkingBubble key="thinking" agent={runningAgent} />
              );
            }

            return elements;
          })()}

          <div ref={transcriptEndRef} className="h-4" />
        </main>

        {/* RIGHT: Conviction chart */}
        <aside className="w-72 shrink-0 border-l border-slate-200 bg-white overflow-y-auto flex flex-col p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Conviction Over Rounds
          </p>

          {chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="round"
                    tickFormatter={(v) => `R${v}`}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    ticks={[0, 0.25, 0.5, 0.75, 1]}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {AGENTS.map((agent) => (
                    <Line
                      key={agent.id}
                      type="monotone"
                      dataKey={agent.id}
                      stroke={agent.lineColor}
                      strokeWidth={2}
                      dot={{ r: 3.5, fill: agent.lineColor, strokeWidth: 0 }}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="mt-4 space-y-2 px-1">
                {AGENTS.map((agent) => {
                  const belief = beliefState[agent.id];
                  const orgStyle = ORG[agent.org];
                  return (
                    <div key={agent.id} className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: agent.lineColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-slate-600 truncate block">{agent.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {belief?.moved && (
                          <span className="text-xs text-amber-500">↺</span>
                        )}
                        <span className="text-xs font-mono text-slate-400 w-8 text-right">
                          {belief ? `${(belief.confidence * 100).toFixed(0)}%` : '—'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-slate-300 text-center italic">
                Chart appears after Round 1 completes
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* ── Synthesis section (below main, only when debate complete) ── */}
      {debateComplete && (
        <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4">
          <div className="max-w-4xl mx-auto">
            {!synthesis && !synthesizing && (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">
                    Debate complete — {numRounds} rounds, {AGENTS.length * numRounds} responses
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Generate a science journalist's field report on this debate.
                  </p>
                </div>
                <button
                  onClick={runSynthesis}
                  className="shrink-0 bg-slate-900 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-slate-700 active:bg-slate-800 transition-colors"
                >
                  Synthesize →
                </button>
              </div>
            )}

            {synthesizing && (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <svg
                  className="w-4 h-4 animate-spin text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Generating field report…
              </div>
            )}

            {synthesisError && (
              <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                <p className="text-sm text-red-700">{synthesisError}</p>
                <button
                  onClick={runSynthesis}
                  className="ml-4 shrink-0 text-xs bg-red-100 hover:bg-red-200 text-red-700 font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {synthesis && (
              <div className="bg-slate-950 rounded-xl p-5 text-white">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="text-lg">📰</span>
                  <div>
                    <p className="font-bold text-sm text-white leading-tight">Field Report</p>
                    <p className="text-slate-500 text-xs">
                      ScholarMind Science Correspondent · {new Date().toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {synthesis}
                </div>
                <button
                  onClick={() => setSynthesis('')}
                  className="mt-4 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ↺ Regenerate
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
