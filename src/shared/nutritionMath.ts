import type { ActivityLevel, GoalMetrics, Sex, UnitSystem, UserProfile, WeightLog, WeightPointWithRolling } from './types';

export const LB_PER_KG = 2.20462262185;
export const CM_PER_INCH = 2.54;
export const KCAL_PER_KG_FAT = 7700;
export const KCAL_PER_LB_FAT = 3500;

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

export function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cmToInches(cm));
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet, inches };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

export function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

/**
 * U.S. Navy Circumference Body Fat Formula (optional measurement reference)
 */
export function calculateNavyBodyFat(params: {
  sex: Sex;
  heightCm: number;
  waistCm: number;
  neckCm: number;
  hipCm?: number | null;
}): number | null {
  const { sex, heightCm, waistCm, neckCm, hipCm } = params;
  if (heightCm <= 0 || waistCm <= 0 || neckCm <= 0) return null;

  if (sex === 'male') {
    const diff = waistCm - neckCm;
    if (diff <= 0) return null;
    const bf = 495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(heightCm)) - 450;
    return bf > 2 && bf < 65 ? round1(bf) : null;
  } else {
    if (!hipCm || hipCm <= 0) return null;
    const sum = waistCm + hipCm - neckCm;
    if (sum <= 0) return null;
    const bf = 495 / (1.29579 - 0.35004 * Math.log10(sum) + 0.22100 * Math.log10(heightCm)) - 450;
    return bf > 5 && bf < 70 ? round1(bf) : null;
  }
}

/**
 * Mifflin-St Jeor BMR & TDEE
 */
export function calculateTdee(params: {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
}): { bmr: number; tdee: number } {
  const { sex, age, heightCm, weightKg, activityLevel } = params;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const bmr = Math.round(sex === 'male' ? base + 5 : base - 161);
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.375;
  const tdee = Math.round(bmr * multiplier);
  return { bmr, tdee };
}

/**
 * Core Body Composition & Goal Calculations
 *
 * Lean body mass = Current weight * (1 - Current body-fat percentage)
 * Target weight = Lean body mass / (1 - Target body-fat percentage)
 * Fat to lose = Current weight - Target weight
 */
export function calculateGoalMetrics(
  profile: Partial<UserProfile>,
  latestWeightKg?: number | null,
  initialWeightKg?: number | null,
  nowDate: Date = new Date()
): GoalMetrics {
  const unit: UnitSystem = profile.unit_system === 'metric' ? 'metric' : 'imperial';
  const weightKg = latestWeightKg ?? profile.weight_kg ?? 81.19; // ~179 lb fallback
  const currentBf = profile.current_body_fat ?? 22;
  const targetBf = profile.target_body_fat ?? 12;
  const age = profile.age ?? 35;
  const sex: Sex = profile.sex ?? 'male';
  const heightCm = profile.height_cm ?? 178;
  const activity: ActivityLevel = profile.activity_level ?? 'light';
  const deficit = profile.calorie_deficit ?? 500;

  const isComplete = Boolean(
    profile.weight_kg &&
      profile.current_body_fat &&
      profile.target_body_fat &&
      profile.age &&
      profile.sex &&
      profile.height_cm
  );

  const currentWeightDisplayRaw = unit === 'imperial' ? kgToLb(weightKg) : weightKg;
  const currentWeightDisplay = round1(currentWeightDisplayRaw);

  // Use the rounded display weight in the user's unit system so numbers match exact user entry (e.g. 179 lb -> 158.7 lb -> 20.3 lb)
  const bfFraction = Math.min(0.7, Math.max(0.03, currentBf / 100));
  const targetBfFraction = Math.min(0.65, Math.max(0.03, targetBf / 100));

  const leanBodyMassDisplayRaw = currentWeightDisplay * (1 - bfFraction);
  const targetWeightDisplayRaw = leanBodyMassDisplayRaw / (1 - targetBfFraction);
  const fatToLoseDisplayRaw = Math.max(0, currentWeightDisplay - targetWeightDisplayRaw);

  const leanBodyMassDisplay = round1(leanBodyMassDisplayRaw);
  const targetWeightDisplay = round1(targetWeightDisplayRaw);
  const fatToLoseDisplay = round1(fatToLoseDisplayRaw);

  const leanBodyMassKg = unit === 'imperial' ? lbToKg(leanBodyMassDisplayRaw) : leanBodyMassDisplayRaw;
  const targetWeightKg = unit === 'imperial' ? lbToKg(targetWeightDisplayRaw) : targetWeightDisplayRaw;
  const fatToLoseKg = Math.max(0, weightKg - targetWeightKg);

  const { bmr, tdee } = calculateTdee({
    sex,
    age,
    heightCm,
    weightKg,
    activityLevel: activity,
  });

  const dailyCalorieTarget = Math.max(800, tdee - deficit);

  // Default protein target: user-configured or ~2.0g per kg of lean body mass (~1g/lb LBM)
  const proteinTarget =
    profile.protein_target && profile.protein_target > 0
      ? Math.round(profile.protein_target)
      : Math.round(kgToLb(leanBodyMassKg));

  // Default fat target: user-configured or 27% of calories (9 kcal/g)
  const fatTarget =
    profile.fat_target && profile.fat_target > 0
      ? Math.round(profile.fat_target)
      : Math.max(35, Math.round((dailyCalorieTarget * 0.27) / 9));

  // Default carbs target: user-configured or remaining calories / 4
  const remainingKcalForCarbs = Math.max(0, dailyCalorieTarget - proteinTarget * 4 - fatTarget * 9);
  const carbsTarget =
    profile.carbs_target && profile.carbs_target > 0
      ? Math.round(profile.carbs_target)
      : Math.round(remainingKcalForCarbs / 4);

  // Planned weekly loss
  const plannedWeeklyLossLb = deficit > 0 ? round1((deficit * 7) / KCAL_PER_LB_FAT) : 0;
  const plannedWeeklyLossKg = deficit > 0 ? round1((deficit * 7) / KCAL_PER_KG_FAT) : 0;
  const plannedWeeklyLossDisplay = unit === 'imperial' ? plannedWeeklyLossLb : plannedWeeklyLossKg;

  // Days to goal based on remaining fat to lose and daily deficit
  let daysToGoal: number | null = null;
  let estimatedGoalDate: string | null = null;

  if (fatToLoseDisplayRaw > 0 && deficit > 0) {
    const totalKcalToBurn =
      unit === 'imperial' ? fatToLoseDisplayRaw * KCAL_PER_LB_FAT : fatToLoseKg * KCAL_PER_KG_FAT;
    daysToGoal = Math.ceil(totalKcalToBurn / deficit);
    const goalDateObj = new Date(nowDate.getTime() + daysToGoal * 86400_000);
    estimatedGoalDate = goalDateObj.toISOString().slice(0, 10);
  } else if (fatToLoseDisplayRaw <= 0) {
    daysToGoal = 0;
    estimatedGoalDate = nowDate.toISOString().slice(0, 10);
  }

  // Progress calculation
  let progressPercent = 0;
  const startWeightKg = initialWeightKg && initialWeightKg > targetWeightKg ? initialWeightKg : profile.weight_kg ?? weightKg;
  const totalToLoseKg = startWeightKg - targetWeightKg;
  if (totalToLoseKg > 0.1) {
    const lostSoFar = startWeightKg - weightKg;
    progressPercent = Math.min(100, Math.max(0, Math.round((lostSoFar / totalToLoseKg) * 100)));
  } else if (weightKg <= targetWeightKg) {
    progressPercent = 100;
  }

  // Safety limits and warnings
  let safetyWarning: string | null = null;
  const minSafeCalories = sex === 'male' ? 1500 : 1200;
  if (dailyCalorieTarget < minSafeCalories) {
    safetyWarning = `Your daily calorie target (${dailyCalorieTarget.toLocaleString()} kcal) is below the standard recommended minimum of ${minSafeCalories.toLocaleString()} kcal/day for ${sex === 'male' ? 'men' : 'women'}. Consider a smaller calorie deficit to preserve lean muscle mass.`;
  } else if (deficit > 1000) {
    safetyWarning = `A daily deficit of ${deficit} kcal (>2 lb/week) is aggressive and increases the risk of losing lean muscle mass alongside fat.`;
  } else if (targetBf < (sex === 'male' ? 5 : 12)) {
    safetyWarning = `A target body fat of ${targetBf}% approaches essential body fat levels (${sex === 'male' ? '3–5% for men' : '10–13% for women'}). Proceed with medical supervision.`;
  }

  return {
    isComplete,
    currentWeightKg: weightKg,
    currentWeightDisplay,
    currentBodyFat: currentBf,
    targetBodyFat: targetBf,
    leanBodyMassKg,
    leanBodyMassDisplay,
    targetWeightKg,
    targetWeightDisplay,
    fatToLoseKg,
    fatToLoseDisplay,
    bmr,
    tdee,
    dailyCalorieTarget,
    dailyDeficit: deficit,
    proteinTarget,
    carbsTarget,
    fatTarget,
    plannedWeeklyLossKg,
    plannedWeeklyLossDisplay,
    daysToGoal,
    estimatedGoalDate,
    progressPercent,
    safetyWarning,
  };
}

/**
 * Calculates 7-day rolling averages and weekly weight trend from weight logs.
 * Input logs can be in any order; returns sorted ascending by measured_at.
 */
export function computeWeightHistoryAndTrend(
  logs: WeightLog[],
  unit: UnitSystem
): {
  points: WeightPointWithRolling[];
  weeklyTrendDisplay: number | null;
  latestRollingKg: number | null;
} {
  if (!logs.length) {
    return { points: [], weeklyTrendDisplay: null, latestRollingKg: null };
  }

  const sorted = [...logs].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const SEVEN_DAYS_MS = 7 * 86400_000;

  const points: WeightPointWithRolling[] = sorted.map((entry, idx) => {
    const entryTime = new Date(entry.measured_at).getTime();
    const windowEntries: number[] = [];
    for (let j = idx; j >= 0; j--) {
      const t = new Date(sorted[j].measured_at).getTime();
      if (entryTime - t <= SEVEN_DAYS_MS) {
        windowEntries.push(sorted[j].weight_kg);
      } else {
        break;
      }
    }
    const avgKg = windowEntries.reduce((acc, v) => acc + v, 0) / windowEntries.length;
    return {
      ...entry,
      rolling_avg_kg: avgKg,
    };
  });

  const latest = points[points.length - 1];
  const latestTime = new Date(latest.measured_at).getTime();

  // Find a point between 4 and 28 days ago to calculate weekly rate of change
  let comparisonPoint: WeightPointWithRolling | null = null;
  for (let i = points.length - 2; i >= 0; i--) {
    const diffDays = (latestTime - new Date(points[i].measured_at).getTime()) / 86400_000;
    if (diffDays >= 5 && diffDays <= 28) {
      comparisonPoint = points[i];
      if (diffDays >= 7) break;
    }
  }

  // Fallback if entries are closer than 5 days but at least 2 days apart
  if (!comparisonPoint && points.length >= 2) {
    const first = points[0];
    const diffDays = (latestTime - new Date(first.measured_at).getTime()) / 86400_000;
    if (diffDays >= 1) {
      comparisonPoint = first;
    }
  }

  let weeklyTrendDisplay: number | null = null;
  if (comparisonPoint) {
    const diffDays = Math.max(1, (latestTime - new Date(comparisonPoint.measured_at).getTime()) / 86400_000);
    const deltaKgPerWeek = ((latest.rolling_avg_kg - comparisonPoint.rolling_avg_kg) / diffDays) * 7;
    weeklyTrendDisplay = round1(unit === 'imperial' ? kgToLb(deltaKgPerWeek) : deltaKgPerWeek);
  }

  return {
    points,
    weeklyTrendDisplay,
    latestRollingKg: latest.rolling_avg_kg,
  };
}

/**
 * Formats an ISO date in the user's configured timezone as YYYY-MM-DD
 */
export function getLocalDateString(isoTimestamp: string | Date, timezone: string = 'America/New_York'): string {
  try {
    const date = typeof isoTimestamp === 'string' ? new Date(isoTimestamp) : isoTimestamp;
    if (isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date); // 'en-CA' outputs YYYY-MM-DD
  } catch {
    const d = typeof isoTimestamp === 'string' ? new Date(isoTimestamp) : isoTimestamp;
    return d.toISOString().slice(0, 10);
  }
}

