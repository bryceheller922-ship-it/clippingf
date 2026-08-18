'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINKS = [
  { href: '/', label: 'Post' },
  { href: '/library', label: 'Library' },
  { href: '/agents', label: 'Agents' },
  { href: '/settings', label: 'Settings' }
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState('');
  const hidden = pathname === '/login';

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? ''))
      .catch(() => {});
  }, []);

  if (hidden) return null;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          Clipping<span className="accent">F</span>
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="nav-user">
          {user && <span className="user-badge">{user}</span>}
          <button className="btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
