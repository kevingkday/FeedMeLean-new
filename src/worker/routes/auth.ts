import { Hono } from 'hono';
import type { AppContext } from '../types';
import {
  generateSecureToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from '../services/crypto';
import { createSession, destroySession, requireAuth } from '../middleware/auth';
import { checkRateLimit } from '../middleware/rateLimit';
import type { UserProfile } from '../../shared/types';

export const authRoutes = new Hono<AppContext>();

authRoutes.get('/config', (c) => {
  return c.json({
    google_client_id: c.env.GOOGLE_CLIENT_ID || null,
    recaptcha_site_key: c.env.RECAPTCHA_SITE_KEY || null,
  });
});

async function verifyRecaptchaToken(secret: string | undefined, token: string | undefined): Promise<boolean> {
  if (!secret || !token) return true;
  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return true;
  }
}

const DEFAULT_STARTER_SAVED_MEALS = [
  { name: '1 scoop whey protein', description: '1 scoop whey protein in water', calories: 120, protein: 24, carbs: 3, fat: 1.5 },
  { name: '3 scrambled eggs', description: '3 large scrambled eggs', calories: 210, protein: 19, carbs: 2, fat: 15 },
  { name: 'Greek yogurt with berries', description: '1 cup nonfat Greek yogurt with mixed berries', calories: 175, protein: 18, carbs: 20, fat: 2 },
  { name: 'Protein bread with jam', description: '2 slices protein bread with sugar-free jam', calories: 190, protein: 14, carbs: 24, fat: 3 },
  { name: 'Fiber One cereal with milk', description: '1 serving Fiber One cereal with 1/2 cup skim milk', calories: 130, protein: 6, carbs: 39, fat: 1 },
];

async function getProfileWithWeightMeta(db: D1Database, userId: string) {
  const profile = await db
    .prepare('SELECT * FROM user_profiles WHERE user_id = ?1 LIMIT 1')
    .bind(userId)
    .first<UserProfile>();

  const latestWeight = await db
    .prepare('SELECT weight_kg FROM weight_logs WHERE user_id = ?1 ORDER BY measured_at DESC LIMIT 1')
    .bind(userId)
    .first<{ weight_kg: number }>();

  const initialWeight = await db
    .prepare('SELECT weight_kg FROM weight_logs WHERE user_id = ?1 ORDER BY measured_at ASC LIMIT 1')
    .bind(userId)
    .first<{ weight_kg: number }>();

  return {
    profile,
    latestWeightKg: latestWeight?.weight_kg ?? profile?.weight_kg ?? null,
    initialWeightKg: initialWeight?.weight_kg ?? profile?.weight_kg ?? null,
  };
}

authRoutes.post('/register', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const rl = await checkRateLimit(c.env.DB, `register:${ip}`, 10, 900);
  if (!rl.allowed) {
    return c.json({ error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` }, 429);
  }

  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const timezone = typeof body.timezone === 'string' && body.timezone ? body.timezone : 'America/New_York';
  const recaptchaToken = typeof body.recaptcha_token === 'string' ? body.recaptcha_token : undefined;

  if (recaptchaToken) {
    const captchaOk = await verifyRecaptchaToken(c.env.RECAPTCHA_SECRET_KEY, recaptchaToken);
    if (!captchaOk) {
      return c.json({ error: 'reCAPTCHA verification failed. Please try again.' }, 400);
    }
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Please enter a valid email address.' }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters long.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?1 LIMIT 1')
    .bind(email)
    .first();
  if (existing) {
    return c.json({ error: 'An account with this email already exists.' }, 409);
  }

  // First registered user or ADMIN_EMAIL becomes admin automatically
  const userCountRow = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>();
  const isFirstUser = (userCountRow?.cnt ?? 0) === 0;
  const isConfiguredAdmin =
    c.env.ADMIN_EMAIL && c.env.ADMIN_EMAIL.trim().toLowerCase() === email;
  const role = isFirstUser || isConfiguredAdmin ? 'admin' : 'user';

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const nowIso = new Date().toISOString();

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, status, created_at, last_login_at)
       VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)`
    ).bind(userId, email, passwordHash, role, nowIso),
    c.env.DB.prepare(
      `INSERT INTO user_profiles (
         user_id, age, sex, height_cm, weight_kg, activity_level,
         current_body_fat, target_body_fat, calorie_deficit, protein_target,
         unit_system, timezone, updated_at
       ) VALUES (?1, 35, 'male', 177.8, 81.19, 'light', 22.0, 12.0, 500, 150, 'imperial', ?2, ?3)`
    ).bind(userId, timezone, nowIso),
    c.env.DB.prepare(
      `INSERT INTO weight_logs (id, user_id, weight_kg, measured_at, created_at)
       VALUES (?1, ?2, 81.19, ?3, ?3)`
    ).bind(crypto.randomUUID(), userId, nowIso),
    ...DEFAULT_STARTER_SAVED_MEALS.map((meal) =>
      c.env.DB.prepare(
        `INSERT INTO saved_meals (id, user_id, name, description, calories, protein, carbs, fat, use_count, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9)`
      ).bind(
        crypto.randomUUID(),
        userId,
        meal.name,
        meal.description,
        meal.calories,
        meal.protein,
        meal.carbs,
        meal.fat,
        nowIso
      )
    ),
  ];

  await c.env.DB.batch(statements);
  await createSession(c, userId);

  const meta = await getProfileWithWeightMeta(c.env.DB, userId);
  return c.json({
    user: {
      id: userId,
      email,
      role,
      status: 'active',
      created_at: nowIso,
      last_login_at: nowIso,
    },
    ...meta,
  });
});

authRoutes.post('/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const rl = await checkRateLimit(c.env.DB, `login:${ip}`, 15, 900);
  if (!rl.allowed) {
    return c.json({ error: `Too many login attempts. Try again in ${rl.retryAfterSeconds}s.` }, 429);
  }

  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return c.json({ error: 'Email and password are required.' }, 400);
  }

  const userRow = await c.env.DB.prepare(
    'SELECT id, email, password_hash, role, status, created_at, last_login_at FROM users WHERE email = ?1 LIMIT 1'
  )
    .bind(email)
    .first<{
      id: string;
      email: string;
      password_hash: string;
      role: 'user' | 'admin';
      status: 'active' | 'disabled';
      created_at: string;
      last_login_at: string | null;
    }>();

  if (!userRow) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  const valid = await verifyPassword(password, userRow.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  if (userRow.status !== 'active') {
    return c.json({ error: 'Your account has been disabled. Please contact an administrator.' }, 403);
  }

  const nowIso = new Date().toISOString();
  await c.env.DB.prepare('UPDATE users SET last_login_at = ?1 WHERE id = ?2')
    .bind(nowIso, userRow.id)
    .run();

  await createSession(c, userRow.id);
  const meta = await getProfileWithWeightMeta(c.env.DB, userRow.id);

  return c.json({
    user: {
      id: userRow.id,
      email: userRow.email,
      role: userRow.role,
      status: userRow.status,
      created_at: userRow.created_at,
      last_login_at: nowIso,
    },
    ...meta,
  });
});

authRoutes.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.post('/google', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const credential = typeof body.credential === 'string' ? body.credential.trim() : '';
  const timezone = typeof body.timezone === 'string' && body.timezone ? body.timezone : 'America/New_York';

  if (!credential) {
    return c.json({ error: 'Google credential token is required.' }, 400);
  }

  const verifyRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );
  if (!verifyRes.ok) {
    return c.json({ error: 'Invalid Google sign-in token.' }, 401);
  }

  const tokenInfo = (await verifyRes.json()) as {
    aud?: string;
    email?: string;
    email_verified?: string;
  };

  if (c.env.GOOGLE_CLIENT_ID && tokenInfo.aud !== c.env.GOOGLE_CLIENT_ID) {
    return c.json({ error: 'Google token client ID mismatch.' }, 401);
  }
  if (!tokenInfo.email || tokenInfo.email_verified !== 'true') {
    return c.json({ error: 'Google account email is not verified.' }, 401);
  }

  const email = tokenInfo.email.trim().toLowerCase();
  const nowIso = new Date().toISOString();

  const existing = await c.env.DB.prepare(
    'SELECT id, email, role, status, created_at FROM users WHERE email = ?1 LIMIT 1'
  )
    .bind(email)
    .first<{
      id: string;
      email: string;
      role: 'user' | 'admin';
      status: 'active' | 'disabled';
      created_at: string;
    }>();

  if (existing) {
    if (existing.status !== 'active') {
      return c.json({ error: 'Your account has been disabled.' }, 403);
    }
    await c.env.DB.prepare('UPDATE users SET last_login_at = ?1 WHERE id = ?2')
      .bind(nowIso, existing.id)
      .run();
    await createSession(c, existing.id);
    const meta = await getProfileWithWeightMeta(c.env.DB, existing.id);
    return c.json({
      user: {
        ...existing,
        last_login_at: nowIso,
      },
      ...meta,
    });
  }

  // First time signing in with Google -> create user account
  const userCountRow = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>();
  const isFirstUser = (userCountRow?.cnt ?? 0) === 0;
  const isConfiguredAdmin =
    c.env.ADMIN_EMAIL && c.env.ADMIN_EMAIL.trim().toLowerCase() === email;
  const role = isFirstUser || isConfiguredAdmin ? 'admin' : 'user';

  const userId = crypto.randomUUID();
  const randomPasswordHash = await hashPassword(generateSecureToken(24));

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, status, created_at, last_login_at)
       VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)`
    ).bind(userId, email, randomPasswordHash, role, nowIso),
    c.env.DB.prepare(
      `INSERT INTO user_profiles (
         user_id, age, sex, height_cm, weight_kg, activity_level,
         current_body_fat, target_body_fat, calorie_deficit, protein_target,
         unit_system, timezone, updated_at
       ) VALUES (?1, 35, 'male', 177.8, 81.19, 'light', 22.0, 12.0, 500, 150, 'imperial', ?2, ?3)`
    ).bind(userId, timezone, nowIso),
    c.env.DB.prepare(
      `INSERT INTO weight_logs (id, user_id, weight_kg, measured_at, created_at)
       VALUES (?1, ?2, 81.19, ?3, ?3)`
    ).bind(crypto.randomUUID(), userId, nowIso),
    ...DEFAULT_STARTER_SAVED_MEALS.map((meal) =>
      c.env.DB.prepare(
        `INSERT INTO saved_meals (id, user_id, name, description, calories, protein, carbs, fat, use_count, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9)`
      ).bind(
        crypto.randomUUID(),
        userId,
        meal.name,
        meal.description,
        meal.calories,
        meal.protein,
        meal.carbs,
        meal.fat,
        nowIso
      )
    ),
  ]);

  await createSession(c, userId);
  const meta = await getProfileWithWeightMeta(c.env.DB, userId);
  return c.json({
    user: {
      id: userId,
      email,
      role,
      status: 'active',
      created_at: nowIso,
      last_login_at: nowIso,
    },
    ...meta,
  });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const meta = await getProfileWithWeightMeta(c.env.DB, user.id);
  return c.json({
    user,
    ...meta,
  });
});

authRoutes.post('/forgot-password', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const rl = await checkRateLimit(c.env.DB, `forgot:${ip}`, 8, 900);
  if (!rl.allowed) {
    return c.json({ error: 'Too many requests. Please wait a few minutes.' }, 429);
  }

  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) {
    return c.json({ error: 'Please enter your email address.' }, 400);
  }

  const userRow = await c.env.DB.prepare('SELECT id, email FROM users WHERE email = ?1 LIMIT 1')
    .bind(email)
    .first<{ id: string; email: string }>();

  let devToken: string | undefined;

  if (userRow) {
    const rawToken = generateSecureToken(24);
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour

    await c.env.DB.prepare(
      'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?1, ?2, ?3, ?4)'
    )
      .bind(crypto.randomUUID(), userRow.id, tokenHash, expiresAt)
      .run();

    const origin = new URL(c.req.url).origin;
    const resetLink = `${origin}/?reset_token=${rawToken}`;

    if (c.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'FeedMeLean <noreply@feedmelean.com>',
          to: [userRow.email],
          subject: 'Reset your FeedMeLean password',
          html: `<p>Click the link below to reset your FeedMeLean password (valid for 1 hour):</p><p><a href="${resetLink}">${resetLink}</a></p>`,
        }),
      }).catch(() => null);
    } else {
      devToken = rawToken;
    }
  }

  return c.json({
    ok: true,
    message: 'If an account matches that email, password reset instructions have been generated.',
    dev_reset_token: devToken,
  });
});

authRoutes.post('/reset-password', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const newPassword = typeof body.password === 'string' ? body.password : '';

  if (!token || newPassword.length < 8) {
    return c.json({ error: 'Valid reset token and a password of at least 8 characters are required.' }, 400);
  }

  const tokenHash = await sha256Hex(token);
  const nowIso = new Date().toISOString();

  const tokenRow = await c.env.DB.prepare(
    'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?1 LIMIT 1'
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>();

  if (!tokenRow || tokenRow.used_at || tokenRow.expires_at <= nowIso) {
    return c.json({ error: 'This password reset link is invalid or has expired.' }, 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ?1 WHERE id = ?2').bind(passwordHash, tokenRow.user_id),
    c.env.DB.prepare('UPDATE password_reset_tokens SET used_at = ?1 WHERE id = ?2').bind(nowIso, tokenRow.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(tokenRow.user_id),
  ]);

  await createSession(c, tokenRow.user_id);
  return c.json({ ok: true });
});

authRoutes.put('/account', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const newEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const currentPassword = typeof body.current_password === 'string' ? body.current_password : '';
  const newPassword = typeof body.new_password === 'string' ? body.new_password : '';

  const userRow = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?1 LIMIT 1')
    .bind(user.id)
    .first<{ password_hash: string }>();

  if (!userRow) {
    return c.json({ error: 'User not found.' }, 404);
  }

  if (newEmail && newEmail !== user.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return c.json({ error: 'Please enter a valid email address.' }, 400);
    }
    const duplicate = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?1 AND id != ?2 LIMIT 1')
      .bind(newEmail, user.id)
      .first();
    if (duplicate) {
      return c.json({ error: 'That email address is already in use.' }, 409);
    }
    await c.env.DB.prepare('UPDATE users SET email = ?1 WHERE id = ?2')
      .bind(newEmail, user.id)
      .run();
  }

  if (newPassword) {
    if (!currentPassword) {
      return c.json({ error: 'Please enter your current password to set a new password.' }, 400);
    }
    const valid = await verifyPassword(currentPassword, userRow.password_hash);
    if (!valid) {
      return c.json({ error: 'Current password is incorrect.' }, 401);
    }
    if (newPassword.length < 8) {
      return c.json({ error: 'New password must be at least 8 characters long.' }, 400);
    }
    const nextHash = await hashPassword(newPassword);
    await c.env.DB.prepare('UPDATE users SET password_hash = ?1 WHERE id = ?2')
      .bind(nextHash, user.id)
      .run();
  }

  return c.json({
    ok: true,
    email: newEmail || user.email,
  });
});

authRoutes.delete('/account', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';

  if (password) {
    const userRow = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?1 LIMIT 1')
      .bind(user.id)
      .first<{ password_hash: string }>();
    if (userRow) {
      const valid = await verifyPassword(password, userRow.password_hash);
      if (!valid) {
        return c.json({ error: 'Incorrect password.' }, 401);
      }
    }
  }

  await destroySession(c);
  // Explicit cascade cleanup for all user tables
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM meal_logs WHERE user_id = ?1').bind(user.id),
    c.env.DB.prepare('DELETE FROM saved_meals WHERE user_id = ?1').bind(user.id),
    c.env.DB.prepare('DELETE FROM weight_logs WHERE user_id = ?1').bind(user.id),
    c.env.DB.prepare('DELETE FROM user_profiles WHERE user_id = ?1').bind(user.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(user.id),
    c.env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?1').bind(user.id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(user.id),
  ]);

  return c.json({ ok: true });
});

