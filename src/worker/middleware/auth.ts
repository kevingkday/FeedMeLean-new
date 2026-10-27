import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppContext } from '../types';
import { generateSecureToken, sha256Hex } from '../services/crypto';
import type { User } from '../../shared/types';

export const SESSION_COOKIE_NAME = 'fml_session';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function isSecureRequest(c: Context): boolean {
  const url = new URL(c.req.url);
  if (url.protocol === 'https:') return true;
  const proto = c.req.header('x-forwarded-proto');
  if (proto === 'https') return true;
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return false;
  return true;
}

export async function createSession(c: Context<AppContext>, userId: string): Promise<string> {
  const rawToken = generateSecureToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, session_token_hash, expires_at) VALUES (?1, ?2, ?3, ?4)'
  )
    .bind(sessionId, userId, tokenHash, expiresAt)
    .run();

  setCookie(c, SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  return sessionId;
}

export async function destroySession(c: Context<AppContext>): Promise<void> {
  const rawToken = getCookie(c, SESSION_COOKIE_NAME);
  if (rawToken) {
    const tokenHash = await sha256Hex(rawToken);
    await c.env.DB.prepare('DELETE FROM sessions WHERE session_token_hash = ?1')
      .bind(tokenHash)
      .run();
  }
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
  });
}

export async function requireAuth(c: Context<AppContext>, next: Next) {
  const rawToken = getCookie(c, SESSION_COOKIE_NAME);
  if (!rawToken) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const tokenHash = await sha256Hex(rawToken);
  const nowIso = new Date().toISOString();

  const row = await c.env.DB.prepare(
    `SELECT
       s.id AS session_id,
       s.expires_at,
       u.id,
       u.email,
       u.role,
       u.status,
       u.created_at,
       u.last_login_at
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.session_token_hash = ?1
     LIMIT 1`
  )
    .bind(tokenHash)
    .first<{
      session_id: string;
      expires_at: string;
      id: string;
      email: string;
      role: 'user' | 'admin';
      status: 'active' | 'disabled';
      created_at: string;
      last_login_at: string | null;
    }>();

  if (!row || row.expires_at <= nowIso) {
    if (row) {
      await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?1').bind(row.session_id).run();
    }
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
    return c.json({ error: 'Session expired. Please log in again.' }, 401);
  }

  if (row.status !== 'active') {
    return c.json({ error: 'Your account has been disabled. Please contact an administrator.' }, 403);
  }

  const user: User = {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    last_login_at: row.last_login_at,
  };

  c.set('user', user);
  c.set('sessionId', row.session_id);
  await next();
}

export async function requireAdmin(c: Context<AppContext>, next: Next) {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Administrator privileges required' }, 403);
  }
  await next();
}

