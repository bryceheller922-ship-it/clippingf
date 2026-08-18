'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Account {
  open_id: string;
  display_name: string;
  avatar_url: string;
  added_by?: string;
  status: 'ok' | 'reauth_needed';
}

type Stage = 'uploading' | 'processing' | 'done' | 'failed';

interface AccountResult {
  stage: Stage;
  message: string;
  publishId?: string;
}

interface ActivityEntry {
  ts: number;
  actor: string;
  action: string;
  detail?: string;
}

const PRIVACY_OPTIONS = [
  { value: 'SELF_ONLY', label: 'Private (only me)' },
  { value: 'PUBLIC_TO_EVERYONE', label: 'Public' },
  { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Friends' },
  { value: 'FOLLOWER_OF_CREATOR', label: 'Followers' }
];

const TERMINAL_OK = new Set(['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX']);

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [privacy, setPrivacy] = useState('SELF_ONLY');
  const [mode, setMode] = useState<'DIRECT_POST' | 'DRAFT'>('DIRECT_POST');
  const [disableComment, setDisableComment] = useState(false);
  const [disableDuet, setDisableDuet] = useState(false);
  const [disableStitch, setDisableStitch] = useState(false);
  const [posting, setPosting] = useState(false);
  const [globalStatus, setGlobalStatus] = useState('');
  const [results, setResults] = useState<Record<string, AccountResult>>({});
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      const accts: Account[] = data.accounts ?? [];
      setAccounts(accts);
      setSelected(new Set(accts.filter((a) => a.status === 'ok').map((a) => a.open_id)));
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const loadActivity = useCallback(() => {
    fetch('/api/activity')
      .then((r) => r.json())
      .then((d) => setActivity(d.activity ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAccounts();
    loadActivity();
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      setBanner({ kind: 'ok', text: `Connected @${params.get('connected')}` });
    } else if (params.get('error')) {
      setBanner({ kind: 'err', text: `Connection failed: ${params.get('error')}` });
    }
    if (params.get('connected') || params.get('error')) {
      window.history.replaceState({}, '', '/');
    }
  }, [loadAccounts, loadActivity]);

  function toggleAccount(a: Account) {
    if (a.status !== 'ok' || posting) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(a.open_id) ? next.delete(a.open_id) : next.add(a.open_id);
      return next;
    });
  }

  async function disconnect(openId: string) {
    await fetch('/api/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openId })
    });
    loadAccounts();
  }

  const setResult = (openId: string, r: AccountResult) =>
    setResults((prev) => ({ ...prev, [openId]: r }));

  async function pollStatus(openId: string, publishId: string, note?: string) {
    const deadline = Date.now() + 3 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch('/api/publish/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openId, publishId })
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(openId, { stage: 'failed', message: data.error ?? 'Status check failed', publishId });
        return;
      }
      if (data.status === 'FAILED') {
        setResult(openId, { stage: 'failed', message: `TikTok rejected it: ${data.fail_reason ?? 'unknown reason'}`, publishId });
        return;
      }
      if (TERMINAL_OK.has(data.status)) {
        const base = data.status === 'SEND_TO_USER_INBOX'
          ? 'Sent to TikTok inbox — open the app to finish posting'
          : 'Published!';
        setResult(openId, { stage: 'done', message: note ? `${base} (${note})` : base, publishId });
        return;
      }
      setResult(openId, { stage: 'processing', message: `TikTok processing… (${data.status})`, publishId });
    }
    setResult(openId, {
      stage: 'processing',
      message: 'Still processing — check the TikTok app in a few minutes',
      publishId
    });
  }

  async function post() {
    if (!file || selected.size === 0 || posting) return;
    setPosting(true);
    setResults({});
    setBanner(null);

    const targets = accounts.filter((a) => selected.has(a.open_id));
    try {
      setGlobalStatus(`Uploading ${file.name} (${(file.size / 1e6).toFixed(1)} MB)…`);
      const { upload } = await import('@vercel/blob/client');
      const blob = await upload(`videos/${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/blob-upload'
      });

      // Every upload becomes a library clip so it can be reposted and tracked on Whop.
      const clipRes = await fetch('/api/clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || file.name, filename: file.name, blobUrl: blob.url, size: file.size })
      });
      const clipData = await clipRes.json();
      if (!clipRes.ok) throw new Error(clipData.error ?? 'Failed to save clip to library');
      const clipId = clipData.clip.id as string;

      setGlobalStatus(`Sending to ${targets.length} account${targets.length > 1 ? 's' : ''}…`);
      for (const a of targets) {
        setResult(a.open_id, { stage: 'uploading', message: 'Uploading to TikTok…' });
      }

      await Promise.allSettled(
        targets.map(async (a) => {
          try {
            const res = await fetch('/api/publish', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                openId: a.open_id,
                videoUrl: blob.url,
                videoSize: file.size,
                title,
                privacyLevel: privacy,
                mode,
                clipId,
                disableComment,
                disableDuet,
                disableStitch
              })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setResult(a.open_id, { stage: 'processing', message: 'Uploaded — waiting for TikTok…', publishId: data.publishId });
            await pollStatus(a.open_id, data.publishId, data.note);
          } catch (e) {
            setResult(a.open_id, { stage: 'failed', message: (e as Error).message });
          }
        })
      );
      setGlobalStatus('');
      loadActivity();
    } catch (e) {
      setBanner({ kind: 'err', text: `Upload failed: ${(e as Error).message}` });
      setGlobalStatus('');
    } finally {
      setPosting(false);
    }
  }

  const canPost = !!file && selected.size > 0 && !posting;

  return (
    <main className="container">
      <div className="hero">
        <h1>
          Post <span className="accent">everywhere</span>
        </h1>
        <p>Upload once — post to every connected TikTok. Clips are saved to the shared Library for reposting and Whop tracking.</p>
      </div>

      {banner && <div className={`banner ${banner.kind}`}>{banner.text}</div>}

      <section className="card">
        <h2>
          <span className="step">1</span> Accounts
        </h2>
        {loadingAccounts ? (
          <div className="empty">Loading accounts…</div>
        ) : accounts.length === 0 ? (
          <div className="empty">No TikTok accounts connected yet.</div>
        ) : (
          <div className="accounts">
            {accounts.map((a) => (
              <div
                key={a.open_id}
                className={`account ${selected.has(a.open_id) ? 'selected' : ''} ${a.status === 'reauth_needed' ? 'reauth' : ''}`}
                onClick={() => toggleAccount(a)}
              >
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
                <button
                  className="btn-ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    disconnect(a.open_id);
                  }}
                >
                  Disconnect
                </button>
                <div className="check">{selected.has(a.open_id) ? '✓' : ''}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <button className="btn-secondary" onClick={() => (window.location.href = '/api/auth/tiktok')}>
            + Connect TikTok account
          </button>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Accounts are shared with everyone in this workspace. To add another TikTok account, use
          “switch account” on TikTok’s login screen (or log out of tiktok.com first).
        </p>
      </section>

      <section className="card">
        <h2>
          <span className="step">2</span> Video
        </h2>
        <div
          className={`dropzone ${dragging ? 'drag' : ''}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
          }}
        >
          {file ? (
            <>
              Selected: <div className="filename">{file.name} · {(file.size / 1e6).toFixed(1)} MB</div>
            </>
          ) : (
            <>Drop a video here or click to browse (MP4 / MOV / WebM, up to 4GB)</>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            hidden
            onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
          />
        </div>

        <div className="mode-tabs">
          <button className={mode === 'DIRECT_POST' ? 'active' : ''} onClick={() => setMode('DIRECT_POST')} disabled={posting}>
            Post directly
          </button>
          <button className={mode === 'DRAFT' ? 'active' : ''} onClick={() => setMode('DRAFT')} disabled={posting}>
            Send as draft (finish in app)
          </button>
        </div>

        {mode === 'DIRECT_POST' && (
          <>
            <label className="field">
              <span className="label">Caption</span>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={2200}
                placeholder="Write a caption… #hashtags work too (or ask an Agent to write one)"
                disabled={posting}
              />
            </label>
            <div className="row" style={{ marginBottom: 16 }}>
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="label">Who can view</span>
                <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} disabled={posting}>
                  {PRIVACY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="toggles">
              <label>
                <input type="checkbox" checked={disableComment} onChange={(e) => setDisableComment(e.target.checked)} disabled={posting} />
                Disable comments
              </label>
              <label>
                <input type="checkbox" checked={disableDuet} onChange={(e) => setDisableDuet(e.target.checked)} disabled={posting} />
                Disable duet
              </label>
              <label>
                <input type="checkbox" checked={disableStitch} onChange={(e) => setDisableStitch(e.target.checked)} disabled={posting} />
                Disable stitch
              </label>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>
          <span className="step">3</span> Post
        </h2>
        <button className="btn-primary btn-big" onClick={post} disabled={!canPost}>
          {posting
            ? globalStatus || 'Working…'
            : `Post to ${selected.size} account${selected.size === 1 ? '' : 's'}`}
        </button>

        {Object.keys(results).length > 0 && (
          <div className="results">
            {accounts
              .filter((a) => results[a.open_id])
              .map((a) => {
                const r = results[a.open_id];
                const dot = r.stage === 'done' ? 'ok' : r.stage === 'failed' ? 'fail' : 'pending';
                return (
                  <div className="result" key={a.open_id}>
                    <span className={`dot ${dot}`} />
                    <strong>{a.display_name}</strong>
                    <span className="msg">{r.message}</span>
                  </div>
                );
              })}
          </div>
        )}

        <p className="hint" style={{ marginTop: 14 }}>
          Until your TikTok developer app passes TikTok&apos;s audit, direct posts are forced to{' '}
          <strong>Private (only me)</strong> and only test accounts can connect. After posting, grab
          each post&apos;s URL and track it against a Whop campaign in the <a href="/library">Library</a>.
        </p>
      </section>

      {activity.length > 0 && (
        <section className="card">
          <h2>Recent activity</h2>
          <div className="activity">
            {activity.slice(0, 12).map((e, i) => (
              <div className="activity-row" key={i}>
                <span className="actor">{e.actor}</span>
                <span className="msg">{e.detail ?? e.action}</span>
                <span className="time">{new Date(e.ts).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
