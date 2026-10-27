import { Hono } from 'hono';
import type { AppContext } from '../types';
import { requireAdmin, requireAuth } from '../middleware/auth';

export const adminRoutes = new Hono<AppContext>();

adminRoutes.use('*', requireAuth);
adminRoutes.use('*', requireAdmin);

adminRoutes.get('/stats', async (c) => {
  const now = Date.now();
  const oneDayAgoIso = new Date(now - 24 * 3600 * 1000).toISOString();
  const thirtyDaysAgoIso = new Date(now - 30 * 24 * 3600 * 1000).toISOString();

  const [
    totalUsersRow,
    dauRow,
    mauRow,
    totalMealsRow,
    aiTodayRow,
    aiTotalsRow,
    dailyAiSeries,
  ] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT id) as count FROM (
         SELECT id FROM users WHERE last_login_at >= ?1
         UNION
         SELECT user_id as id FROM meal_logs WHERE created_at >= ?1
       )`
    )
      .bind(oneDayAgoIso)
      .first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT id) as count FROM (
         SELECT id FROM users WHERE last_login_at >= ?1
         UNION
         SELECT user_id as id FROM meal_logs WHERE created_at >= ?1
       )`
    )
      .bind(thirtyDaysAgoIso)
      .first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM meal_logs').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM ai_usage WHERE created_at >= ?1')
      .bind(oneDayAgoIso)
      .first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT
         COUNT(*) as total_requests,
         COALESCE(SUM(input_tokens), 0) as total_input_tokens,
         COALESCE(SUM(output_tokens), 0) as total_output_tokens,
         COALESCE(SUM(estimated_cost), 0) as total_cost,
         SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count
       FROM ai_usage`
    ).first<{
      total_requests: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost: number;
      error_count: number;
    }>(),
    c.env.DB.prepare(
      `SELECT substr(created_at, 1, 10) as day, COUNT(*) as requests, COALESCE(SUM(estimated_cost), 0) as cost
       FROM ai_usage
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day DESC
       LIMIT 14`
    ).all<{ day: string; requests: number; cost: number }>(),
  ]);

  return c.json({
    total_users: totalUsersRow?.count ?? 0,
    daily_active_users: dauRow?.count ?? 0,
    monthly_active_users: mauRow?.count ?? 0,
    total_meals_logged: totalMealsRow?.count ?? 0,
    ai_requests_today: aiTodayRow?.count ?? 0,
    ai_summary: {
      total_requests: aiTotalsRow?.total_requests ?? 0,
      total_input_tokens: aiTotalsRow?.total_input_tokens ?? 0,
      total_output_tokens: aiTotalsRow?.total_output_tokens ?? 0,
      total_cost: Math.round((aiTotalsRow?.total_cost ?? 0) * 10000) / 10000,
      error_count: aiTotalsRow?.error_count ?? 0,
    },
    ai_requests_by_day: dailyAiSeries.results ?? [],
  });
});

adminRoutes.get('/users', async (c) => {
  const q = (c.req.query('q') || '').trim();
  const pattern = `%${q}%`;

  const { results } = await c.env.DB.prepare(
    `SELECT
       u.id,
       u.email,
       u.role,
       u.status,
       u.created_at,
       u.last_login_at,
       COUNT(m.id) AS meals_logged,
       MAX(COALESCE(m.created_at, u.last_login_at, u.created_at)) AS last_activity_at
     FROM users u
     LEFT JOIN meal_logs m ON m.user_id = u.id
     WHERE (?1 = '%%' OR u.email LIKE ?1 OR u.id LIKE ?1)
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT 150`
  )
    .bind(pattern)
    .all<{
      id: string;
      email: string;
      role: 'user' | 'admin';
      status: 'active' | 'disabled';
      created_at: string;
      last_login_at: string | null;
      meals_logged: number;
      last_activity_at: string | null;
    }>();

  return c.json({ users: results });
});

adminRoutes.patch('/users/:id', async (c) => {
  const currentUser = c.get('user');
  const targetId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const target = await c.env.DB.prepare('SELECT id, email, role, status FROM users WHERE id = ?1 LIMIT 1')
    .bind(targetId)
    .first<{ id: string; email: string; role: 'user' | 'admin'; status: 'active' | 'disabled' }>();

  if (!target) {
    return c.json({ error: 'User not found.' }, 404);
  }

  const nextStatus =
    body.status === 'active' || body.status === 'disabled' ? body.status : target.status;
  const nextRole =
    body.role === 'user' || body.role === 'admin' ? body.role : target.role;

  if (target.id === currentUser.id && (nextStatus === 'disabled' || nextRole !== 'admin')) {
    return c.json({ error: 'You cannot disable or demote your own administrator account.' }, 400);
  }

  await c.env.DB.prepare('UPDATE users SET status = ?1, role = ?2 WHERE id = ?3')
    .bind(nextStatus, nextRole, targetId)
    .run();

  if (nextStatus === 'disabled') {
    await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(targetId).run();
  }

  return c.json({
    ok: true,
    user: {
      ...target,
      status: nextStatus,
      role: nextRole,
    },
  });
});

adminRoutes.get('/ai-usage', async (c) => {
  const [byUser, recentErrors, recentRequests] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
         a.user_id,
         COALESCE(u.email, 'deleted-user') as email,
         COUNT(*) as request_count,
         COALESCE(SUM(a.input_tokens), 0) as input_tokens,
         COALESCE(SUM(a.output_tokens), 0) as output_tokens,
         COALESCE(SUM(a.estimated_cost), 0) as estimated_cost,
         SUM(CASE WHEN a.status = 'error' THEN 1 ELSE 0 END) as error_count,
         MAX(a.created_at) as last_request_at
       FROM ai_usage a
       LEFT JOIN users u ON u.id = a.user_id
       GROUP BY a.user_id, u.email
       ORDER BY request_count DESC
       LIMIT 100`
    ).all(),
    c.env.DB.prepare(
      `SELECT a.id, a.user_id, u.email, a.request_type, a.model, a.error_message, a.created_at
       FROM ai_usage a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.status = 'error'
       ORDER BY a.created_at DESC
       LIMIT 30`
    ).all(),
    c.env.DB.prepare(
      `SELECT a.id, a.user_id, u.email, a.request_type, a.model, a.input_tokens, a.output_tokens, a.estimated_cost, a.status, a.created_at
       FROM ai_usage a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT 50`
    ).all(),
  ]);

  return c.json({
    by_user: byUser.results ?? [],
    recent_errors: recentErrors.results ?? [],
    recent_requests: recentRequests.results ?? [],
  });
});

