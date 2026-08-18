'use client';

import { useCallback, useEffect, useState } from 'react';

interface WhopStatus {
  connected: boolean;
  reason?: string;
  company?: { id: string; title?: string; route?: string };
  payments?: { id: string; final_amount?: number; currency?: string; status?: string }[];
}

export default function Settings() {
  const [whopMasked, setWhopMasked] = useState('');
  const [groqMasked, setGroqMasked] = useState('');
  const [buMasked, setBuMasked] = useState('');
  const [ttKeyMasked, setTtKeyMasked] = useState('');
  const [ttSecretMasked, setTtSecretMasked] = useState('');
  const [whopKey, setWhopKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [buKey, setBuKey] = useState('');
  const [ttKey, setTtKey] = useState('');
  const [ttSecret, setTtSecret] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [whopStatus, setWhopStatus] = useState<WhopStatus | null>(null);
  const [checkingWhop, setCheckingWhop] = useState(false);

  const load = useCallback(async () => {
    const s = await fetch('/api/settings').then((r) => r.json());
    setWhopMasked(s.whop_api_key_masked ?? '');
    setGroqMasked(s.groq_api_key_masked ?? '');
    setBuMasked(s.browseruse_api_key_masked ?? '');
    setTtKeyMasked(s.tiktok_client_key_masked ?? '');
    setTtSecretMasked(s.tiktok_client_secret_masked ?? '');
    setHashtags(s.default_hashtags ?? '');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMsg('');
    const patch: Record<string, string> = { default_hashtags: hashtags };
    if (whopKey) patch.whop_api_key = whopKey;
    if (groqKey) patch.groq_api_key = groqKey;
    if (buKey) patch.browseruse_api_key = buKey;
    if (ttKey) patch.tiktok_client_key = ttKey;
    if (ttSecret) patch.tiktok_client_secret = ttSecret;
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    setMsg(res.ok ? 'Saved.' : 'Save failed.');
    setWhopKey('');
    setGroqKey('');
    setBuKey('');
    setTtKey('');
    setTtSecret('');
    setSaving(false);
    load();
  }

  async function checkWhop() {
    setCheckingWhop(true);
    setWhopStatus(null);
    try {
      setWhopStatus(await fetch('/api/whop/status').then((r) => r.json()));
    } finally {
      setCheckingWhop(false);
    }
  }

  return (
    <main className="container">
      <div className="hero">
        <h1>
          My <span className="accent">API keys</span>
        </h1>
        <p>
          Your personal keys — each workspace member saves their own here. Agents and tools use the
          keys of whoever triggers them (missions use their creator&apos;s keys).
        </p>
      </div>

      <section className="card">
        <h2>TikTok developer app</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Create an app at{' '}
          <a href="https://developers.tiktok.com" target="_blank" rel="noreferrer">
            developers.tiktok.com
          </a>{' '}
          with <strong>Login Kit</strong> + <strong>Content Posting API</strong>, redirect URI{' '}
          <code>https://&lt;this-domain&gt;/api/auth/callback</code>, and scopes{' '}
          <code>user.info.basic</code>, <code>video.upload</code>, <code>video.publish</code>. Then
          paste its credentials here — connecting TikTok accounts and refreshing their tokens uses{' '}
          <em>your</em> app credentials.
        </p>
        <div className="row">
          <label className="field">
            <span className="label">Client key {ttKeyMasked && `(saved: ${ttKeyMasked})`}</span>
            <input
              type="password"
              className="pw"
              value={ttKey}
              onChange={(e) => setTtKey(e.target.value)}
              placeholder={ttKeyMasked ? 'Enter a new key to replace' : 'aw…'}
            />
          </label>
          <label className="field">
            <span className="label">Client secret {ttSecretMasked && `(saved: ${ttSecretMasked})`}</span>
            <input
              type="password"
              className="pw"
              value={ttSecret}
              onChange={(e) => setTtSecret(e.target.value)}
              placeholder={ttSecretMasked ? 'Enter a new secret to replace' : ''}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Whop</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Paste a Whop API key (from{' '}
          <a href="https://whop.com/dashboard/developer" target="_blank" rel="noreferrer">
            whop.com → Developer
          </a>
          ) to link your Whop company — used to verify the connection and pull payment data if your
          key allows it. Heads-up: <strong>Whop has no public API for Content Rewards clip
          submissions</strong>, so submitting a posted clip to a campaign happens on the Whop page —
          the Library tracks campaign URL, submitted URL, views and earnings per clip, and your
          agents can read/update that tracking.
        </p>
        <label className="field">
          <span className="label">Whop API key {whopMasked && `(saved: ${whopMasked})`}</span>
          <input
            type="password"
            className="pw"
            value={whopKey}
            onChange={(e) => setWhopKey(e.target.value)}
            placeholder={whopMasked ? 'Enter a new key to replace' : 'whop_…'}
          />
        </label>
        <button className="btn-secondary" onClick={checkWhop} disabled={checkingWhop}>
          {checkingWhop ? 'Checking…' : 'Test Whop connection'}
        </button>
        {whopStatus && (
          <div className={`banner ${whopStatus.connected ? 'ok' : 'err'}`} style={{ marginTop: 12 }}>
            {whopStatus.connected ? (
              <>
                Connected to <strong>{whopStatus.company?.title ?? whopStatus.company?.id}</strong>
                {whopStatus.payments && whopStatus.payments.length > 0 && (
                  <> · {whopStatus.payments.length} recent payment{whopStatus.payments.length > 1 ? 's' : ''} visible</>
                )}
              </>
            ) : (
              <>Not connected: {whopStatus.reason}</>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Groq</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Get a free key at{' '}
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
            console.groq.com
          </a>
          . Agent containers using the Groq preset fall back to your key when they don&apos;t carry
          their own.
        </p>
        <label className="field">
          <span className="label">Groq API key {groqMasked && `(saved: ${groqMasked})`}</span>
          <input
            type="password"
            className="pw"
            value={groqKey}
            onChange={(e) => setGroqKey(e.target.value)}
            placeholder={groqMasked ? 'Enter a new key to replace' : 'gsk_…'}
          />
        </label>
      </section>

      <section className="card">
        <h2>Browser agent (Browser Use)</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Give agents a real cloud browser: add a{' '}
          <a href="https://cloud.browser-use.com" target="_blank" rel="noreferrer">
            Browser Use Cloud
          </a>{' '}
          API key, then enable the <strong>browser_task</strong> permission on an agent. For tasks
          that need a login (like submitting clips to a Whop campaign), create a <em>profile</em> in
          the Browser Use dashboard, sign in to the site inside that profile once, and tell your
          agent to use it — the session persists across tasks. Note: automating TikTok itself via
          browser is against TikTok&apos;s terms and their bot detection often blocks it — use the
          built-in API posting for TikTok and the browser agent for Whop submissions and other web
          chores.
        </p>
        <label className="field">
          <span className="label">Browser Use API key {buMasked && `(saved: ${buMasked})`}</span>
          <input
            type="password"
            className="pw"
            value={buKey}
            onChange={(e) => setBuKey(e.target.value)}
            placeholder={buMasked ? 'Enter a new key to replace' : 'bu_…'}
          />
        </label>
      </section>

      <section className="card">
        <h2>Defaults</h2>
        <label className="field">
          <span className="label">Default hashtags (appended ideas for captions)</span>
          <input
            type="text"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#fyp #clips #viral"
          />
        </label>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {msg && <span className="hint" style={{ marginLeft: 12 }}>{msg}</span>}
      </section>

      <section className="card">
        <h2>Team access</h2>
        <p className="hint">
          Sign-in is Firebase Auth (email/password or Google). Who can join the workspace is
          controlled by the <code>ALLOWED_EMAILS</code> env var on Vercel — e.g.{' '}
          <code>ALLOWED_EMAILS=&quot;you@gmail.com,partner@gmail.com&quot;</code>. Accounts, clips,
          agents and missions are shared; API keys on this page are per-person; the activity log
          shows who did what.
        </p>
      </section>
    </main>
  );
}
