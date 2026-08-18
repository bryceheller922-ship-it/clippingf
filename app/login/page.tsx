'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Login failed');
      router.push('/');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h1>
          Clipping<span className="accent">F</span>
        </h1>
        <p className="hint" style={{ marginBottom: 18 }}>
          Sign in to your clipping workspace.
        </p>
        {error && <div className="banner err">{error}</div>}
        <label className="field">
          <span className="label">Username</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input
            type="password"
            className="pw"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn-primary btn-big" disabled={busy || !username || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="hint" style={{ marginTop: 14 }}>
          Users are set with the <code>APP_USERS</code> env var on Vercel, e.g.{' '}
          <code>bryce:secret,partner:secret2</code>.
        </p>
      </form>
    </main>
  );
}
