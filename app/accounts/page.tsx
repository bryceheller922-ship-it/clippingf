'use client';

import { useCallback, useEffect, useState } from 'react';

interface Account {
  open_id: string;
  display_name: string;
  avatar_url: string;
  added_by?: string;
  status: 'ok' | 'reauth_needed';
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/accounts').then((r) => r.json());
      setAccounts(data.accounts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) setBanner({ kind: 'ok', text: `Connected @${params.get('connected')}` });
    else if (params.get('error')) setBanner({ kind: 'err', text: `Connection failed: ${params.get('error')}` });
    if (params.get('connected') || params.get('error')) window.history.replaceState({}, '', '/accounts');
  }, [load]);

  async function disconnect(openId: string) {
    if (!confirm('Disconnect this TikTok account from the workspace?')) return;
    await fetch('/api/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openId })
    });
    load();
  }

  return (
    <main className="container">
      <div className="hero">
        <h1>
          Connected <span className="accent">Accounts</span>
        </h1>
        <p>TikTok accounts shared by the whole workspace — post to any of them from the Post page or the Library.</p>
      </div>

      {banner && <div className={`banner ${banner.kind}`}>{banner.text}</div>}

      <section className="card">
        {loading ? (
          <div className="empty">Loading accounts…</div>
        ) : accounts.length === 0 ? (
          <div className="empty">No TikTok accounts connected yet.</div>
        ) : (
          <div className="accounts">
            {accounts.map((a) => (
              <div key={a.open_id} className={`account ${a.status === 'reauth_needed' ? 'reauth' : ''}`}>
                {a.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.avatar_url} alt="" />
                ) : (
                  <div className="avatar-fallback">🎵</div>
                )}
                <div className="grow">
                  <div className="name">{a.display_name}</div>
                  <div className="sub">
                    {a.status === 'reauth_needed'
                      ? 'Session expired — reconnect this account'
                      : a.added_by
                        ? `added by ${a.added_by}`
                        : ''}
                  </div>
                </div>
                <button className="btn-ghost" onClick={() => disconnect(a.open_id)}>
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <button className="btn-primary" onClick={() => (window.location.href = '/api/auth/tiktok')}>
            + Connect TikTok account
          </button>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          To add another TikTok account, use “switch account” on TikTok’s login screen (or log out of
          tiktok.com first). Until your TikTok developer app passes audit, only test accounts added
          in the developer portal can connect. Instagram/other platforms don&apos;t have official
          multi-post APIs wired in yet — agents can reach them through the browser tool.
        </p>
      </section>
    </main>
  );
}
