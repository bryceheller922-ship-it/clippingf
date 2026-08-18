'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Agent {
  id: string;
  name: string;
  emoji: string;
  preset: string;
  protocol: string;
  base_url: string;
  model: string;
  system_prompt: string;
  tools: string[];
  temperature: number;
  enabled: boolean;
  has_key: boolean;
  created_by: string;
}

interface Preset {
  label: string;
  protocol: string;
  base_url: string;
  default_model: string;
}

interface ToolInfo {
  name: string;
  description: string;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  trace?: { tool: string }[];
}

const DANGEROUS_TOOLS = new Set(['post_clip', 'browser_task']);

interface Mission {
  id: string;
  name: string;
  goal: string;
  agent_id: string;
  enabled: boolean;
  interval_hours: number;
  last_run_at: number;
  last_result: string;
  last_error: string;
  runs: number;
  created_by: string;
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);

  // form state
  const [fName, setFName] = useState('');
  const [fEmoji, setFEmoji] = useState('🤖');
  const [fPreset, setFPreset] = useState('groq');
  const [fBaseUrl, setFBaseUrl] = useState('');
  const [fModel, setFModel] = useState('');
  const [fKey, setFKey] = useState('');
  const [fPrompt, setFPrompt] = useState('');
  const [fTools, setFTools] = useState<Set<string>>(new Set());
  const [fError, setFError] = useState('');
  const [saving, setSaving] = useState(false);

  // missions state
  const [missions, setMissions] = useState<Mission[]>([]);
  const [mName, setMName] = useState('');
  const [mGoal, setMGoal] = useState('');
  const [mAgent, setMAgent] = useState('');
  const [mInterval, setMInterval] = useState(24);
  const [mBusy, setMBusy] = useState(false);
  const [runningMission, setRunningMission] = useState<string | null>(null);
  const [openMission, setOpenMission] = useState<string | null>(null);

  // chat state
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, m] = await Promise.all([
        fetch('/api/agents').then((r) => r.json()),
        fetch('/api/missions').then((r) => r.json())
      ]);
      setAgents(data.agents ?? []);
      setPresets(data.presets ?? {});
      setTools(data.available_tools ?? []);
      setMissions(m.missions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  async function createMission() {
    if (!mName.trim() || !mGoal.trim() || !mAgent) return;
    setMBusy(true);
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: mName, goal: mGoal, agent_id: mAgent, interval_hours: mInterval })
      });
      if (res.ok) {
        setMName('');
        setMGoal('');
        load();
      }
    } finally {
      setMBusy(false);
    }
  }

  async function patchMission(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/missions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    load();
  }

  async function deleteMissionUi(m: Mission) {
    if (!confirm(`Delete mission "${m.name}"?`)) return;
    await fetch(`/api/missions/${m.id}`, { method: 'DELETE' });
    load();
  }

  async function runMissionNow(m: Mission) {
    setRunningMission(m.id);
    try {
      await fetch(`/api/missions/${m.id}/run`, { method: 'POST' });
    } finally {
      setRunningMission(null);
      setOpenMission(m.id);
      load();
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, chatBusy]);

  function openCreate(preset = 'groq') {
    setEditing(null);
    setFName(preset === 'groq' ? 'Groq Manager' : '');
    setFEmoji(preset === 'groq' ? '⚡' : '🤖');
    setFPreset(preset);
    setFBaseUrl('');
    setFModel('');
    setFKey('');
    setFPrompt(
      'You manage this clipping operation: keep the clip library organized, write scroll-stopping captions with strong hooks and hashtags, and track Whop campaign submissions and earnings.'
    );
    setFTools(new Set(tools.map((t) => t.name).filter((n) => !DANGEROUS_TOOLS.has(n))));
    setFError('');
    setShowForm(true);
  }

  function openEdit(a: Agent) {
    setEditing(a);
    setFName(a.name);
    setFEmoji(a.emoji);
    setFPreset(a.preset);
    setFBaseUrl(a.base_url);
    setFModel(a.model);
    setFKey('');
    setFPrompt(a.system_prompt);
    setFTools(new Set(a.tools));
    setFError('');
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    setFError('');
    try {
      const payload = {
        name: fName,
        emoji: fEmoji,
        preset: fPreset,
        base_url: fBaseUrl,
        model: fModel,
        api_key: fKey,
        system_prompt: fPrompt,
        tools: [...fTools]
      };
      const res = await fetch(editing ? `/api/agents/${editing.id}` : '/api/agents', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setShowForm(false);
      load();
    } catch (e) {
      setFError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeAgent(a: Agent) {
    if (!confirm(`Delete agent "${a.name}"?`)) return;
    await fetch(`/api/agents/${a.id}`, { method: 'DELETE' });
    if (chatAgent?.id === a.id) setChatAgent(null);
    load();
  }

  function openChat(a: Agent) {
    setChatAgent(a);
    setChat([]);
    setChatInput('');
  }

  async function send() {
    if (!chatAgent || !chatInput.trim() || chatBusy) return;
    const next: ChatMsg[] = [...chat, { role: 'user', content: chatInput.trim() }];
    setChat(next);
    setChatInput('');
    setChatBusy(true);
    try {
      const res = await fetch(`/api/agents/${chatAgent.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Agent call failed');
      setChat([...next, { role: 'assistant', content: data.reply, trace: data.trace }]);
    } catch (e) {
      setChat([...next, { role: 'assistant', content: `⚠️ ${(e as Error).message}` }]);
    } finally {
      setChatBusy(false);
    }
  }

  const preset = presets[fPreset];

  return (
    <main className="container">
      <div className="hero">
        <h1>
          Agent <span className="accent">Containers</span>
        </h1>
        <p>
          Plug in any AI API — Groq, OpenAI, OpenRouter, Anthropic, or any OpenAI-compatible endpoint.
          Each container gets its own role, model, and permissions over the workspace.
        </p>
      </div>

      {loading ? (
        <div className="empty">Loading agents…</div>
      ) : (
        <>
          <div className="agent-grid">
            {agents.map((a) => (
              <div className={`card agent-card ${!a.enabled ? 'disabled' : ''}`} key={a.id}>
                <div className="agent-top">
                  <span className="agent-emoji">{a.emoji}</span>
                  <div className="grow">
                    <div className="name">{a.name}</div>
                    <div className="sub">
                      {presets[a.preset]?.label ?? a.preset} · {a.model}
                    </div>
                  </div>
                </div>
                <div className="agent-tools-row">
                  {!a.tools.includes('post_clip') && !a.tools.includes('browser_task') && (
                    <span className="tag">advisor</span>
                  )}
                  {a.tools.includes('post_clip') && <span className="tag tag-danger">can post</span>}
                  {a.tools.includes('browser_task') && <span className="tag tag-danger">can browse</span>}
                  <span className="tag">{a.tools.length} tools</span>
                </div>
                <div className="agent-actions">
                  <button className="btn-primary" onClick={() => openChat(a)}>
                    Chat
                  </button>
                  <button className="btn-secondary" onClick={() => openEdit(a)}>
                    Edit
                  </button>
                  <button className="btn-ghost" onClick={() => removeAgent(a)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}

            <div className="card agent-card add-card" onClick={() => openCreate(agents.length === 0 ? 'groq' : 'custom')}>
              <span className="agent-emoji">＋</span>
              <div className="name">New agent container</div>
              <div className="sub">{agents.length === 0 ? 'Start with a Groq manager' : 'Any provider or custom endpoint'}</div>
            </div>
          </div>

          <section className="card" style={{ marginTop: 22 }}>
            <h2>🛰️ Autopilot missions</h2>
            <p className="hint" style={{ marginBottom: 14 }}>
              Give an agent a standing goal and it runs on a schedule (Vercel Cron) — e.g. “check
              our Whop campaigns, pick the best ready clips, post them to all TikTok accounts, then
              submit the posted URLs to the campaign via browser and update tracking.” Each run
              picks up where the last one left off. Missions use the enabled tools of their agent —
              give it <strong>post_clip</strong> and <strong>browser_task</strong> for full
              automation.
            </p>

            {missions.map((m) => {
              const agent = agents.find((a) => a.id === m.agent_id);
              return (
                <div className="mission" key={m.id}>
                  <div className="mission-head" onClick={() => setOpenMission(openMission === m.id ? null : m.id)}>
                    <span className={`dot ${m.last_error ? 'fail' : m.runs > 0 ? 'ok' : 'pending'}`} />
                    <div className="grow">
                      <div className="name">{m.name}</div>
                      <div className="sub">
                        {agent ? `${agent.emoji} ${agent.name}` : '⚠️ agent missing'} · every {m.interval_hours}h ·{' '}
                        {m.runs > 0 ? `${m.runs} runs, last ${new Date(m.last_run_at).toLocaleString()}` : 'never run'}
                        {!m.enabled && ' · paused'}
                      </div>
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        runMissionNow(m);
                      }}
                      disabled={runningMission === m.id}
                    >
                      {runningMission === m.id ? 'Running…' : 'Run now'}
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        patchMission(m.id, { enabled: !m.enabled });
                      }}
                    >
                      {m.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMissionUi(m);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  {openMission === m.id && (
                    <div className="mission-body">
                      <div className="sub" style={{ marginBottom: 8 }}>Goal</div>
                      <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{m.goal}</p>
                      {m.last_error && <div className="banner err">Last run failed: {m.last_error}</div>}
                      {m.last_result && (
                        <>
                          <div className="sub" style={{ marginBottom: 8 }}>Last report</div>
                          <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>{m.last_result}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="mission-form">
              <div className="row">
                <label className="field">
                  <span className="label">Mission name</span>
                  <input type="text" value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Whop pipeline" />
                </label>
                <label className="field">
                  <span className="label">Agent</span>
                  <select value={mAgent} onChange={(e) => setMAgent(e.target.value)}>
                    <option value="">Pick an agent…</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.emoji} {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ maxWidth: 140, minWidth: 140 }}>
                  <span className="label">Every (hours)</span>
                  <select value={mInterval} onChange={(e) => setMInterval(Number(e.target.value))}>
                    {[1, 3, 6, 12, 24, 48, 168].map((h) => (
                      <option key={h} value={h}>
                        {h}h
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span className="label">Goal (what should the agent do each run?)</span>
                <textarea
                  value={mGoal}
                  onChange={(e) => setMGoal(e.target.value)}
                  placeholder="Check the clip library for ready clips, write captions, post them to all TikTok accounts, then use the browser (whop profile) to submit posted URLs to our campaign at https://whop.com/… and update each clip's Whop tracking."
                />
              </label>
              <button className="btn-primary" onClick={createMission} disabled={mBusy || !mName.trim() || !mGoal.trim() || !mAgent}>
                {mBusy ? 'Creating…' : 'Create mission'}
              </button>
            </div>
          </section>
        </>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? `Edit ${editing.name}` : 'New agent container'}</h2>
            {fError && <div className="banner err">{fError}</div>}
            <div className="row">
              <label className="field">
                <span className="label">Name</span>
                <input type="text" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Caption Writer" />
              </label>
              <label className="field" style={{ maxWidth: 90, minWidth: 90 }}>
                <span className="label">Emoji</span>
                <input type="text" value={fEmoji} onChange={(e) => setFEmoji(e.target.value)} />
              </label>
            </div>
            <div className="row">
              <label className="field">
                <span className="label">Provider</span>
                <select value={fPreset} onChange={(e) => setFPreset(e.target.value)} disabled={!!editing}>
                  {Object.entries(presets).map(([k, p]) => (
                    <option key={k} value={k}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">Model</span>
                <input
                  type="text"
                  value={fModel}
                  onChange={(e) => setFModel(e.target.value)}
                  placeholder={preset?.default_model || 'model id'}
                />
              </label>
            </div>
            {(fPreset === 'custom' || fBaseUrl) && (
              <label className="field">
                <span className="label">Base URL (OpenAI-compatible)</span>
                <input
                  type="text"
                  value={fBaseUrl}
                  onChange={(e) => setFBaseUrl(e.target.value)}
                  placeholder={preset?.base_url || 'https://api.example.com/v1'}
                />
              </label>
            )}
            <label className="field">
              <span className="label">
                API key{' '}
                {editing?.has_key
                  ? '(leave blank to keep current)'
                  : fPreset === 'groq'
                    ? '(optional — falls back to the workspace Groq key in Settings)'
                    : ''}
              </span>
              <input type="password" className="pw" value={fKey} onChange={(e) => setFKey(e.target.value)} placeholder="sk-…" />
            </label>
            <label className="field">
              <span className="label">Role / system prompt</span>
              <textarea value={fPrompt} onChange={(e) => setFPrompt(e.target.value)} />
            </label>
            <div className="field">
              <span className="label">Permissions (platform tools this agent may use)</span>
              <div className="tool-grid">
                {tools.map((t) => (
                  <label key={t.name} className={`tool-pill ${fTools.has(t.name) ? 'on' : ''} ${DANGEROUS_TOOLS.has(t.name) ? 'danger' : ''}`} title={t.description}>
                    <input
                      type="checkbox"
                      checked={fTools.has(t.name)}
                      onChange={() =>
                        setFTools((prev) => {
                          const next = new Set(prev);
                          next.has(t.name) ? next.delete(t.name) : next.add(t.name);
                          return next;
                        })
                      }
                    />
                    {t.name}
                  </label>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 6 }}>
                <strong>post_clip</strong> lets the agent publish to your TikTok accounts, and{' '}
                <strong>browser_task</strong> lets it drive a real browser (with your saved logins if
                you pass a profile) — enable these only for agents you trust to act.
              </p>
            </div>
            <button className="btn-primary btn-big" onClick={save} disabled={saving || !fName || (!fModel && !preset?.default_model)}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create agent'}
            </button>
            <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {chatAgent && (
        <div className="modal-backdrop" onClick={() => !chatBusy && setChatAgent(null)}>
          <div className="modal card chat-modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {chatAgent.emoji} {chatAgent.name}
              <span className="sub" style={{ fontWeight: 400, marginLeft: 8 }}>
                {chatAgent.model}
              </span>
            </h2>
            <div className="chat-log">
              {chat.length === 0 && (
                <div className="empty">
                  Ask for captions, a posting plan, library cleanup, or Whop tracking updates. Try:
                  “list my clips and suggest which to submit to Whop”.
                </div>
              )}
              {chat.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role}`}>
                  {m.trace && m.trace.length > 0 && (
                    <div className="chat-trace">🔧 used: {[...new Set(m.trace.map((t) => t.tool))].join(', ')}</div>
                  )}
                  <div className="chat-bubble">{m.content}</div>
                </div>
              ))}
              {chatBusy && <div className="chat-msg assistant"><div className="chat-bubble">…thinking</div></div>}
              <div ref={chatEnd} />
            </div>
            <div className="chat-input-row">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder={`Message ${chatAgent.name}…`}
                disabled={chatBusy}
              />
              <button className="btn-primary" onClick={send} disabled={chatBusy || !chatInput.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
