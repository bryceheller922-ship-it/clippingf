import { createRemoteJWKSet, jwtVerify } from 'jose';

// Verifies Firebase Auth ID tokens server-side without the admin SDK: they
// are RS256 JWTs signed by Google's securetoken keys.

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export interface VerifiedUser {
  uid: string;
  email: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedUser> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID env var is not set');
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId
  });
  const uid = String(payload.sub ?? '');
  const email = String((payload.email as string) ?? '');
  if (!uid || !email) throw new Error('Token is missing uid/email');
  if (payload.email_verified === false && payload.firebase && (payload.firebase as { sign_in_provider?: string }).sign_in_provider === 'password') {
    // allow unverified email/password accounts — the allowlist below is the real gate
  }
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(email.toLowerCase())) {
    throw new Error(`${email} is not on this workspace's allowlist (ALLOWED_EMAILS)`);
  }
  return { uid, email };
}
