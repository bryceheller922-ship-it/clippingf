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
  const [whopKey, setWhopKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [whopStatus, setWhopStatus] = useState<WhopStatus | null>(null);
  const [checkingWhop, setCheckingWhop] = useState(false);

  const load = useCallback(async () => {
    const s = await fetch('/api/settings').then((r) => r.json());
    setWhopMasked(s.whop_api_key_masked ?? '');
    setGroqMasked(s.groq_api_key_masked ?? '');
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
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    setMsg(res.ok ? 'Saved.' : 'Save failed.');
    setWhopKey('');
    setGroqKey('');
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
          Workspace <span className="accent">Settings</span>
        </h1>
        <p>Shared by everyone who signs in to this workspace.</p>
      </div>

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
        <h2>Groq (workspace default)</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Get a free key at{' '}
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
            console.groq.com
          </a>
          . Agent containers using the Groq preset fall back to this key when they don&apos;t have
          their own, so one key powers your whole agent team.
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
          Users are configured with the <code>APP_USERS</code> env var on Vercel —{' '}
          <code>APP_USERS=&quot;bryce:secret,partner:secret2&quot;</code> gives you and your business
          partner separate logins to this shared workspace (accounts, clips, agents and settings are
          shared; the activity log shows who did what). Change it in Vercel → Settings → Environment
          Variables, then redeploy.
        </p>
      </section>
    </main>
  );
}
