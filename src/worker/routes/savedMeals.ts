import { Hono } from 'hono';
import type { AppContext } from '../types';
import { requireAuth } from '../middleware/auth';
import { getLocalDateString } from '../../shared/nutritionMath';
import type { MealLog, SavedMeal } from '../../shared/types';

export const savedMealRoutes = new Hono<AppContext>();

savedMealRoutes.use('*', requireAuth);

savedMealRoutes.get('/', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT id, user_id, name, description, calories, protein, carbs, fat, use_count, last_used_at, created_at
     FROM saved_meals
     WHERE user_id = ?1
     ORDER BY use_count DESC, COALESCE(last_used_at, created_at) DESC`
  )
    .bind(user.id)
    .all<SavedMeal>();

  return c.json({ saved_meals: results });
});

savedMealRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : description.slice(0, 60);

  if (!name || !description) {
    return c.json({ error: 'Meal name and description are required.' }, 400);
  }

  const calories = Math.max(0, Math.min(15000, Math.round(Number(body.calories) || 0)));
  const protein = Math.max(0, Math.min(600, Math.round((Number(body.protein) || 0) * 10) / 10));
  const carbs = Math.max(0, Math.min(1500, Math.round((Number(body.carbs) || 0) * 10) / 10));
  const fat = Math.max(0, Math.min(600, Math.round((Number(body.fat) || 0) * 10) / 10));

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO saved_meals (id, user_id, name, description, calories, protein, carbs, fat, use_count, last_used_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?9)`
  )
    .bind(id, user.id, name, description, calories, protein, carbs, fat, nowIso)
    .run();

  const savedMeal: SavedMeal = {
    id,
    user_id: user.id,
    name,
    description,
    calories,
    protein,
    carbs,
    fat,
    use_count: 0,
    last_used_at: nowIso,
    created_at: nowIso,
  };

  return c.json({ saved_meal: savedMeal }, 201);
});

savedMealRoutes.post('/:id/log', async (c) => {
  const user = c.get('user');
  const savedId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const saved = await c.env.DB.prepare(
    'SELECT * FROM saved_meals WHERE id = ?1 AND user_id = ?2 LIMIT 1'
  )
    .bind(savedId, user.id)
    .first<SavedMeal>();

  if (!saved) {
    return c.json({ error: 'Saved meal not found.' }, 404);
  }

  const profileRow = await c.env.DB.prepare(
    'SELECT timezone FROM user_profiles WHERE user_id = ?1 LIMIT 1'
  )
    .bind(user.id)
    .first<{ timezone: string }>();
  const timezone = profileRow?.timezone || 'America/New_York';

  const nowIso = new Date().toISOString();
  const consumedAt =
    typeof body.consumed_at === 'string' && !isNaN(new Date(body.consumed_at).getTime())
      ? new Date(body.consumed_at).toISOString()
      : nowIso;
  const localDate =
    typeof body.local_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.local_date)
      ? body.local_date
      : getLocalDateString(consumedAt, timezone);

  const mealLogId = crypto.randomUUID();
  const nextUseCount = saved.use_count + 1;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO meal_logs (id, user_id, description, calories, protein, carbs, fat, consumed_at, local_date, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`
    ).bind(
      mealLogId,
      user.id,
      saved.name,
      saved.calories,
      saved.protein,
      saved.carbs,
      saved.fat,
      consumedAt,
      localDate,
      nowIso
    ),
    c.env.DB.prepare(
      'UPDATE saved_meals SET use_count = ?1, last_used_at = ?2 WHERE id = ?3 AND user_id = ?4'
    ).bind(nextUseCount, nowIso, savedId, user.id),
  ]);

  const meal: MealLog = {
    id: mealLogId,
    user_id: user.id,
    description: saved.name,
    calories: saved.calories,
    protein: saved.protein,
    carbs: saved.carbs,
    fat: saved.fat,
    consumed_at: consumedAt,
    local_date: localDate,
    created_at: nowIso,
    updated_at: nowIso,
  };

  return c.json({
    meal,
    saved_meal: {
      ...saved,
      use_count: nextUseCount,
      last_used_at: nowIso,
    },
  });
});

savedMealRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const savedId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const existing = await c.env.DB.prepare(
    'SELECT * FROM saved_meals WHERE id = ?1 AND user_id = ?2 LIMIT 1'
  )
    .bind(savedId, user.id)
    .first<SavedMeal>();

  if (!existing) {
    return c.json({ error: 'Saved meal not found.' }, 404);
  }

  const name =
    typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name;
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

  await c.env.DB.prepare(
    `UPDATE saved_meals
     SET name = ?1, description = ?2, calories = ?3, protein = ?4, carbs = ?5, fat = ?6
     WHERE id = ?7 AND user_id = ?8`
  )
    .bind(name, description, calories, protein, carbs, fat, savedId, user.id)
    .run();

  return c.json({
    saved_meal: {
      ...existing,
      name,
      description,
      calories,
      protein,
      carbs,
      fat,
    },
  });
});

savedMealRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const savedId = c.req.param('id');

  const res = await c.env.DB.prepare('DELETE FROM saved_meals WHERE id = ?1 AND user_id = ?2')
    .bind(savedId, user.id)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: 'Saved meal not found.' }, 404);
  }

  return c.json({ ok: true, id: savedId });
});

