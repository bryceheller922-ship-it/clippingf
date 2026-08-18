'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Problem {
  id: string;
  severity: 'error' | 'warn';
  node: string;
  title: string;
  detail: string;
  fix_hint: string;
}

interface Health {
  keys: { tiktok: boolean; groq: boolean; whop: boolean; browseruse: boolean };
  accounts: { open_id: string; display_name: string; expired: boolean }[];
  agents: { id: string; name: string; emoji: string; preset: string; model: string; enabled: boolean; tools: string[] }[];
  missions: {
    id: string;
    name: string;
    agent_id: string;
    enabled: boolean;
    running: boolean;
    runs: number;
    interval_hours: number;
    last_run_at: number;
    last_error: string;
    last_result: string;
  }[];
  clips: { total: number; ready: number; posted: number };
  problems: Problem[];
}

interface MapNode {
  id: string;
  x: number;
  y: number;
  icon: string;
  label: string;
  sub?: string;
  kind: 'hub' | 'integration' | 'account' | 'agent' | 'mission';
  state: 'ok' | 'warn' | 'error' | 'off' | 'running';
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

function buildNodes(h: Health): { nodes: MapNode[]; links: [string, string][] } {
  const problemState = (nodeId: string): 'ok' | 'warn' | 'error' => {
    const ps = h.problems.filter((p) => p.node === nodeId);
    if (ps.some((p) => p.severity === 'error')) return 'error';
    if (ps.length) return 'warn';
    return 'ok';
  };

  const nodes: MapNode[] = [];
  const links: [string, string][] = [];
  const HUB = 'hub';
  nodes.push({
    id: HUB,
    x: 50,
    y: 38,
    icon: '🎬',
    label: 'ClippingF',
    sub: `${h.clips.total} clips · ${h.clips.ready} ready`,
    kind: 'hub',
    state: h.problems.some((p) => p.severity === 'error') ? 'error' : h.problems.length ? 'warn' : 'ok'
  });

  const integrations = [
    { id: 'integration:tiktok', icon: '🎵', label: 'TikTok app', ok: h.keys.tiktok },
    { id: 'integration:groq', icon: '⚡', label: 'Groq', ok: h.keys.groq },
    { id: 'integration:whop', icon: '💰', label: 'Whop', ok: h.keys.whop },
    { id: 'integration:browseruse', icon: '🌐', label: 'Browser Use', ok: h.keys.browseruse }
  ];
  integrations.forEach((integ, i) => {
    const y = 12 + i * 22;
    nodes.push({
      id: integ.id,
      x: 11,
      y,
      icon: integ.icon,
      label: integ.label,
      sub: integ.ok ? 'key saved' : 'no key',
      kind: 'integration',
      state: problemState(integ.id) === 'ok' ? (integ.ok ? 'ok' : 'off') : problemState(integ.id)
    });
    links.push([integ.id, HUB]);
  });

  h.accounts.forEach((a, i) => {
    const id = `account:${a.open_id}`;
    const n = h.accounts.length;
    const x = 50 + (i - (n - 1) / 2) * Math.min(16, 64 / Math.max(n, 1));
    nodes.push({
      id,
      x,
      y: 78,
      icon: '🎵',
      label: `@${a.display_name}`,
      sub: a.expired ? 'expired' : 'connected',
      kind: 'account',
      state: a.expired ? 'error' : 'ok'
    });
    links.push([HUB, id]);
  });

  h.agents.forEach((ag, i) => {
    const id = `agent:${ag.id}`;
    const y = 12 + i * (76 / Math.max(h.agents.length, 1));
    nodes.push({
      id,
      x: 78,
      y,
      icon: ag.emoji || '🤖',
      label: ag.name,
      sub: `${ag.preset} · ${ag.enabled ? 'ready' : 'disabled'}`,
      kind: 'agent',
      state: problemState(id) !== 'ok' ? problemState(id) : ag.enabled ? 'ok' : 'off'
    });
    links.push([HUB, id]);

    const agentMissions = h.missions.filter((m) => m.agent_id === ag.id);
    agentMissions.forEach((m, j) => {
      const mid = `mission:${m.id}`;
      nodes.push({
        id: mid,
        x: 93,
        y: y + j * 10 - ((agentMissions.length - 1) * 10) / 2,
        icon: '🛰️',
        label: m.name,
        sub: m.running ? 'running…' : m.last_error ? 'failed' : m.enabled ? `${m.runs} runs` : 'paused',
        kind: 'mission',
        state: m.running ? 'running' : problemState(mid) !== 'ok' ? problemState(mid) : m.enabled ? 'ok' : 'off'
      });
      links.push([id, mid]);
    });
  });

  // Orphan missions (agent deleted) still need to appear.
  h.missions
    .filter((m) => !h.agents.some((a) => a.id === m.agent_id))
    .forEach((m, i) => {
      const mid = `mission:${m.id}`;
      nodes.push({
        id: mid,
        x: 93,
        y: 88 - i * 10,
        icon: '🛰️',
        label: m.name,
        sub: 'agent missing',
        kind: 'mission',
        state: 'error'
      });
      links.push([HUB, mid]);
    });

  return { nodes, links };
}

export default function OpsMap() {
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [fixerOpen, setFixerOpen] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetch('/api/health').then((r) => r.json());
      if (!data.error) setHealth(data);
    } catch {
      // transient — keep last snapshot
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, chatBusy]);

  const sendToFixer = useCallback(
    async (text: string) => {
      if (!text.trim() || chatBusy) return;
      setFixerOpen(true);
      const next: ChatMsg[] = [...chat, { role: 'user', content: text.trim() }];
      setChat(next);
      setChatInput('');
      setChatBusy(true);
      try {
        const res = await fetch('/api/doctor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next })
        });
        const data = await res.json();
        setChat([...next, { role: 'assistant', content: res.ok ? data.reply : `⚠️ ${data.error}` }]);
      } catch (e) {
        setChat([...next, { role: 'assistant', content: `⚠️ ${(e as Error).message}` }]);
      } finally {
        setChatBusy(false);
      }
    },
    [chat, chatBusy]
  );

  if (!health) {
    return (
      <main className="container">
        <div className="hero">
          <h1>
            Ops <span className="accent">Map</span>
          </h1>
        </div>
        <div className="empty">Scanning the workspace…</div>
      </main>
    );
  }

  const { nodes, links } = buildNodes(health);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const selectedNode = selected ? byId[selected] : null;
  const selectedProblems = selected ? health.problems.filter((p) => p.node === selected) : [];
  const errorCount = health.problems.filter((p) => p.severity === 'error').length;
  const warnCount = health.problems.length - errorCount;

  return (
    <main className="container container-wide">
      <div className="hero">
        <h1>
          Ops <span className="accent">Map</span>
        </h1>
        <p>
          Live view of the whole operation — integrations, accounts, agents and missions.{' '}
          {health.problems.length === 0 ? (
            <span className="tag tag-posted">all systems go</span>
          ) : (
            <>
              {errorCount > 0 && <span className="tag tag-danger">{errorCount} problem{errorCount > 1 ? 's' : ''}</span>}{' '}
              {warnCount > 0 && <span className="tag tag-whop">{warnCount} warning{warnCount > 1 ? 's' : ''}</span>}
            </>
          )}
        </p>
      </div>

      <div className="map-wrap card">
        <svg className="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          {links.map(([a, b]) => {
            const na = byId[a];
            const nb = byId[b];
            if (!na || !nb) return null;
            const bad = na.state === 'error' || nb.state === 'error';
            const active = na.state === 'running' || nb.state === 'running';
            return (
              <line
                key={`${a}-${b}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                className={`map-link ${bad ? 'bad' : ''} ${active ? 'live' : ''}`}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {nodes.map((n) => (
          <button
            key={n.id}
            className={`map-node ${n.kind} state-${n.state} ${selected === n.id ? 'selected' : ''}`}
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
            onClick={() => setSelected(selected === n.id ? null : n.id)}
          >
            {health.problems.some((p) => p.node === n.id) && (
              <span className={`map-badge ${health.problems.some((p) => p.node === n.id && p.severity === 'error') ? 'err' : 'warn'}`}>
                !
              </span>
            )}
            <span className="map-icon">{n.icon}</span>
            <span className="map-label">{n.label}</span>
            {n.sub && <span className="map-sub">{n.sub}</span>}
          </button>
        ))}
      </div>

      {selectedNode && (
        <section className="card">
          <h2>
            {selectedNode.icon} {selectedNode.label}
            <span className={`tag ${selectedNode.state === 'error' ? 'tag-danger' : selectedNode.state === 'warn' ? 'tag-whop' : 'tag-posted'}`} style={{ marginLeft: 8 }}>
              {selectedNode.state === 'running' ? 'running' : selectedNode.state}
            </span>
          </h2>
          {selected?.startsWith('mission:') && (() => {
            const m = health.missions.find((x) => `mission:${x.id}` === selected);
            if (!m) return null;
            return (
              <div style={{ marginBottom: 12 }}>
                <p className="hint">
                  Every {m.interval_hours}h · {m.runs} run{m.runs === 1 ? '' : 's'}
                  {m.last_run_at ? ` · last ${new Date(m.last_run_at).toLocaleString()}` : ''}
                </p>
                {m.last_result && <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', color: 'var(--muted)', marginTop: 8 }}>{m.last_result}</p>}
              </div>
            );
          })()}
          {selectedProblems.length === 0 ? (
            <p className="hint">No problems here.</p>
          ) : (
            selectedProblems.map((p) => (
              <div key={p.id} className={`banner ${p.severity === 'error' ? 'err' : 'ok'}`} style={{ borderColor: p.severity === 'warn' ? 'rgba(255,194,75,0.4)' : undefined, background: p.severity === 'warn' ? 'rgba(255,194,75,0.08)' : undefined }}>
                <strong>{p.title}</strong>
                <div style={{ marginTop: 4 }}>{p.detail}</div>
                <div className="hint" style={{ marginTop: 6 }}>Fix: {p.fix_hint}</div>
                <button
                  className="btn-secondary"
                  style={{ marginTop: 10 }}
                  onClick={() => sendToFixer(`Problem on my ops map: ${p.title}. Details: ${p.detail}. Walk me through fixing it.`)}
                >
                  🩺 Investigate with the Fixer
                </button>
              </div>
            ))
          )}
        </section>
      )}

      {health.problems.length > 0 && !selectedNode && (
        <section className="card">
          <h2>Problems</h2>
          {health.problems.map((p) => (
            <div className="mission" key={p.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(p.node)}>
              <div className="mission-head">
                <span className={`dot ${p.severity === 'error' ? 'fail' : 'pending'}`} />
                <div className="grow">
                  <div className="name">{p.title}</div>
                  <div className="sub">{p.fix_hint}</div>
                </div>
                <button
                  className="btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    sendToFixer(`Problem on my ops map: ${p.title}. Details: ${p.detail}. Walk me through fixing it.`);
                  }}
                >
                  🩺 Investigate
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <button className="fixer-fab" onClick={() => setFixerOpen(!fixerOpen)}>
        🩺 Fixer
      </button>

      {fixerOpen && (
        <div className="fixer-panel card">
          <h2>
            🩺 The Fixer
            <button className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setFixerOpen(false)}>
              ✕
            </button>
          </h2>
          <div className="chat-log">
            {chat.length === 0 && (
              <div className="empty">
                I can see your whole workspace — accounts, agents, missions, keys, recent errors. Ask
                me why something is failing or click “Investigate” on any problem.
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                <div className="chat-bubble">{m.content}</div>
              </div>
            ))}
            {chatBusy && (
              <div className="chat-msg assistant">
                <div className="chat-bubble">…diagnosing</div>
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="chat-input-row">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendToFixer(chatInput)}
              placeholder="Why is my mission failing?"
              disabled={chatBusy}
            />
            <button className="btn-primary" onClick={() => sendToFixer(chatInput)} disabled={chatBusy || !chatInput.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
