'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function establishSession(idToken: string) {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Session failed');
    router.push('/');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { firebaseAuth } = await import('@/lib/firebase-client');
      const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
      const auth = firebaseAuth();
      const cred =
        mode === 'signin'
          ? await signInWithEmailAndPassword(auth, email, password)
          : await createUserWithEmailAndPassword(auth, email, password);
      await establishSession(await cred.user.getIdToken());
    } catch (e) {
      setError((e as Error).message.replace('Firebase: ', ''));
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError('');
    try {
      const { firebaseAuth } = await import('@/lib/firebase-client');
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const cred = await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
      await establishSession(await cred.user.getIdToken());
    } catch (e) {
      setError((e as Error).message.replace('Firebase: ', ''));
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
          <span className="label">Email</span>
          <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input type="password" className="pw" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn-primary btn-big" disabled={busy || !email || !password}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="btn-secondary btn-big" style={{ marginTop: 10 }} onClick={google} disabled={busy}>
          Continue with Google
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={{ marginTop: 10 }}
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          disabled={busy}
        >
          {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
        <p className="hint" style={{ marginTop: 14 }}>
          Powered by Firebase Auth. Access is limited to emails in the workspace allowlist
          (<code>ALLOWED_EMAILS</code>).
        </p>
      </form>
    </main>
  );
}
