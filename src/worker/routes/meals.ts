import { Hono } from 'hono';
import type { AppContext } from '../types';
import { requireAuth } from '../middleware/auth';
import { checkRateLimit } from '../middleware/rateLimit';
import { analyzeMealWithAI } from '../services/ai';
import { getLocalDateString } from '../../shared/nutritionMath';
import type { MealLog } from '../../shared/types';

export const mealRoutes = new Hono<AppContext>();

mealRoutes.use('*', requireAuth);

async function getUserTimezone(db: D1Database, userId: string): Promise<string> {
  const row = await db
    .prepare('SELECT timezone FROM user_profiles WHERE user_id = ?1 LIMIT 1')
    .bind(userId)
    .first<{ timezone: string }>();
  return row?.timezone || 'America/New_York';
}

mealRoutes.post('/analyze', async (c) => {
  const user = c.get('user');
  const rl = await checkRateLimit(c.env.DB, `ai_meal:${user.id}`, 45, 3600);
  if (!rl.allowed) {
    return c.json(
      { error: `AI analysis rate limit reached. Try again in ${Math.ceil(rl.retryAfterSeconds / 60)} minutes.` },
      429
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const imageDataUrl =
    typeof body.image_data_url === 'string' && body.image_data_url.startsWith('data:image/')
      ? body.image_data_url
      : undefined;

  if (!description && !imageDataUrl) {
    return c.json({ error: 'Please enter a meal description or attach a photo to analyze.' }, 400);
  }
  if (description.length > 600) {
    return c.json({ error: 'Meal description must be under 600 characters.' }, 400);
  }

  const result = await analyzeMealWithAI(c.env, user.id, description, imageDataUrl);
  return c.json(result);
});

mealRoutes.get('/', async (c) => {
  const user = c.get('user');
  const requestedDate = c.req.query('date');
  const includeRecent = c.req.query('include_recent') === '1';

  const timezone = await getUserTimezone(c.env.DB, user.id);
  const localDate =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : getLocalDateString(new Date(), timezone);

  const { results: meals } = await c.env.DB.prepare(
    `SELECT id, user_id, description, calories, protein, carbs, fat, consumed_at, local_date, created_at, updated_at
     FROM meal_logs
     WHERE user_id = ?1 AND local_date = ?2
     ORDER BY consumed_at ASC`
  )
    .bind(user.id, localDate)
    .all<MealLog>();

  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: Math.round((acc.protein + m.protein) * 10) / 10,
      carbs: Math.round((acc.carbs + m.carbs) * 10) / 10,
      fat: Math.round((acc.fat + m.fat) * 10) / 10,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  let recentMeals: MealLog[] = [];
  if (includeRecent) {
    const { results } = await c.env.DB.prepare(
      `SELECT id, user_id, description, calories, protein, carbs, fat, MAX(consumed_at) as consumed_at, local_date, created_at, updated_at
       FROM meal_logs
       WHERE user_id = ?1
       GROUP BY LOWER(TRIM(description))
       ORDER BY MAX(consumed_at) DESC
       LIMIT 8`
    )
      .bind(user.id)
      .all<MealLog>();
    recentMeals = results;
  }

  return c.json({
    date: localDate,
    timezone,
    totals,
    meals,
    recent_meals: recentMeals,
  });
});

mealRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description) {
    return c.json({ error: 'Meal description is required.' }, 400);
  }

  const calories = Math.max(0, Math.min(15000, Math.round(Number(body.calories) || 0)));
  const protein = Math.max(0, Math.min(600, Math.round((Number(body.protein) || 0) * 10) / 10));
  const carbs = Math.max(0, Math.min(1500, Math.round((Number(body.carbs) || 0) * 10) / 10));
  const fat = Math.max(0, Math.min(600, Math.round((Number(body.fat) || 0) * 10) / 10));

  const timezone = await getUserTimezone(c.env.DB, user.id);
  const nowIso = new Date().toISOString();
  const consumedAt =
    typeof body.consumed_at === 'string' && !isNaN(new Date(body.consumed_at).getTime())
      ? new Date(body.consumed_at).toISOString()
      : nowIso;

  const localDate =
    typeof body.local_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.local_date)
      ? body.local_date
      : getLocalDateString(consumedAt, timezone);

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO meal_logs (id, user_id, description, calories, protein, carbs, fat, consumed_at, local_date, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`
  )
    .bind(id, user.id, description, calories, protein, carbs, fat, consumedAt, localDate, nowIso)
    .run();

  const meal: MealLog = {
    id,
    user_id: user.id,
    description,
    calories,
    protein,
    carbs,
    fat,
    consumed_at: consumedAt,
    local_date: localDate,
    created_at: nowIso,
    updated_at: nowIso,
  };

  return c.json({ meal }, 201);
});

mealRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const mealId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const existing = await c.env.DB.prepare(
    'SELECT * FROM meal_logs WHERE id = ?1 AND user_id = ?2 LIMIT 1'
  )
    .bind(mealId, user.id)
    .first<MealLog>();

  if (!existing) {
    return c.json({ error: 'Meal log not found.' }, 404);
  }

  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : existing.description;
  const calories =
    body.calories !== undefined
      ? Math.max(0, Math.min(15000, Math.round(Number(body.calories) || 0)))
      : existing.calories;
  const protein =
    body.protein !== undefined
      ? Math.max(0, Math.min(600, Math.round((Number(body.protein) || 0) * 10) / 10))
      : existing.protein;
  const carbs =
    body.carbs !== undefined
      ? Math.max(0, Math.min(1500, Math.round((Number(body.carbs) || 0) * 10) / 10))
      : existing.carbs;
  const fat =
    body.fat !== undefined
      ? Math.max(0, Math.min(600, Math.round((Number(body.fat) || 0) * 10) / 10))
      : existing.fat;

  const timezone = await getUserTimezone(c.env.DB, user.id);
  const consumedAt =
    typeof body.consumed_at === 'string' && !isNaN(new Date(body.consumed_at).getTime())
      ? new Date(body.consumed_at).toISOString()
      : existing.consumed_at;

  const localDate =
    typeof body.local_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.local_date)
      ? body.local_date
      : getLocalDateString(consumedAt, timezone);

  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE meal_logs
     SET description = ?1, calories = ?2, protein = ?3, carbs = ?4, fat = ?5, consumed_at = ?6, local_date = ?7, updated_at = ?8
     WHERE id = ?9 AND user_id = ?10`
  )
    .bind(
      description,
      calories,
      protein,
      carbs,
      fat,
      consumedAt,
      localDate,
      nowIso,
      mealId,
      user.id
    )
    .run();

  return c.json({
    meal: {
      ...existing,
      description,
      calories,
      protein,
      carbs,
      fat,
      consumed_at: consumedAt,
      local_date: localDate,
      updated_at: nowIso,
    },
  });
});

mealRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const mealId = c.req.param('id');

  const res = await c.env.DB.prepare('DELETE FROM meal_logs WHERE id = ?1 AND user_id = ?2')
    .bind(mealId, user.id)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: 'Meal log not found.' }, 404);
  }

  return c.json({ ok: true, id: mealId });
});

