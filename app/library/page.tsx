'use client';

import { useCallback, useEffect, useState } from 'react';

interface ClipPost {
  open_id: string;
  display_name: string;
  publish_id: string;
  mode: string;
  posted_at: number;
  posted_by: string;
}

interface Whop {
  campaign_url?: string;
  submitted_url?: string;
  status?: string;
  views?: number;
  earnings_usd?: number;
}

interface Clip {
  id: string;
  title: string;
  notes: string;
  filename: string;
  blob_url: string;
  size: number;
  uploaded_by: string;
  created_at: number;
  status: string;
  posts: ClipPost[];
  whop: Whop;
}

interface Account {
  open_id: string;
  display_name: string;
  status: string;
}

const WHOP_STATUSES = ['not_submitted', 'submitted', 'approved', 'rejected', 'paid'];

export default function Library() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [repostClip, setRepostClip] = useState<Clip | null>(null);
  const [repostAccounts, setRepostAccounts] = useState<Set<string>>(new Set());
  const [repostCaption, setRepostCaption] = useState('');
  const [repostMode, setRepostMode] = useState<'DIRECT_POST' | 'DRAFT'>('DIRECT_POST');
  const [reposting, setReposting] = useState(false);
  const [repostMsg, setRepostMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a] = await Promise.all([
        fetch('/api/clips').then((r) => r.json()),
        fetch('/api/accounts').then((r) => r.json())
      ]);
      setClips(c.clips ?? []);
      setAccounts((a.accounts ?? []).filter((x: Account) => x.status === 'ok'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patchClip(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/clips/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const data = await res.json();
    if (res.ok) setClips((prev) => prev.map((c) => (c.id === id ? data.clip : c)));
  }

  async function deleteClip(id: string) {
    if (!confirm('Delete this clip and its video file? This cannot be undone.')) return;
    await fetch(`/api/clips/${id}`, { method: 'DELETE' });
    setClips((prev) => prev.filter((c) => c.id !== id));
  }

  function openRepost(clip: Clip) {
    setRepostClip(clip);
    setRepostAccounts(new Set(accounts.map((a) => a.open_id)));
    setRepostCaption(clip.title);
    setRepostMsg('');
  }

  async function doRepost() {
    if (!repostClip || repostAccounts.size === 0) return;
    setReposting(true);
    setRepostMsg('Posting…');
    const targets = accounts.filter((a) => repostAccounts.has(a.open_id));
    const outcomes: string[] = [];
    await Promise.allSettled(
      targets.map(async (a) => {
        const res = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            openId: a.open_id,
            videoUrl: repostClip.blob_url,
            videoSize: repostClip.size,
            title: repostCaption,
            privacyLevel: 'SELF_ONLY',
            mode: repostMode,
            clipId: repostClip.id
          })
        });
        const data = await res.json();
        outcomes.push(res.ok ? `✓ ${a.display_name}` : `✗ ${a.display_name}: ${data.error}`);
      })
    );
    setRepostMsg(outcomes.join('  ·  '));
    setReposting(false);
    load();
  }

  return (
    <main className="container">
      <div className="hero">
        <h1>
          Clip <span className="accent">Library</span>
        </h1>
        <p>Every uploaded clip, where it was posted, and how it&apos;s earning on Whop.</p>
      </div>

      {loading ? (
        <div className="empty">Loading clips…</div>
      ) : clips.length === 0 ? (
        <div className="card empty">No clips yet — upload one from the Post page.</div>
      ) : (
        clips.map((clip) => (
          <section className="card clip-card" key={clip.id}>
            <div className="clip-head" onClick={() => setExpanded(expanded === clip.id ? null : clip.id)}>
              <div className="grow">
                <div className="name">{clip.title}</div>
                <div className="sub">
                  {(clip.size / 1e6).toFixed(1)} MB · by {clip.uploaded_by} ·{' '}
                  {new Date(clip.created_at).toLocaleDateString()} ·{' '}
                  <span className={`tag tag-${clip.status}`}>{clip.status}</span>
                  {clip.whop?.status && clip.whop.status !== 'not_submitted' && (
                    <>
                      {' '}
                      <span className={`tag tag-whop`}>whop: {clip.whop.status}</span>
                    </>
                  )}
                </div>
              </div>
              {clip.posts.length > 0 && <span className="sub">{clip.posts.length} post{clip.posts.length > 1 ? 's' : ''}</span>}
              <span className="chev">{expanded === clip.id ? '▾' : '▸'}</span>
            </div>

            {expanded === clip.id && (
              <div className="clip-body">
                <div className="row">
                  <div>
                    <video src={clip.blob_url} controls preload="metadata" className="clip-video" />
                  </div>
                  <div>
                    <label className="field">
                      <span className="label">Title</span>
                      <input
                        type="text"
                        defaultValue={clip.title}
                        onBlur={(e) => e.target.value !== clip.title && patchClip(clip.id, { title: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span className="label">Notes</span>
                      <textarea
                        defaultValue={clip.notes}
                        placeholder="Source, hooks, what worked…"
                        onBlur={(e) => e.target.value !== clip.notes && patchClip(clip.id, { notes: e.target.value })}
                      />
                    </label>
                    <div className="row">
                      <button className="btn-secondary" onClick={() => openRepost(clip)} disabled={accounts.length === 0}>
                        Post to accounts
                      </button>
                      <button className="btn-ghost" onClick={() => deleteClip(clip.id)}>
                        Delete clip
                      </button>
                    </div>
                  </div>
                </div>

                {clip.posts.length > 0 && (
                  <>
                    <h3 className="subhead">TikTok posts</h3>
                    <div className="results">
                      {clip.posts.map((p) => (
                        <div className="result" key={p.publish_id}>
                          <span className="dot ok" />
                          <strong>{p.display_name}</strong>
                          <span className="msg">
                            {p.mode === 'DRAFT' ? 'draft' : 'direct'} · {new Date(p.posted_at).toLocaleString()} · by {p.posted_by}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <h3 className="subhead">Whop tracking</h3>
                <div className="row">
                  <label className="field">
                    <span className="label">Campaign URL (Content Rewards)</span>
                    <input
                      type="text"
                      placeholder="https://whop.com/…"
                      defaultValue={clip.whop?.campaign_url ?? ''}
                      onBlur={(e) => patchClip(clip.id, { whop: { campaign_url: e.target.value } })}
                    />
                  </label>
                  <label className="field">
                    <span className="label">Submitted post URL</span>
                    <input
                      type="text"
                      placeholder="https://www.tiktok.com/@…/video/…"
                      defaultValue={clip.whop?.submitted_url ?? ''}
                      onBlur={(e) => patchClip(clip.id, { whop: { submitted_url: e.target.value } })}
                    />
                  </label>
                </div>
                <div className="row">
                  <label className="field">
                    <span className="label">Status</span>
                    <select
                      defaultValue={clip.whop?.status ?? 'not_submitted'}
                      onChange={(e) => patchClip(clip.id, { whop: { status: e.target.value } })}
                    >
                      {WHOP_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">Views</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      defaultValue={clip.whop?.views ?? ''}
                      onBlur={(e) => patchClip(clip.id, { whop: { views: Number(e.target.value) || 0 } })}
                    />
                  </label>
                  <label className="field">
                    <span className="label">Earnings (USD)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      defaultValue={clip.whop?.earnings_usd ?? ''}
                      onBlur={(e) => patchClip(clip.id, { whop: { earnings_usd: Number(e.target.value) || 0 } })}
                    />
                  </label>
                </div>
                {clip.whop?.campaign_url && (
                  <p className="hint">
                    Whop has no public API for clip submissions — post the clip, then{' '}
                    <a href={clip.whop.campaign_url} target="_blank" rel="noreferrer">
                      open the campaign
                    </a>{' '}
                    and submit your TikTok post URL there. Track the result here.
                  </p>
                )}
              </div>
            )}
          </section>
        ))
      )}

      {repostClip && (
        <div className="modal-backdrop" onClick={() => !reposting && setRepostClip(null)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2>Post “{repostClip.title}”</h2>
            <div className="accounts" style={{ marginBottom: 14 }}>
              {accounts.map((a) => (
                <div
                  key={a.open_id}
                  className={`account ${repostAccounts.has(a.open_id) ? 'selected' : ''}`}
                  onClick={() =>
                    setRepostAccounts((prev) => {
                      const next = new Set(prev);
                      next.has(a.open_id) ? next.delete(a.open_id) : next.add(a.open_id);
                      return next;
                    })
                  }
                >
                  <div className="grow name">{a.display_name}</div>
                  <div className="check">{repostAccounts.has(a.open_id) ? '✓' : ''}</div>
                </div>
              ))}
            </div>
            <div className="mode-tabs">
              <button className={repostMode === 'DIRECT_POST' ? 'active' : ''} onClick={() => setRepostMode('DIRECT_POST')}>
                Post directly
              </button>
              <button className={repostMode === 'DRAFT' ? 'active' : ''} onClick={() => setRepostMode('DRAFT')}>
                Send as draft
              </button>
            </div>
            {repostMode === 'DIRECT_POST' && (
              <label className="field">
                <span className="label">Caption</span>
                <textarea value={repostCaption} onChange={(e) => setRepostCaption(e.target.value)} maxLength={2200} />
              </label>
            )}
            <button className="btn-primary btn-big" onClick={doRepost} disabled={reposting || repostAccounts.size === 0}>
              {reposting ? 'Posting…' : `Post to ${repostAccounts.size} account${repostAccounts.size === 1 ? '' : 's'}`}
            </button>
            {repostMsg && <p className="hint" style={{ marginTop: 10 }}>{repostMsg}</p>}
            <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setRepostClip(null)} disabled={reposting}>
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
