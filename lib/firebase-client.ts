'use client';

import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Client-side Firebase (auth only). Config values are public by design.
export function firebaseAuth() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  };
  if (!config.apiKey || !config.projectId) {
    throw new Error('Firebase is not configured — set NEXT_PUBLIC_FIREBASE_API_KEY / _AUTH_DOMAIN / _PROJECT_ID');
  }
  const app = getApps()[0] ?? initializeApp(config);
  return getAuth(app);
}
