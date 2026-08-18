'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Account {
  open_id: string;
  display_name: string;
  avatar_url: string;
  status: 'ok' | 'reauth_needed';
}

interface VideoDraft {
  key: string;
  file: File;
  caption: string;
  accounts: Set<string>;
}

type Stage = 'uploading' | 'processing' | 'done' | 'failed';

interface PostResult {
  stage: Stage;
  message: string;
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
  const [videos, setVideos] = useState<VideoDraft[]>([]);
  const [privacy, setPrivacy] = useState('SELF_ONLY');
  const [mode, setMode] = useState<'DIRECT_POST' | 'DRAFT'>('DIRECT_POST');
  const [posting, setPosting] = useState(false);
  const [results, setResults] = useState<Record<string, PostResult>>({});
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const okAccounts = accounts.filter((a) => a.status === 'ok');

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const data = await fetch('/api/accounts').then((r) => r.json());
      setAccounts(data.accounts ?? []);
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
  }, [loadAccounts, loadActivity]);

  function addFiles(files: FileList | File[] | null | undefined) {
    if (!files) return;
    const all = okAccounts.map((a) => a.open_id);
    setVideos((prev) => [
      ...prev,
      ...Array.from(files).map((file) => ({
        key: crypto.randomUUID(),
        file,
        caption: '',
        accounts: new Set(all)
      }))
    ]);
  }

  function toggleVideoAccount(videoKey: string, openId: string) {
    if (posting) return;
    setVideos((prev) =>
      prev.map((v) => {
        if (v.key !== videoKey) return v;
        const next = new Set(v.accounts);
        next.has(openId) ? next.delete(openId) : next.add(openId);
        return { ...v, accounts: next };
      })
    );
  }

  const setResult = (key: string, r: PostResult) => setResults((prev) => ({ ...prev, [key]: r }));

  async function pollStatus(rKey: string, openId: string, publishId: string, note?: string) {
    const deadline = Date.now() + 3 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch('/api/publish/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openId, publishId })
      });
      const data = await res.json();
      if (!res.ok) return setResult(rKey, { stage: 'failed', message: data.error ?? 'Status check failed' });
      if (data.status === 'FAILED') {
        return setResult(rKey, { stage: 'failed', message: `TikTok rejected it: ${data.fail_reason ?? 'unknown'}` });
      }
      if (TERMINAL_OK.has(data.status)) {
        const base = data.status === 'SEND_TO_USER_INBOX' ? 'In TikTok inbox — finish in app' : 'Published!';
        return setResult(rKey, { stage: 'done', message: note ? `${base} (${note})` : base });
      }
      setResult(rKey, { stage: 'processing', message: `TikTok processing… (${data.status})` });
    }
    setResult(rKey, { stage: 'processing', message: 'Still processing — check the TikTok app soon' });
  }

  async function postAll() {
    const targets = videos.filter((v) => v.accounts.size > 0);
    if (targets.length === 0 || posting) return;
    setPosting(true);
    setResults({});
    setBanner(null);

    await Promise.allSettled(
      targets.map(async (v) => {
        const baseKey = v.key;
        try {
          setResult(baseKey, { stage: 'uploading', message: `Uploading ${v.file.name}…` });
          const signRes = await fetch('/api/storage/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: v.file.name })
          });
          const sign = await signRes.json();
          if (!signRes.ok) throw new Error(sign.error ?? 'Could not get upload URL');

          const put = await fetch(sign.signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': v.file.type || 'video/mp4' },
            body: v.file
          });
          if (!put.ok) throw new Error(`Storage upload failed (HTTP ${put.status})`);

          const clipRes = await fetch('/api/clips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: v.caption || v.file.name,
              filename: v.file.name,
              blobUrl: sign.publicUrl,
              size: v.file.size
            })
          });
          const clipData = await clipRes.json();
          if (!clipRes.ok) throw new Error(clipData.error ?? 'Failed to save clip');
          setResult(baseKey, { stage: 'done', message: 'Uploaded to library' });

          await Promise.allSettled(
            [...v.accounts].map(async (openId) => {
              const rKey = `${v.key}:${openId}`;
              setResult(rKey, { stage: 'uploading', message: 'Sending to TikTok…' });
              try {
                const res = await fetch('/api/publish', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    openId,
                    videoUrl: sign.publicUrl,
                    videoSize: v.file.size,
                    title: v.caption,
                    privacyLevel: privacy,
                    mode,
                    clipId: clipData.clip.id
                  })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                setResult(rKey, { stage: 'processing', message: 'Waiting for TikTok…' });
                await pollStatus(rKey, openId, data.publishId, data.note);
              } catch (e) {
                setResult(rKey, { stage: 'failed', message: (e as Error).message });
              }
            })
          );
        } catch (e) {
          setResult(baseKey, { stage: 'failed', message: (e as Error).message });
        }
      })
    );
    setPosting(false);
    loadActivity();
  }

  const totalPosts = videos.reduce((n, v) => n + v.accounts.size, 0);
  const nameFor = (openId: string) => accounts.find((a) => a.open_id === openId)?.display_name ?? openId;

  return (
    <main className="container">
      <div className="hero">
        <h1>
          Post <span className="accent">everywhere</span>
        </h1>
        <p>
          Add one video for all accounts — or several videos, each assigned to different accounts.
          Everything lands in the shared <Link href="/library">Library</Link> for Whop tracking.
        </p>
      </div>

      {banner && <div className={`banner ${banner.kind}`}>{banner.text}</div>}

      <section className="card">
        <h2>
          <span className="step">1</span> Videos
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
            addFiles(e.dataTransfer.files);
          }}
        >
          Drop videos here or click to browse (MP4 / MOV / WebM) — add as many as you want
          <input
            ref={fileInput}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {loadingAccounts ? (
          <div className="empty">Loading accounts…</div>
        ) : okAccounts.length === 0 ? (
          <div className="empty">
            No TikTok accounts connected — add them under <Link href="/accounts">Accounts</Link> (top right).
          </div>
        ) : null}

        {videos.map((v) => (
          <div className="video-card" key={v.key}>
            <div className="video-card-head">
              <div className="grow">
                <div className="name">{v.file.name}</div>
                <div className="sub">{(v.file.size / 1e6).toFixed(1)} MB · posting to {v.accounts.size} account{v.accounts.size === 1 ? '' : 's'}</div>
              </div>
              <button
                className="btn-ghost"
                onClick={() => setVideos((prev) => prev.filter((x) => x.key !== v.key))}
                disabled={posting}
              >
                Remove
              </button>
            </div>
            {mode === 'DIRECT_POST' && (
              <textarea
                value={v.caption}
                maxLength={2200}
                placeholder="Caption for this video… #hashtags too (or ask an Agent)"
                onChange={(e) =>
                  setVideos((prev) => prev.map((x) => (x.key === v.key ? { ...x, caption: e.target.value } : x)))
                }
                disabled={posting}
              />
            )}
            <div className="tool-grid" style={{ marginTop: 10 }}>
              {okAccounts.map((a) => (
                <label
                  key={a.open_id}
                  className={`tool-pill ${v.accounts.has(a.open_id) ? 'on' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleVideoAccount(v.key, a.open_id);
                  }}
                >
                  {a.display_name}
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>
          <span className="step">2</span> Options
        </h2>
        <div className="mode-tabs">
          <button className={mode === 'DIRECT_POST' ? 'active' : ''} onClick={() => setMode('DIRECT_POST')} disabled={posting}>
            Post directly
          </button>
          <button className={mode === 'DRAFT' ? 'active' : ''} onClick={() => setMode('DRAFT')} disabled={posting}>
            Send as draft (finish in app)
          </button>
        </div>
        {mode === 'DIRECT_POST' && (
          <div className="row">
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
        )}
      </section>

      <section className="card">
        <h2>
          <span className="step">3</span> Post
        </h2>
        <button className="btn-primary btn-big" onClick={postAll} disabled={posting || totalPosts === 0}>
          {posting
            ? 'Working…'
            : `Post ${videos.length} video${videos.length === 1 ? '' : 's'} → ${totalPosts} post${totalPosts === 1 ? '' : 's'}`}
        </button>

        {Object.keys(results).length > 0 && (
          <div className="results">
            {videos.map((v) => (
              <div key={v.key}>
                {results[v.key] && (
                  <div className="result">
                    <span className={`dot ${results[v.key].stage === 'done' ? 'ok' : results[v.key].stage === 'failed' ? 'fail' : 'pending'}`} />
                    <strong>{v.file.name}</strong>
                    <span className="msg">{results[v.key].message}</span>
                  </div>
                )}
                {[...v.accounts]
                  .filter((openId) => results[`${v.key}:${openId}`])
                  .map((openId) => {
                    const r = results[`${v.key}:${openId}`];
                    return (
                      <div className="result result-sub" key={openId}>
                        <span className={`dot ${r.stage === 'done' ? 'ok' : r.stage === 'failed' ? 'fail' : 'pending'}`} />
                        <strong>{nameFor(openId)}</strong>
                        <span className="msg">{r.message}</span>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        )}

        <p className="hint" style={{ marginTop: 14 }}>
          Until your TikTok developer app passes TikTok&apos;s audit, direct posts are forced to{' '}
          <strong>Private (only me)</strong>. After posting, track each post against a Whop campaign
          in the <Link href="/library">Library</Link> — or let an Autopilot mission handle it.
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
