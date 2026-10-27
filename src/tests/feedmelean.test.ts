import { describe, expect, it } from 'vitest';
import {
  calculateGoalMetrics,
  calculateNavyBodyFat,
  computeWeightHistoryAndTrend,
  lbToKg,
} from '../shared/nutritionMath';
import {
  generateSecureToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from '../worker/services/crypto';

describe('FeedMeLean Body Composition & Goal Math', () => {
  it('calculates exact Lean Body Mass, Target Weight (158.7 lb), and Fat to Lose (20.3 lb) for 179 lb @ 22% -> 12% BF', () => {
    const metrics = calculateGoalMetrics({
      unit_system: 'imperial',
      weight_kg: lbToKg(179),
      current_body_fat: 22,
      target_body_fat: 12,
      age: 35,
      sex: 'male',
      height_cm: 177.8,
      activity_level: 'light',
      calorie_deficit: 500,
      protein_target: 150,
    });

    expect(metrics.currentWeightDisplay).toBe(179);
    expect(metrics.leanBodyMassDisplay).toBe(139.6);
    expect(metrics.targetWeightDisplay).toBe(158.7);
    expect(metrics.fatToLoseDisplay).toBe(20.3);
    expect(metrics.dailyCalorieTarget).toBe(metrics.tdee - 500);
    expect(metrics.proteinTarget).toBe(150);
    expect(metrics.safetyWarning).toBeNull();
  });

  it('triggers safety warning when daily calorie target falls below safe minimum', () => {
    const metrics = calculateGoalMetrics({
      unit_system: 'imperial',
      weight_kg: lbToKg(150),
      current_body_fat: 20,
      target_body_fat: 12,
      age: 40,
      sex: 'male',
      height_cm: 170,
      activity_level: 'sedentary',
      calorie_deficit: 900,
      protein_target: 140,
    });

    expect(metrics.dailyCalorieTarget).toBeLessThan(1500);
    expect(metrics.safetyWarning).toBeTruthy();
  });

  it('calculates U.S. Navy body-fat estimate when waist and neck are provided', () => {
    const bf = calculateNavyBodyFat({
      sex: 'male',
      heightCm: 178,
      waistCm: 92,
      neckCm: 39,
    });
    expect(bf).not.toBeNull();
    expect(bf!).toBeGreaterThan(15);
    expect(bf!).toBeLessThan(30);
  });

  it('computes 7-day rolling weight average and weekly trend', () => {
    const logs = [
      { id: '1', user_id: 'u1', weight_kg: lbToKg(180.0), measured_at: '2026-10-01T08:00:00Z', created_at: '' },
      { id: '2', user_id: 'u1', weight_kg: lbToKg(179.4), measured_at: '2026-10-04T08:00:00Z', created_at: '' },
      { id: '3', user_id: 'u1', weight_kg: lbToKg(179.0), measured_at: '2026-10-08T08:00:00Z', created_at: '' },
      { id: '4', user_id: 'u1', weight_kg: lbToKg(178.2), measured_at: '2026-10-15T08:00:00Z', created_at: '' },
    ];
    const res = computeWeightHistoryAndTrend(logs, 'imperial');
    expect(res.points).toHaveLength(4);
    expect(res.weeklyTrendDisplay).not.toBeNull();
    expect(res.weeklyTrendDisplay!).toBeLessThan(0);
  });
});

describe('FeedMeLean Crypto & Auth Security', () => {
  it('hashes and verifies passwords with PBKDF2-SHA256', async () => {
    const hash = await hashPassword('CorrectHorseBatteryStaple!');
    expect(hash.startsWith('pbkdf2_sha256$100000$')).toBe(true);
    expect(await verifyPassword('CorrectHorseBatteryStaple!', hash)).toBe(true);
    expect(await verifyPassword('WrongPassword!', hash)).toBe(false);
  });

  it('generates random tokens and deterministic SHA-256 hashes', async () => {
    const t1 = generateSecureToken(32);
    const t2 = generateSecureToken(32);
    expect(t1).toHaveLength(64);
    expect(t1).not.toBe(t2);

    const h1 = await sha256Hex(t1);
    const h2 = await sha256Hex(t1);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
});

