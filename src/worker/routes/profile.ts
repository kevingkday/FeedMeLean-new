import { Hono } from 'hono';
import type { AppContext } from '../types';
import { requireAuth } from '../middleware/auth';
import { checkRateLimit } from '../middleware/rateLimit';
import { estimateBodyFatWithAI, suggestPlanWithAI } from '../services/ai';
import { computeWeightHistoryAndTrend } from '../../shared/nutritionMath';
import type { ActivityLevel, Sex, UnitSystem, UserProfile, WeightLog } from '../../shared/types';

export const profileRoutes = new Hono<AppContext>();

profileRoutes.use('*', requireAuth);

const VALID_ACTIVITIES: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

profileRoutes.get('/', async (c) => {
  const user = c.get('user');
  const profile = await c.env.DB.prepare('SELECT * FROM user_profiles WHERE user_id = ?1 LIMIT 1')
    .bind(user.id)
    .first<UserProfile>();

  const { results: weightLogs } = await c.env.DB.prepare(
    'SELECT id, user_id, weight_kg, measured_at, created_at FROM weight_logs WHERE user_id = ?1 ORDER BY measured_at ASC LIMIT 180'
  )
    .bind(user.id)
    .all<WeightLog>();

  const unit: UnitSystem = profile?.unit_system === 'metric' ? 'metric' : 'imperial';
  const weightTrend = computeWeightHistoryAndTrend(weightLogs, unit);

  return c.json({
    profile,
    weight_logs: weightLogs,
    weight_points: weightTrend.points,
    weekly_trend_display: weightTrend.weeklyTrendDisplay,
  });
});

profileRoutes.put('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const existing = await c.env.DB.prepare('SELECT * FROM user_profiles WHERE user_id = ?1 LIMIT 1')
    .bind(user.id)
    .first<UserProfile>();

  const age =
    body.age !== undefined
      ? body.age === null
        ? null
        : Math.max(13, Math.min(110, Math.round(Number(body.age))))
      : existing?.age ?? 35;

  const sex: Sex | null =
    body.sex === 'male' || body.sex === 'female' ? body.sex : existing?.sex ?? 'male';

  const heightCm =
    body.height_cm !== undefined
      ? body.height_cm === null
        ? null
        : Math.max(100, Math.min(250, Number(body.height_cm)))
      : existing?.height_cm ?? 177.8;

  const weightKg =
    body.weight_kg !== undefined
      ? body.weight_kg === null
        ? null
        : Math.max(30, Math.min(350, Number(body.weight_kg)))
      : existing?.weight_kg ?? 81.19;

  const neckCm =
    body.neck_cm !== undefined
      ? body.neck_cm === null || body.neck_cm === ''
        ? null
        : Math.max(20, Math.min(80, Number(body.neck_cm)))
      : existing?.neck_cm ?? null;

  const waistCm =
    body.waist_cm !== undefined
      ? body.waist_cm === null || body.waist_cm === ''
        ? null
        : Math.max(40, Math.min(200, Number(body.waist_cm)))
      : existing?.waist_cm ?? null;

  const hipCm =
    body.hip_cm !== undefined
      ? body.hip_cm === null || body.hip_cm === ''
        ? null
        : Math.max(40, Math.min(200, Number(body.hip_cm)))
      : existing?.hip_cm ?? null;

  const activityLevel: ActivityLevel = VALID_ACTIVITIES.includes(body.activity_level)
    ? body.activity_level
    : existing?.activity_level ?? 'light';

  const currentBodyFat =
    body.current_body_fat !== undefined
      ? body.current_body_fat === null
        ? null
        : Math.max(3, Math.min(70, Number(body.current_body_fat)))
      : existing?.current_body_fat ?? 22;

  const targetBodyFat =
    body.target_body_fat !== undefined
      ? body.target_body_fat === null
        ? null
        : Math.max(3, Math.min(60, Number(body.target_body_fat)))
      : existing?.target_body_fat ?? 12;

  const calorieDeficit =
    body.calorie_deficit !== undefined
      ? Math.max(0, Math.min(2000, Math.round(Number(body.calorie_deficit))))
      : existing?.calorie_deficit ?? 500;

  const proteinTarget =
    body.protein_target !== undefined
      ? Math.max(30, Math.min(450, Math.round(Number(body.protein_target))))
      : existing?.protein_target ?? 150;

  const carbsTarget =
    body.carbs_target !== undefined
      ? body.carbs_target === null || body.carbs_target === ''
        ? null
        : Math.max(0, Math.min(1000, Math.round(Number(body.carbs_target))))
      : existing?.carbs_target ?? null;

  const fatTarget =
    body.fat_target !== undefined
      ? body.fat_target === null || body.fat_target === ''
        ? null
        : Math.max(15, Math.min(300, Math.round(Number(body.fat_target))))
      : existing?.fat_target ?? null;

  const unitSystem: UnitSystem =
    body.unit_system === 'metric' || body.unit_system === 'imperial'
      ? body.unit_system
      : existing?.unit_system ?? 'imperial';

  const timezone =
    typeof body.timezone === 'string' && body.timezone.trim()
      ? body.timezone.trim()
      : existing?.timezone ?? 'America/New_York';

  const preferences =
    typeof body.preferences === 'string'
      ? body.preferences
      : existing?.preferences ?? '{}';

  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO user_profiles (
       user_id, age, sex, height_cm, weight_kg, neck_cm, waist_cm, hip_cm,
       activity_level, current_body_fat, target_body_fat, calorie_deficit,
       protein_target, carbs_target, fat_target, unit_system, timezone, preferences, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
     ON CONFLICT(user_id) DO UPDATE SET
       age = excluded.age,
       sex = excluded.sex,
       height_cm = excluded.height_cm,
       weight_kg = excluded.weight_kg,
       neck_cm = excluded.neck_cm,
       waist_cm = excluded.waist_cm,
       hip_cm = excluded.hip_cm,
       activity_level = excluded.activity_level,
       current_body_fat = excluded.current_body_fat,
       target_body_fat = excluded.target_body_fat,
       calorie_deficit = excluded.calorie_deficit,
       protein_target = excluded.protein_target,
       carbs_target = excluded.carbs_target,
       fat_target = excluded.fat_target,
       unit_system = excluded.unit_system,
       timezone = excluded.timezone,
       preferences = excluded.preferences,
       updated_at = excluded.updated_at`
  )
    .bind(
      user.id,
      age,
      sex,
      heightCm,
      weightKg,
      neckCm,
      waistCm,
      hipCm,
      activityLevel,
      currentBodyFat,
      targetBodyFat,
      calorieDeficit,
      proteinTarget,
      carbsTarget,
      fatTarget,
      unitSystem,
      timezone,
      preferences,
      nowIso
    )
    .run();

  if (
    weightKg &&
    (body.record_weight_log === true ||
      (existing?.weight_kg && Math.abs(weightKg - existing.weight_kg) >= 0.05))
  ) {
    await c.env.DB.prepare(
      'INSERT INTO weight_logs (id, user_id, weight_kg, measured_at, created_at) VALUES (?1, ?2, ?3, ?4, ?4)'
    )
      .bind(crypto.randomUUID(), user.id, weightKg, nowIso)
      .run();
  }

  const updated = await c.env.DB.prepare('SELECT * FROM user_profiles WHERE user_id = ?1 LIMIT 1')
    .bind(user.id)
    .first<UserProfile>();

  return c.json({ profile: updated });
});

profileRoutes.post('/estimate-body-fat', async (c) => {
  const user = c.get('user');
  const rl = await checkRateLimit(c.env.DB, `ai_bf:${user.id}`, 15, 3600);
  if (!rl.allowed) {
    return c.json({ error: 'Rate limit reached for AI estimation. Please try again later.' }, 429);
  }

  const body = await c.req.json().catch(() => ({}));
  const profile = await c.env.DB.prepare('SELECT * FROM user_profiles WHERE user_id = ?1 LIMIT 1')
    .bind(user.id)
    .first<UserProfile>();

  const age = Number(body.age ?? profile?.age ?? 35);
  const sex = (body.sex ?? profile?.sex ?? 'male') === 'female' ? 'female' : 'male';
  const heightCm = Number(body.height_cm ?? profile?.height_cm ?? 177.8);
  const weightKg = Number(body.weight_kg ?? profile?.weight_kg ?? 81.19);
  const activityLevel = String(body.activity_level ?? profile?.activity_level ?? 'light');
  const waistCm = body.waist_cm ? Number(body.waist_cm) : profile?.waist_cm ?? null;
  const neckCm = body.neck_cm ? Number(body.neck_cm) : profile?.neck_cm ?? null;
  const hipCm = body.hip_cm ? Number(body.hip_cm) : profile?.hip_cm ?? null;
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 300) : undefined;

  const result = await estimateBodyFatWithAI(c.env, user.id, {
    age,
    sex,
    heightCm,
    weightKg,
    activityLevel,
    waistCm,
    neckCm,
    hipCm,
    notes,
  });

  return c.json(result);
});

profileRoutes.post('/suggest-plan', async (c) => {
  const user = c.get('user');
  const rl = await checkRateLimit(c.env.DB, `ai_plan:${user.id}`, 15, 3600);
  if (!rl.allowed) {
    return c.json({ error: 'Rate limit reached for AI plan suggestions. Please try again later.' }, 429);
  }

  const body = await c.req.json().catch(() => ({}));
  const existing = await c.env.DB.prepare('SELECT * FROM user_profiles WHERE user_id = ?1 LIMIT 1')
    .bind(user.id)
    .first<UserProfile>();

  if (!existing) {
    return c.json({ error: 'Please complete your profile first.' }, 400);
  }

  const mergedProfile: UserProfile = {
    ...existing,
    age: body.age !== undefined ? Number(body.age) : existing.age,
    sex: body.sex === 'male' || body.sex === 'female' ? body.sex : existing.sex,
    height_cm: body.height_cm !== undefined ? Number(body.height_cm) : existing.height_cm,
    weight_kg: body.weight_kg !== undefined ? Number(body.weight_kg) : existing.weight_kg,
    current_body_fat:
      body.current_body_fat !== undefined ? Number(body.current_body_fat) : existing.current_body_fat,
    target_body_fat:
      body.target_body_fat !== undefined ? Number(body.target_body_fat) : existing.target_body_fat,
    activity_level: VALID_ACTIVITIES.includes(body.activity_level)
      ? body.activity_level
      : existing.activity_level,
    unit_system:
      body.unit_system === 'metric' || body.unit_system === 'imperial'
        ? body.unit_system
        : existing.unit_system,
  };

  const suggestion = await suggestPlanWithAI(c.env, user.id, mergedProfile);
  return c.json(suggestion);
});

profileRoutes.get('/weights', async (c) => {
  const user = c.get('user');
  const profile = await c.env.DB.prepare('SELECT unit_system FROM user_profiles WHERE user_id = ?1 LIMIT 1')
    .bind(user.id)
    .first<{ unit_system: UnitSystem }>();

  const { results: logs } = await c.env.DB.prepare(
    'SELECT id, user_id, weight_kg, measured_at, created_at FROM weight_logs WHERE user_id = ?1 ORDER BY measured_at ASC LIMIT 180'
  )
    .bind(user.id)
    .all<WeightLog>();

  const unit: UnitSystem = profile?.unit_system === 'metric' ? 'metric' : 'imperial';
  const computed = computeWeightHistoryAndTrend(logs, unit);

  return c.json({
    weight_logs: logs,
    weight_points: computed.points,
    weekly_trend_display: computed.weeklyTrendDisplay,
  });
});

profileRoutes.post('/weights', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const weightKg = Number(body.weight_kg);
  if (!weightKg || weightKg < 30 || weightKg > 350) {
    return c.json({ error: 'Please enter a valid weight.' }, 400);
  }

  const nowIso = new Date().toISOString();
  const measuredAt =
    typeof body.measured_at === 'string' && !isNaN(new Date(body.measured_at).getTime())
      ? new Date(body.measured_at).toISOString()
      : nowIso;

  const id = crypto.randomUUID();

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO weight_logs (id, user_id, weight_kg, measured_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)'
    ).bind(id, user.id, weightKg, measuredAt, nowIso),
    c.env.DB.prepare(
      'UPDATE user_profiles SET weight_kg = ?1, updated_at = ?2 WHERE user_id = ?3'
    ).bind(weightKg, nowIso, user.id),
  ]);

  return c.json(
    {
      weight_log: {
        id,
        user_id: user.id,
        weight_kg: weightKg,
        measured_at: measuredAt,
        created_at: nowIso,
      },
    },
    201
  );
});

profileRoutes.delete('/weights/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const res = await c.env.DB.prepare('DELETE FROM weight_logs WHERE id = ?1 AND user_id = ?2')
    .bind(id, user.id)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: 'Weight entry not found.' }, 404);
  }

  // Sync profile weight_kg to latest remaining weight log if available
  const latest = await c.env.DB.prepare(
    'SELECT weight_kg FROM weight_logs WHERE user_id = ?1 ORDER BY measured_at DESC LIMIT 1'
  )
    .bind(user.id)
    .first<{ weight_kg: number }>();

  if (latest) {
    await c.env.DB.prepare('UPDATE user_profiles SET weight_kg = ?1 WHERE user_id = ?2')
      .bind(latest.weight_kg, user.id)
      .run();
  }

  return c.json({ ok: true, id });
});

